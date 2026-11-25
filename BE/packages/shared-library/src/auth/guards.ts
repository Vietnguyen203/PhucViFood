import { CanActivate, DynamicModule, ExecutionContext, Inject, Injectable, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AppException } from '../api/errors';
import type { UserRole } from '../contracts/enums';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { assertJwtConfig, verifyAccessToken } from './jwt';
import type { AuthUser, JwtConfig } from './types';

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');

interface RequestLike { headers: Record<string, string | string[] | undefined>; user?: AuthUser }

/** Trích token từ header "Authorization: Bearer <token>". */
export function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value ? /^Bearer\s+(\S+)$/i.exec(value) : null;
  return match ? match[1] : null;
}

/** Guard toàn cục: yêu cầu access token hợp lệ, trừ route gắn @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly config: JwtConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<RequestLike>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) throw AppException.unauthorized();
    req.user = verifyAccessToken(token, this.config);
    return true;
  }
}

/** Guard toàn cục: kiểm tra vai trò khi route khai báo @Roles(...). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest<RequestLike>().user;
    if (!user) throw AppException.unauthorized();
    if (!roles.includes(user.role)) throw AppException.forbidden();
    return true;
  }
}

/** Đăng ký JwtAuthGuard + RolesGuard toàn cục. Mọi service import một lần với cùng cấu hình JWT. */
@Module({})
export class AuthGuardsModule {
  static forRoot(config: JwtConfig): DynamicModule {
    assertJwtConfig(config);
    return {
      module: AuthGuardsModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: config },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    };
  }
}
