import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export const INTERNAL_KEY_HEADER = 'x-internal-key';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * Bảo vệ API nội bộ giữa các service bằng khóa chung trong header `x-internal-key`.
 * Dùng cùng @Public() (bỏ qua JWT) vì người gọi là service khác, không phải người dùng.
 * So sánh băm bằng timingSafeEqual để không lộ khóa qua thời gian phản hồi.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = req.headers[INTERNAL_KEY_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (!provided || !timingSafeEqual(sha256(provided), sha256(this.config.internalApiKey))) {
      throw AppException.unauthorized('Thiếu hoặc sai khóa nội bộ');
    }
    return true;
  }
}
