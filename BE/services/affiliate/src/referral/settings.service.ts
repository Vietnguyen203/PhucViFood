import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { PrismaService } from '../prisma/prisma.service';

/** Cấu hình admin được sửa. `default_rate_bps` có trong bảng nhưng chưa được mã nào đọc (tỷ lệ mặc định lấy từ mặc định của cột), nên không cho sửa để khỏi gây hiểu nhầm. */
export const EDITABLE_SETTINGS: Record<string, { min: number; max: number; description: string }> = {
  cookie_days: { min: 1, max: 365, description: 'Số ngày cookie ghi nhận link CTV' },
};

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

  async listEditable() {
    const rows = await this.prisma.affiliateSetting.findMany({ where: { key: { in: Object.keys(EDITABLE_SETTINGS) } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(EDITABLE_SETTINGS).map(([key, rule]) => {
      const row = byKey.get(key);
      return { key, value: row?.value ?? null, description: row?.description ?? rule.description, updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt ?? null };
    });
  }

  async update(key: string, value: unknown, adminId: string) {
    const rule = EDITABLE_SETTINGS[key];
    if (!rule) throw AppException.notFound(`Không có cấu hình "${key}"; các khóa hợp lệ: ${Object.keys(EDITABLE_SETTINGS).join(', ')}`);
    if (typeof value !== 'number' || !Number.isInteger(value) || value < rule.min || value > rule.max) {
      throw AppException.validation([{ field: 'value', messages: [`value là số nguyên từ ${rule.min} đến ${rule.max}`] }]);
    }
    const saved = await this.prisma.affiliateSetting.upsert({
      where: { key },
      create: { key, value, description: rule.description, updatedBy: adminId },
      update: { value, updatedBy: adminId },
    });
    this.cache.delete(key); // áp dụng ngay trên bản này (các bản khác hết cache sau tối đa TTL_MS)
    return { key: saved.key, value: saved.value, description: saved.description, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt };
  }
}
