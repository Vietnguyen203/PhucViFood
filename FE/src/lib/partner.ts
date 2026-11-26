// Kiểu dữ liệu của khu vực cộng tác viên (API /me/*). Tiền là số nguyên VND.
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
