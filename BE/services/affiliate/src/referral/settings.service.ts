import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Đọc cấu hình số từ bảng affiliate.settings, có cache ngắn để không truy vấn mỗi request. */
@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, { value: number; expiresAt: number }>();
  private static readonly TTL_MS = 60_000;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getNumber(key: string, fallback: number): Promise<number> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const row = await this.prisma.affiliateSetting.findUnique({ where: { key } });
    const value = typeof row?.value === 'number' && Number.isFinite(row.value) ? row.value : fallback;
    this.cache.set(key, { value, expiresAt: Date.now() + SettingsService.TTL_MS });
    return value;
  }

  /** Số ngày cookie ghi nhận link CTV (mặc định 30). */
  cookieDays(): Promise<number> {
    return this.getNumber('cookie_days', 30);
  }
}
