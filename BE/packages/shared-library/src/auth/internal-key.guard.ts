import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../api/errors';

export const INTERNAL_KEY_HEADER = 'x-internal-key';

/** Token provider chứa khóa nội bộ (string). Mỗi service đăng ký: { provide: INTERNAL_API_KEY, useFactory: ... }. */
export const INTERNAL_API_KEY = Symbol('INTERNAL_API_KEY');

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * Bảo vệ API nội bộ giữa các service bằng khóa chung trong header `x-internal-key`.
 * Dùng cùng @Public() (bỏ qua JWT) vì người gọi là service khác, không phải người dùng.
 * So sánh băm bằng timingSafeEqual để không lộ khóa qua thời gian phản hồi.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(@Inject(INTERNAL_API_KEY) private readonly key: string) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = req.headers[INTERNAL_KEY_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (!provided || !timingSafeEqual(sha256(provided), sha256(this.key))) {
      throw AppException.unauthorized('Thiếu hoặc sai khóa nội bộ');
    }
    return true;
  }
}
