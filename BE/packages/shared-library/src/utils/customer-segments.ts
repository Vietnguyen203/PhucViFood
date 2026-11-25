/**
 * Phân loại khách TÍNH KHI TRUY VẤN, không lưu cột.
 * Thống kê đơn nằm ở service ordering; service customer lấy qua API nội bộ rồi gọi hàm này
 * cùng ngưỡng đọc từ bảng customer.settings (không join chéo database).
 */

/** Đơn ở các trạng thái này không tính vào thống kê khách. */
export const ORDER_STATUSES_EXCLUDED_FROM_STATS = ['CANCELLED', 'RETURNED'] as const;

export interface CustomerOrderStats {
  /** Số đơn hợp lệ (không phải CANCELLED hoặc RETURNED). */
  validOrders: number;
  /** Tổng tiền các đơn hợp lệ (VND, gồm phí ship). */
  totalSpent: number;
  lastOrderAt: Date | null;
}

export interface SegmentThresholds {
  /** Từ số đơn này trở lên là khách quen. */
  returningMinOrders: number;
  /** Từ số đơn này, hoặc từ tổng chi tiêu `vipMinSpend`, là VIP. */
  vipMinOrders: number;
  vipMinSpend: number;
  /** Đơn gần nhất trong N ngày: hoạt động. */
  activeDays: number;
  /** Đơn gần nhất trong N ngày: sắp rời; quá mức này là đã rời. */
  atRiskDays: number;
}

export type CustomerTier = 'NEW' | 'RETURNING' | 'VIP';
export type CustomerActivity = 'NONE' | 'ACTIVE' | 'AT_RISK' | 'CHURNED';

const DAY_MS = 86_400_000;

export function classifyCustomer(
  stats: CustomerOrderStats,
  t: SegmentThresholds,
  now: Date = new Date(),
): { tier: CustomerTier; activity: CustomerActivity } {
  const tier: CustomerTier =
    stats.validOrders >= t.vipMinOrders || stats.totalSpent >= t.vipMinSpend ? 'VIP'
      : stats.validOrders >= t.returningMinOrders ? 'RETURNING'
        : 'NEW';

  let activity: CustomerActivity;
  if (!stats.lastOrderAt) activity = 'NONE';
  else {
    const age = now.getTime() - stats.lastOrderAt.getTime();
    activity = age <= t.activeDays * DAY_MS ? 'ACTIVE' : age <= t.atRiskDays * DAY_MS ? 'AT_RISK' : 'CHURNED';
  }
  return { tier, activity };
}

const SETTING_KEYS: Record<keyof SegmentThresholds, string> = {
  returningMinOrders: 'segment.returning_min_orders',
  vipMinOrders: 'segment.vip_min_orders',
  vipMinSpend: 'segment.vip_min_spend',
  activeDays: 'activity.active_days',
  atRiskDays: 'activity.at_risk_days',
};

/** Đọc ngưỡng từ các dòng bảng customer.settings. Thiếu hoặc sai kiểu thì báo lỗi, không dùng giá trị đoán. */
export function thresholdsFromSettings(rows: ReadonlyArray<{ key: string; value: unknown }>): SegmentThresholds {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as SegmentThresholds;
  for (const [field, key] of Object.entries(SETTING_KEYS) as Array<[keyof SegmentThresholds, string]>) {
    const v = byKey.get(key);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Cấu hình khách "${key}" thiếu hoặc không phải số không âm`);
    out[field] = v;
  }
  if (out.atRiskDays < out.activeDays) throw new Error('activity.at_risk_days phải lớn hơn hoặc bằng activity.active_days');
  return out;
}
