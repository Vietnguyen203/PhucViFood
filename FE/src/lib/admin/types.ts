// Kiểu dữ liệu của API quản trị (tiền là số nguyên VND; enum là tên chuỗi).
export interface AdminCategory { id: string; name: string; slug: string; sortOrder: number; isActive: boolean; createdAt: string }

export interface AdminProduct {
  id: string; categoryId: string | null; category: { id: string; name: string; slug: string } | null;
  name: string; slug: string; sku: string | null; description: string | null; unit: string | null;
  price: number; originalPrice: number | null; discountPercent: number | null; imageUrl: string | null;
  stockQuantity: number; isVisible: boolean; createdAt: string; updatedAt: string;
}

export interface StockMovement {
  id: string; productId: string; reason: string; delta: number; orderId: string | null; note: string | null; createdBy?: string | null; createdAt: string;
}

export type OrderStatus = "PLACED" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "COMPLETED" | "CANCELLED" | "RETURNED";
export type PaymentStatus = "PENDING" | "UNPAID" | "PAID" | "REFUNDED";
export type PaymentMethod = "COD" | "BANK_QR";

export interface AdminOrder {
  id: string; code: string; customerId: string | null; status: OrderStatus; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus;
  subtotalAmount: number; shippingFee: number; totalAmount: number;
  attribution: { affiliateId: string | null; linkId: string | null; channelCode: string | null; referralCodeUsed: string | null; source: string | null; isSelfPurchase: boolean };
  shipping: { name: string; phone: string; province: string; ward: string; addressLine: string };
  customerNote: string | null; placedAt: string; paymentDueAt: string | null; deliveredAt: string | null; completedAt: string | null; cancelledAt: string | null; returnedAt: string | null;
  receivedBy: string | null; cancelReason: string | null;
  items?: Array<{ productId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }>;
  history?: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; actorType: string; actorId: string | null; note: string | null; at: string }>;
  careNotes?: Array<{ id: string; note: string; contactChannel: string | null; contactedAt: string; createdBy: string | null }>;
}

export type AffiliateStatus = "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | string;
export interface AdminAffiliate {
  id: string; userId: string; fullName: string; phone: string; referralCode: string; status: AffiliateStatus;
  contractStart: string | null; contractEnd: string | null; commissionRateBps: number | null;
  bankName: string | null; bankAccountNo: string | null; bankAccountHolder: string | null; approvedAt: string | null; note: string | null; createdAt: string;
}

export type CommissionStatus = "ESTIMATED" | "CONFIRMED" | "PAID" | "CANCELLED" | string;
export interface AdminCommission {
  id: string; orderId: string; orderCode: string; affiliateId: string; linkId: string | null; channelCode: string | null;
  rateBps: number; baseAmount: number; amount: number; status: CommissionStatus;
  confirmedAt: string | null; confirmedBy: string | null; paidAt: string | null; payoutId: string | null; cancelledAt: string | null; cancelReason: string | null; createdAt: string;
  adjustment?: { id: string; status: string; amount: number } | null;
}

export interface AdminPayout {
  id: string; affiliateId: string; totalAmount: number; adjustmentAmount: number; paidAt: string; paymentReference: string | null; note: string | null; createdBy: string | null; createdAt: string;
  commissions?: Array<{ id: string; orderCode: string; amount: number }>;
  adjustments?: Array<{ id: string; orderCode: string; amount: number }>;
}

export interface AdminAdjustment {
  id: string; commissionId: string; orderId: string; orderCode: string; affiliateId: string; amount: number; reason: string; status: "PENDING" | "APPLIED" | "WAIVED";
  appliedPayoutId: string | null; appliedAt: string | null; waivedAt: string | null; waivedBy: string | null; waiveReason: string | null; createdAt: string;
}

export interface AdminCustomer {
  id: string; phone: string; fullName: string; email: string | null; province: string | null; ward: string | null; addressLine: string | null;
  firstSource: { affiliateId: string | null; channelCode: string | null }; marketingConsent: boolean; consentAt: string | null; consentWithdrawnAt: string | null; createdAt: string;
  statsAvailable?: boolean; orders?: { validOrders: number; totalSpent: number; lastOrderAt: string | null } | null; tier?: string | null; activity?: string | null;
}


export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "Mới đặt", CONFIRMED: "Đã xác nhận", SHIPPING: "Đang giao", DELIVERED: "Đã giao", COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy", RETURNED: "Hoàn trả",
};
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { PENDING: "Thu khi giao (COD)", UNPAID: "Chờ chuyển khoản", PAID: "Đã thanh toán", REFUNDED: "Đã hoàn tiền" };
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { COD: "COD", BANK_QR: "Chuyển khoản" };
export const AFFILIATE_STATUS_LABEL: Record<string, string> = { PENDING: "Chờ duyệt", ACTIVE: "Đang hoạt động", REJECTED: "Từ chối", SUSPENDED: "Tạm ngưng" };
export const COMMISSION_STATUS_LABEL: Record<string, string> = { ESTIMATED: "Tạm tính", CONFIRMED: "Đã xác nhận", PAID: "Đã chi trả", CANCELLED: "Đã hủy" };
export const ADJUSTMENT_STATUS_LABEL: Record<string, string> = { PENDING: "Chờ trừ", APPLIED: "Đã trừ", WAIVED: "Đã miễn" };
export const TIER_LABEL: Record<string, string> = { NEW: "Mới", RETURNING: "Quay lại", VIP: "VIP" };
export const ACTIVITY_LABEL: Record<string, string> = { NONE: "Chưa mua", ACTIVE: "Đang hoạt động", AT_RISK: "Có nguy cơ rời bỏ", CHURNED: "Đã rời bỏ" };
export const CARE_CHANNEL_LABEL: Record<string, string> = { CALL: "Điện thoại", ZALO: "Zalo", SMS: "SMS" };

/** Hành động chuyển trạng thái đơn hợp lệ ở mỗi trạng thái (khớp máy trạng thái của backend). */
export const ORDER_TRANSITIONS: Record<OrderStatus, Array<{ action: "confirm" | "ship" | "deliver" | "complete" | "cancel" | "return"; label: string; needsReason?: boolean; danger?: boolean }>> = {
  PLACED: [{ action: "confirm", label: "Xác nhận đơn" }, { action: "cancel", label: "Hủy đơn", needsReason: true, danger: true }],
  CONFIRMED: [{ action: "ship", label: "Giao cho vận chuyển" }, { action: "cancel", label: "Hủy đơn", needsReason: true, danger: true }],
  SHIPPING: [{ action: "deliver", label: "Đã giao hàng" }, { action: "cancel", label: "Hủy đơn", needsReason: true, danger: true }],
  DELIVERED: [{ action: "complete", label: "Hoàn tất đơn" }, { action: "return", label: "Hoàn trả", needsReason: true, danger: true }],
  COMPLETED: [],
  CANCELLED: [], RETURNED: [],
};

export const STOCK_REASON_LABEL: Record<string, string> = { ORDER_PLACED: "Đặt hàng", ORDER_CANCELLED: "Hủy đơn (hoàn kho)", ADMIN_ADJUSTMENT: "Admin điều chỉnh" };

export interface AdminUser { id: string; email: string; role: string; status: string; createdAt: string; lastLoginAt: string | null }
export const USER_ROLE_LABEL: Record<string, string> = { ADMIN: "Quản trị viên", AFFILIATE: "Cộng tác viên", CUSTOMER: "Khách hàng" };
export const USER_STATUS_LABEL: Record<string, string> = { ACTIVE: "Hoạt động", DISABLED: "Đã khóa" };

export type BannerSlot = "MAIN" | "SIDE";
export interface AdminBanner {
  id: string; title: string; imageUrl: string; linkUrl: string | null; slot: BannerSlot; sortOrder: number; isActive: boolean;
  startsAt: string | null; endsAt: string | null; createdAt: string;
}
export const BANNER_SLOT_LABEL: Record<BannerSlot, string> = { MAIN: "Khung lớn (bên trái)", SIDE: "Ô khuyến mãi (bên phải)" };

export type CreatorKind = "KOL" | "KOC";
export interface AdminCreator { id: string; name: string; kind: CreatorKind; headline: string | null; imageUrl: string; linkUrl: string | null; sortOrder: number; isActive: boolean; createdAt: string }
export const CREATOR_KIND_OPTIONS: Record<CreatorKind, string> = { KOL: "KOL (người có tầm ảnh hưởng)", KOC: "KOC (khách hàng chia sẻ)" };

export interface AdminVideo { id: string; title: string; videoUrl: string; sortOrder: number; isActive: boolean; createdAt: string }
