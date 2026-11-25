import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '../contracts/enums';
import type { AuthUser } from './types';

export const IS_PUBLIC_KEY = 'phucvi:isPublic';
export const ROLES_KEY = 'phucvi:roles';

/** Cho phép gọi không cần đăng nhập. Mặc định MỌI route đều yêu cầu JWT (an toàn theo mặc định). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Chỉ cho các vai trò này. Gắn lên class hoặc method. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Lấy người dùng đã xác thực: `me(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
