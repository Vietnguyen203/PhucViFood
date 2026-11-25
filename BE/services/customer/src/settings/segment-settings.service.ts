import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { thresholdsFromSettings, type SegmentThresholds } from '@phucvi/shared-library/utils';
import { PrismaService } from '../prisma/prisma.service';

/** Các khóa ngưỡng phân loại khách (customer.settings). Khớp thresholdsFromSettings() của shared-library. */
export const SEGMENT_SETTING_KEYS = [
  'segment.returning_min_orders', 'segment.vip_min_orders', 'segment.vip_min_spend', 'activity.active_days', 'activity.at_risk_days',
] as const;

/** Ngưỡng phân loại khách, đọc từ DB, cache ngắn và xóa cache ngay khi admin đổi. */
@Injectable()
export class SegmentSettingsService {
  private cache: { at: number; value: SegmentThresholds } | null = null;
  private static readonly TTL_MS = 30_000;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async thresholds(): Promise<SegmentThresholds> {
    if (this.cache && Date.now() - this.cache.at < SegmentSettingsService.TTL_MS) return this.cache.value;
    const value = thresholdsFromSettings(await this.prisma.setting.findMany());
    this.cache = { at: Date.now(), value };
    return value;
  }

  async list() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: [...SEGMENT_SETTING_KEYS] } }, orderBy: { key: 'asc' } });
    return rows.map((r) => ({ key: r.key, value: r.value, description: r.description, updatedBy: r.updatedBy, updatedAt: r.updatedAt }));
  }

  /** Đổi một ngưỡng. Kiểm tra bộ ngưỡng SAU khi đổi còn hợp lệ (vd sắp rời phải từ hoạt động trở lên) trước khi lưu. */
  async update(key: string, value: number, adminId: string) {
    if (!(SEGMENT_SETTING_KEYS as readonly string[]).includes(key)) {
      throw AppException.notFound(`Không có cấu hình "${key}"; các khóa hợp lệ: ${SEGMENT_SETTING_KEYS.join(', ')}`);
    }
    const rows = await this.prisma.setting.findMany();
    const next = rows.map((r) => (r.key === key ? { key: r.key, value } : { key: r.key, value: r.value }));
    try {
      thresholdsFromSettings(next);
    } catch (e) {
      throw AppException.businessRule(e instanceof Error ? e.message : 'Cấu hình không hợp lệ');
    }
    const updated = await this.prisma.setting.update({ where: { key }, data: { value, updatedBy: adminId } });
    this.cache = null;
    return { key: updated.key, value: updated.value, description: updated.description, updatedBy: updated.updatedBy, updatedAt: updated.updatedAt };
  }
}
