// Kiểu dữ liệu của khu vực cộng tác viên (API /me/*). Tiền là số nguyên VND.
import type { DailyPoint } from './admin/dashboard';
import type { AdminAffiliate } from './admin/types';

export type PartnerProfile = AdminAffiliate;
export interface PartnerLink { id: string; channelCode: string; label: string; isActive: boolean; path: string; createdAt: string }
export interface CommissionSummary {
  byStatus: Record<string, { count: number; amount: number }>;
  payable: number;
  pendingAdjustments: { count: number; amount: number };
}
export interface PartnerStats {
  range: { from: string; to: string };
  clicks: { total: number; uniqueVisitors: number; byChannel: Array<{ channelCode: string | null; clicks: number; visitors: number }> };
  events: Array<{ channelCode: string | null; type: 'PRODUCT_VIEW' | 'ADD_TO_CART' | 'CHECKOUT_START'; count: number }>;
}
export interface PartnerOrder {
  id: string; code: string; status: string; customer: string; channelCode: string | null; isSelfPurchase: boolean;
  subtotalAmount: number; shippingFee: number; totalAmount: number; placedAt: string; deliveredAt: string | null; completedAt: string | null;
  items?: Array<{ name: string; quantity: number; lineTotal: number }>;
}

export const EVENT_LABEL: Record<string, string> = { PRODUCT_VIEW: 'Xem sản phẩm', ADD_TO_CART: 'Thêm vào giỏ', CHECKOUT_START: 'Bắt đầu thanh toán' };

/** Link đầy đủ để chia sẻ từ đường dẫn backend trả (`/r/{mã}?c={kênh}`). */
export const shareUrl = (origin: string, path: string) => `${origin.replace(/\/+$/, '')}${path}`;

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const vnDay = (d: Date): string => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Hoa hồng phát sinh theo ngày (giờ Việt Nam) trong `days` ngày gần nhất tính đến hôm nay, đủ ngày liên tiếp (ngày không có là 0).
 * Bỏ hoa hồng đã hủy. `revenue` của điểm là tổng tiền hoa hồng (dùng chung kiểu với biểu đồ doanh thu của admin), `orders` là số khoản.
 */
export function commissionsByDay(items: Array<{ createdAt: string; amount: number; status: string }>, days: number, now: Date = new Date()): DailyPoint[] {
  const today = Date.parse(`${vnDay(now)}T00:00:00Z`);
  const points = new Map<string, DailyPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today - i * DAY_MS).toISOString().slice(0, 10);
    points.set(date, { date, orders: 0, revenue: 0 });
  }
  for (const c of items) {
    if (c.status === 'CANCELLED') continue;
    const p = points.get(vnDay(new Date(c.createdAt)));
    if (p) { p.orders += 1; p.revenue += c.amount; }
  }
  return [...points.values()];
}
