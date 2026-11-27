import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { UserStatusCode } from '@phucvi/shared-library/contracts';
import { emailButton, emailLayout, escapeHtml, MAILER, sendSafely, type Mailer, type MailMessage } from '@phucvi/shared-library/mail';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password';
import { TokenService } from './token.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const HOUR_MS = 3_600_000;

/** Thư đặt lại mật khẩu. `link` là địa chỉ trang đặt lại kèm token dùng một lần. */
export function buildResetMail(to: string, link: string, ttlMinutes: number): MailMessage {
  const bodyHtml = `<p style="margin:0 0 12px">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <b>${escapeHtml(to)}</b>.</p>
${emailButton(link, 'Đặt lại mật khẩu')}
<p style="margin:0 0 8px;font-size:14px">Liên kết có hiệu lực trong ${ttlMinutes} phút và chỉ dùng được một lần.</p>
<p style="margin:0;font-size:12px;color:#826d69">Nếu bạn không yêu cầu, hãy bỏ qua thư này: mật khẩu của bạn vẫn giữ nguyên.</p>`;
  const text = `Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ${to}.\n\nĐặt lại mật khẩu: ${link}\n\nLiên kết có hiệu lực trong ${ttlMinutes} phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua thư này.`;
  return { to, subject: 'Phúc Vị Foods: đặt lại mật khẩu', text, html: emailLayout({ title: 'Đặt lại mật khẩu', bodyHtml }) };
}

/**
 * Quên mật khẩu qua email. Yêu cầu luôn trả cùng một kết quả dù email có tài khoản hay không (không lộ email nào đã đăng ký).
 * Token ngẫu nhiên 256 bit chỉ lưu băm SHA-256, hết hạn sau resetTtlMinutes, dùng một lần; đặt lại xong mọi phiên đăng nhập bị thu hồi.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Tạo token và gửi thư nếu email có tài khoản đang hoạt động và chưa vượt giới hạn mỗi giờ. Không bao giờ báo email có tồn tại hay không. */
  async request(email: string): Promise<{ sent: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatusCode.ACTIVE) return { sent: true };

    const recent = await this.prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - HOUR_MS) } } });
    if (recent >= this.config.resetMaxPerHour) return { sent: true }; // chống spam hộp thư người khác

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + this.config.resetTtlMinutes * 60_000) },
    });
    const link = `${this.config.mail.publicBaseUrl}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
    // Gửi nền: thời gian phản hồi không khác nhau giữa email có và không có tài khoản.
    void sendSafely(this.mailer, buildResetMail(user.email, link, this.config.resetTtlMinutes), (e) => this.logger.warn(`Không gửi được thư đặt lại mật khẩu: ${e instanceof Error ? e.message : e}`));
    return { sent: true };
  }

  /** Đặt mật khẩu mới bằng token trong thư. Token sai, hết hạn hoặc đã dùng thì báo chung một lỗi. */
  async reset(token: string, newPassword: string): Promise<{ reset: true }> {
    const invalid = () => AppException.validation([{ field: 'token', messages: ['Liên kết không hợp lệ hoặc đã hết hạn, vui lòng yêu cầu lại'] }]);
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now() || row.user.status !== UserStatusCode.ACTIVE) throw invalid();

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      // Nguyên tử: chỉ một yêu cầu dùng được token (hai yêu cầu song song thì một bên thất bại).
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count === 0) throw invalid();
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
      await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }); // các thư cũ cũng vô hiệu
      await this.tokens.revokeAllForUser(row.userId, tx);
    });
    return { reset: true };
  }
}
