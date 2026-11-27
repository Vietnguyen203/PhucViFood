import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import {
  EventTypes, UserRoleCode, UserRoleCodec, UserStatusCode, UserStatusCodec,
} from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { OutboxService } from '@phucvi/shared-library/messaging';
import type { User } from '../../generated/client';
import { toPublicUser } from '../auth/auth.service';
import { PasswordService } from '../auth/password';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto';

export const USERS_SERVICE = Symbol('USERS_SERVICE');

/** CRUD người dùng cho ADMIN, kế thừa CRUD chung và thêm quy tắc nghiệp vụ. */
@Injectable()
export class UsersService extends PrismaCrudService<User, CreateUserDto, UpdateUserDto> {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super(prisma.user, {
      label: 'Người dùng',
      sortableFields: ['createdAt', 'email', 'lastLoginAt'],
      // Client lọc bằng TÊN (?filter[role]=ADMIN); truy vấn DB bằng mã số.
      filterableFields: { role: { codec: UserRoleCodec }, status: { codec: UserStatusCodec } },
      searchableFields: ['email'],
    });
  }

  /** Không bao giờ trả băm mật khẩu hay trạng thái khóa nội bộ ra ngoài; role và status trả bằng tên. */
  protected override toResponse(user: User) {
    return toPublicUser(user);
  }

  override async create(dto: CreateUserDto) {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email: dto.email, passwordHash, role: UserRoleCodec.toCode(dto.role) } });
        await this.outbox.add('user', tx, {
          type: EventTypes.USER_CREATED, aggregateType: 'User', aggregateId: created.id,
          payload: { userId: created.id, email: created.email, role: UserRoleCodec.toName(created.role) },
        });
        return created;
      });
      return toPublicUser(user);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw AppException.conflict('Email đã được đăng ký');
      throw e;
    }
  }

  /** Admin đặt lại mật khẩu người khác: thu hồi mọi phiên, gỡ khóa đăng nhập sai. Tài khoản của chính mình dùng /auth/change-password. */
  async resetPassword(adminId: string, id: string, dto: ResetPasswordDto) {
    if (adminId === id) throw AppException.businessRule('Hãy dùng chức năng đổi mật khẩu cho tài khoản của chính bạn');
    await this.findOrThrow(id);
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
      await this.tokens.revokeAllForUser(id, tx);
    });
    return { reset: true as const };
  }

  override async update(id: string, dto: UpdateUserDto) {
    const target = await this.findOrThrow(id);
    const newRole = dto.role === undefined ? undefined : UserRoleCodec.toCode(dto.role);
    const newStatus = dto.status === undefined ? undefined : UserStatusCodec.toCode(dto.status);

    const losesAdmin =
      target.role === UserRoleCode.ADMIN && target.status === UserStatusCode.ACTIVE &&
      ((newRole !== undefined && newRole !== UserRoleCode.ADMIN) || (newStatus !== undefined && newStatus !== UserStatusCode.ACTIVE));
    if (losesAdmin) {
      const others = await this.prisma.user.count({ where: { role: UserRoleCode.ADMIN, status: UserStatusCode.ACTIVE, id: { not: id } } });
      if (others === 0) throw AppException.businessRule('Không thể vô hiệu hóa hoặc hạ quyền quản trị viên cuối cùng');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { role: newRole, status: newStatus } });
      // Vô hiệu hóa hoặc đổi vai trò: buộc đăng nhập lại để phiên cũ không giữ quyền cũ lâu hơn hạn access token.
      if (newStatus === UserStatusCode.DISABLED || (newRole !== undefined && newRole !== target.role)) {
        await this.tokens.revokeAllForUser(id, tx);
      }
      return user;
    });
    return toPublicUser(updated);
  }
}
