import { Inject, Injectable } from '@nestjs/common';
import { AppException, ErrorCode } from '@phucvi/shared-library/api';
import type { AuthUser } from '@phucvi/shared-library/auth';
import {
  EventTypes, UserRoleCode, UserRoleCodec, UserStatusCode, UserStatusCodec, type UserRole, type UserStatus,
} from '@phucvi/shared-library/contracts';
import { OutboxService } from '@phucvi/shared-library/messaging';
import type { User } from '../../generated/client';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from './dto';
import { PasswordService } from './password';
import { RequestContext, TokenPair, TokenService } from './token.service';

export interface PublicUser {
  id: string;
  email: string;
  /** Tên chuỗi (ADMIN, AFFILIATE); DB lưu mã số. */
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id, email: u.email, role: UserRoleCodec.toName(u.role), status: UserStatusCodec.toName(u.status),
  createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
});

export const toAuthUser = (u: Pick<User, 'id' | 'email' | 'role'>): AuthUser => ({
  id: u.id, email: u.email, role: UserRoleCodec.toName(u.role),
});

// Cùng một thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào có tài khoản.
const invalidCredentials = () => AppException.unauthorized('Email hoặc mật khẩu không đúng');

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Đăng ký tài khoản CTV. Hồ sơ CTV (họ tên, SĐT) do service affiliate tạo sau khi nhận sự kiện user.user.created. */
  async register(dto: RegisterDto, ctx: RequestContext): Promise<{ user: PublicUser } & TokenPair> {
    const passwordHash = await this.passwords.hash(dto.password);
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email: dto.email, passwordHash, role: UserRoleCode.AFFILIATE } });
        await this.outbox.add('user', tx, {
          type: EventTypes.USER_CREATED, aggregateType: 'User', aggregateId: created.id,
          payload: { userId: created.id, email: created.email, role: UserRoleCodec.toName(created.role) },
        });
        return created;
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw AppException.conflict('Email đã được đăng ký');
      throw e;
    }
    const issued = await this.tokens.issue(this.prisma, toAuthUser(user), ctx);
    return { user: toPublicUser(user), ...this.stripId(issued) };
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<{ user: PublicUser } & TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await this.passwords.verifyAgainstDummy(dto.password);
      throw invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppException(ErrorCode.TOO_MANY_REQUESTS, 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần, vui lòng thử lại sau');
    }

    if (!(await this.passwords.verify(dto.password, user.passwordHash))) {
      await this.recordFailedLogin(user);
      throw invalidCredentials();
    }
    // Kiểm tra trạng thái SAU khi mật khẩu đúng, để chỉ chủ tài khoản biết tài khoản bị vô hiệu hóa.
    if (user.status !== UserStatusCode.ACTIVE) throw AppException.forbidden('Tài khoản đã bị vô hiệu hóa');

    const updated = await this.prisma.user.update({
      where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });
    const issued = await this.tokens.issue(this.prisma, toAuthUser(updated), ctx);
    return { user: toPublicUser(updated), ...this.stripId(issued) };
  }

  private async recordFailedLogin(user: User): Promise<void> {
    // Tăng nguyên tử, không đọc rồi ghi, để các lần thử song song không né được giới hạn.
    const { failedLoginAttempts } = await this.prisma.user.update({
      where: { id: user.id }, data: { failedLoginAttempts: { increment: 1 } }, select: { failedLoginAttempts: true },
    });
    if (failedLoginAttempts >= this.config.maxFailedLogins) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + this.config.lockMinutes * 60_000) },
      });
    }
  }

  refresh(dto: RefreshDto, ctx: RequestContext): Promise<TokenPair> {
    return this.tokens.rotate(dto.refreshToken, ctx);
  }

  async logout(dto: RefreshDto): Promise<{ loggedOut: true }> {
    await this.tokens.revokeByToken(dto.refreshToken);
    return { loggedOut: true };
  }

  async logoutAll(userId: string): Promise<{ loggedOut: true }> {
    await this.tokens.revokeAllForUser(userId);
    return { loggedOut: true };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // Tài khoản bị xóa hoặc vô hiệu hóa thì access token còn hạn cũng không dùng được ở đây.
    if (!user || user.status !== UserStatusCode.ACTIVE) throw AppException.unauthorized();
    return toPublicUser(user);
  }

  /** Đổi mật khẩu: thu hồi mọi phiên cũ và cấp cặp token mới cho phiên hiện tại. */
  async changePassword(userId: string, dto: ChangePasswordDto, ctx: RequestContext): Promise<{ user: PublicUser } & TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatusCode.ACTIVE) throw AppException.unauthorized();
    if (!(await this.passwords.verify(dto.currentPassword, user.passwordHash))) {
      throw AppException.validation([{ field: 'currentPassword', messages: ['mật khẩu hiện tại không đúng'] }]);
    }
    if (dto.newPassword === dto.currentPassword) {
      throw AppException.validation([{ field: 'newPassword', messages: ['mật khẩu mới phải khác mật khẩu hiện tại'] }]);
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    const { updated, issued } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
      await this.tokens.revokeAllForUser(userId, tx);
      return { updated, issued: await this.tokens.issue(tx, toAuthUser(updated), ctx) };
    });
    return { user: toPublicUser(updated), ...this.stripId(issued) };
  }

  private stripId({ refreshTokenId: _omit, ...pair }: TokenPair & { refreshTokenId: string }): TokenPair {
    return pair;
  }
}
