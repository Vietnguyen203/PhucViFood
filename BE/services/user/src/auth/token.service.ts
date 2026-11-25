import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { signAccessToken, type AuthUser } from '@phucvi/shared-library/auth';
import { UserRoleCodec, UserStatusCode } from '@phucvi/shared-library/contracts';
import { uuidv7 } from '@phucvi/shared-library/utils';
import type { Prisma } from '../../generated/client';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Thời hạn access token (giây). */
  expiresIn: number;
}

type Db = PrismaService | Prisma.TransactionClient;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const trim = (value: string | undefined, max: number) => (value ? value.slice(0, max) : undefined);
const invalidSession = () => AppException.unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');

/**
 * Cấp và xoay vòng refresh token.
 * - Chỉ lưu băm SHA-256; token gốc chỉ trả cho client một lần.
 * - Mỗi lần refresh thu hồi token cũ và cấp token mới cùng family.
 * - Dùng lại token đã thu hồi (nghi bị đánh cắp) => thu hồi cả family, buộc đăng nhập lại.
 */
@Injectable()
export class TokenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TokenService');
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    // Dọn token hết hạn mỗi giờ để bảng không phình.
    this.purgeTimer = setInterval(() => void this.purgeExpired().catch((e) => this.logger.warn(`Dọn token lỗi: ${e}`)), 3_600_000);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  /** Cấp cặp token mới. `familyId` bỏ trống nghĩa là phiên đăng nhập mới. */
  async issue(db: Db, user: AuthUser, ctx: RequestContext, familyId: string = uuidv7()): Promise<TokenPair & { refreshTokenId: string }> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenId = uuidv7();
    await db.refreshToken.create({
      data: {
        id: refreshTokenId, userId: user.id, familyId, tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.config.refreshTtlDays * 86_400_000),
        userAgent: trim(ctx.userAgent, 255), ipAddress: trim(ctx.ip, 64),
      },
    });
    return {
      accessToken: signAccessToken(user, this.config.jwt), refreshToken, refreshTokenId,
      tokenType: 'Bearer', expiresIn: this.config.jwt.accessTtlSeconds,
    };
  }

  async rotate(rawRefreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawRefreshToken) }, include: { user: true } });
    if (!row) throw invalidSession();

    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      this.logger.warn(`Phát hiện dùng lại refresh token đã thu hồi (user ${row.userId}); đã thu hồi cả family`);
      throw invalidSession();
    }
    if (row.expiresAt.getTime() <= Date.now()) throw invalidSession();
    if (row.user.status !== UserStatusCode.ACTIVE) throw invalidSession();

    const issued = await this.prisma.$transaction(async (tx) => {
      // Thu hồi nguyên tử: nếu hai yêu cầu dùng cùng một token song song, chỉ một yêu cầu thắng.
      const claimed = await tx.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (claimed.count === 0) {
        await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return null;
      }
      const authUser: AuthUser = { id: row.user.id, email: row.user.email, role: UserRoleCodec.toName(row.user.role) };
      const next = await this.issue(tx, authUser, ctx, row.familyId);
      await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.refreshTokenId } });
      return next;
    });
    if (!issued) throw invalidSession();

    const { refreshTokenId: _omit, ...pair } = issued;
    return pair;
  }

  /** Đăng xuất một phiên: thu hồi cả family của token này. Không lộ token có tồn tại hay không. */
  async revokeByToken(rawRefreshToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawRefreshToken) } });
    if (row) await this.revokeFamily(row.familyId);
  }

  revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAllForUser(userId: string, db: Db = this.prisma): Promise<unknown> {
    return db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Xóa token đã hết hạn quá 7 ngày. */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
    return count;
  }
}
