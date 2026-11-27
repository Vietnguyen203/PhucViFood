// TÊN enum dùng ở bên ngoài DB: API, JWT, sự kiện giữa các service.
// DB lưu mã số (SMALLINT) của cùng các giá trị này; mã số và codec nằm ở ./codes.ts.

export const OrderStatus = {
  PLACED: 'PLACED', CONFIRMED: 'CONFIRMED', SHIPPING: 'SHIPPING', DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', RETURNED: 'RETURNED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = { COD: 'COD', BANK_QR: 'BANK_QR' } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = { PENDING: 'PENDING', UNPAID: 'UNPAID', PAID: 'PAID', REFUNDED: 'REFUNDED' } as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const AttributionSource = { LINK: 'LINK', CODE: 'CODE' } as const;
export type AttributionSource = (typeof AttributionSource)[keyof typeof AttributionSource];

export const ReceivedBy = { CUSTOMER: 'CUSTOMER', ADMIN: 'ADMIN' } as const;
export type ReceivedBy = (typeof ReceivedBy)[keyof typeof ReceivedBy];

export const ActorType = { SYSTEM: 'SYSTEM', CUSTOMER: 'CUSTOMER', ADMIN: 'ADMIN' } as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const AffiliateStatus = { PENDING: 'PENDING', ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', REJECTED: 'REJECTED' } as const;
export type AffiliateStatus = (typeof AffiliateStatus)[keyof typeof AffiliateStatus];

export const CommissionStatus = { ESTIMATED: 'ESTIMATED', CONFIRMED: 'CONFIRMED', PAID: 'PAID', CANCELLED: 'CANCELLED' } as const;
export type CommissionStatus = (typeof CommissionStatus)[keyof typeof CommissionStatus];

/** PENDING: chờ trừ vào đợt chi sau; APPLIED: đã trừ; WAIVED: admin miễn trừ (công ty chịu). */
export const AdjustmentStatus = { PENDING: 'PENDING', APPLIED: 'APPLIED', WAIVED: 'WAIVED' } as const;
export type AdjustmentStatus = (typeof AdjustmentStatus)[keyof typeof AdjustmentStatus];

/** CUSTOMER: khách mua hàng có tài khoản (xem lịch sử đơn của mình). */
export const UserRole = { ADMIN: 'ADMIN', AFFILIATE: 'AFFILIATE', CUSTOMER: 'CUSTOMER' } as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const BannerSlot = { MAIN: 'MAIN', SIDE: 'SIDE' } as const;
export type BannerSlot = (typeof BannerSlot)[keyof typeof BannerSlot];

export const CreatorKind = { KOL: 'KOL', KOC: 'KOC' } as const;
export type CreatorKind = (typeof CreatorKind)[keyof typeof CreatorKind];

export const UserStatus = { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** Luồng trạng thái đơn hợp lệ. Dùng để chặn chuyển trạng thái sai ở tầng ứng dụng. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED', 'RETURNED'],
  COMPLETED: [],
  CANCELLED: [],
  RETURNED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}
