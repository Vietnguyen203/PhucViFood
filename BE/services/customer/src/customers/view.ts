import { classifyCustomer, type CustomerOrderStats, type SegmentThresholds } from '@phucvi/shared-library/utils';
import type { Customer } from '../../generated/client';

export const toCustomerView = (c: Customer) => ({
  id: c.id,
  phone: c.phone,
  fullName: c.fullName,
  email: c.email,
  province: c.province,
  ward: c.ward,
  addressLine: c.addressLine,
  firstSource: { affiliateId: c.firstAffiliateId, channelCode: c.firstChannelCode },
  marketingConsent: c.marketingConsent,
  consentAt: c.consentAt,
  consentWithdrawnAt: c.consentWithdrawnAt,
  createdAt: c.createdAt,
});

export const EMPTY_STATS: CustomerOrderStats = { validOrders: 0, totalSpent: 0, lastOrderAt: null };

/**
 * Khách kèm thống kê đơn và phân loại (tính tại thời điểm truy vấn, không lưu).
 * `stats` null nghĩa là không lấy được thống kê (ordering lỗi): thông tin khách vẫn trả, phần phân loại để trống.
 */
export function withClassification(c: Customer, stats: CustomerOrderStats | null, thresholds: SegmentThresholds, now = new Date()) {
  if (!stats) return { ...toCustomerView(c), statsAvailable: false as const, orders: null, tier: null, activity: null };
  const { tier, activity } = classifyCustomer(stats, thresholds, now);
  return { ...toCustomerView(c), statsAvailable: true as const, orders: stats, tier, activity };
}

export type CustomerWithClass = ReturnType<typeof withClassification>;
