import {
  ActorTypeCodec, AttributionSourceCodec, ContactChannelCodec, OrderStatusCodec, PaymentMethodCodec, PaymentStatusCodec, ReceivedByCodec,
} from '@phucvi/shared-library/contracts';
import { maskCustomerName } from '@phucvi/shared-library/utils';
import type { CareNote, Order, OrderItem, OrderStatusHistory } from '../../generated/client';

export type OrderFull = Order & { items?: OrderItem[]; history?: OrderStatusHistory[]; careNotes?: CareNote[] };

const itemView = (i: OrderItem) => ({
  productId: i.productId, name: i.productName, unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: i.lineTotal,
});

const historyView = (h: OrderStatusHistory) => ({
  fromStatus: OrderStatusCodec.toNameOrNull(h.fromStatus), toStatus: OrderStatusCodec.toName(h.toStatus),
  actorType: ActorTypeCodec.toName(h.actorType), actorId: h.actorId, note: h.note, at: h.createdAt,
});

const careNoteView = (n: CareNote) => ({
  id: n.id, note: n.note, contactChannel: ContactChannelCodec.toNameOrNull(n.contactChannel), contactedAt: n.contactedAt, createdBy: n.createdBy,
});

/** Dữ liệu cho ADMIN: đầy đủ, gồm SĐT, địa chỉ và ghi nhận CTV. */
export function toAdminView(o: OrderFull) {
  return {
    id: o.id,
    code: o.code,
    customerId: o.customerId,
    status: OrderStatusCodec.toName(o.status),
    paymentMethod: PaymentMethodCodec.toName(o.paymentMethod),
    paymentStatus: PaymentStatusCodec.toName(o.paymentStatus),
    subtotalAmount: o.subtotalAmount, shippingFee: o.shippingFee, totalAmount: o.totalAmount,
    attribution: {
      affiliateId: o.affiliateId, linkId: o.linkId, channelCode: o.channelCode, referralCodeUsed: o.referralCodeUsed,
      source: AttributionSourceCodec.toNameOrNull(o.attributionSource), isSelfPurchase: o.isSelfPurchase,
    },
    shipping: { name: o.shipName, phone: o.shipPhone, province: o.shipProvince, ward: o.shipWard, addressLine: o.shipAddressLine },
    customerNote: o.customerNote,
    placedAt: o.placedAt, paymentDueAt: o.paymentDueAt, deliveredAt: o.deliveredAt, completedAt: o.completedAt, cancelledAt: o.cancelledAt, returnedAt: o.returnedAt,
    receivedBy: ReceivedByCodec.toNameOrNull(o.receivedBy), cancelReason: o.cancelReason,
    ...(o.items ? { items: o.items.map(itemView) } : {}),
    ...(o.history ? { history: [...o.history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(historyView) } : {}),
    ...(o.careNotes ? { careNotes: [...o.careNotes].sort((a, b) => a.contactedAt.getTime() - b.contactedAt.getTime()).map(careNoteView) } : {}),
  };
}

export interface BankAccount { bankName: string; accountNo: string; accountHolder: string }

/** Hướng dẫn chuyển khoản QR: nội dung chuyển khoản là mã đơn để admin đối soát. */
export function transferInstructions(o: Order, bank: BankAccount | null) {
  const isQr = PaymentMethodCodec.toName(o.paymentMethod) === 'BANK_QR';
  const unpaid = PaymentStatusCodec.toName(o.paymentStatus) === 'UNPAID';
  if (!isQr || !unpaid || !bank) return undefined;
  // dueAt: quá hạn này chưa thanh toán thì đơn tự bị hủy và hàng được trả về kho.
  return { ...bank, amount: o.totalAmount, content: o.code, dueAt: o.paymentDueAt };
}

/** Đơn VNPay chưa thanh toán: cho phép khách thanh toán (hoặc thanh toán lại) đến hết hạn. */
export function onlinePayment(o: Order) {
  const unpaid = PaymentStatusCodec.toName(o.paymentStatus) === 'UNPAID';
  if (PaymentMethodCodec.toName(o.paymentMethod) !== 'VNPAY' || !unpaid) return undefined;
  return { provider: 'VNPAY' as const, dueAt: o.paymentDueAt };
}

/** Dữ liệu cho khách tra cứu bằng mã đơn + SĐT: chỉ những gì khách đã biết, không có ghi nhận CTV hay ghi chú nội bộ. */
export function toPublicView(o: OrderFull, bank: BankAccount | null) {
  return {
    code: o.code,
    status: OrderStatusCodec.toName(o.status),
    paymentMethod: PaymentMethodCodec.toName(o.paymentMethod),
    paymentStatus: PaymentStatusCodec.toName(o.paymentStatus),
    subtotalAmount: o.subtotalAmount, shippingFee: o.shippingFee, totalAmount: o.totalAmount,
    shipping: { name: o.shipName, phone: o.shipPhone, province: o.shipProvince, ward: o.shipWard, addressLine: o.shipAddressLine },
    placedAt: o.placedAt, deliveredAt: o.deliveredAt, completedAt: o.completedAt, cancelledAt: o.cancelledAt,
    ...(o.items ? { items: o.items.map(itemView) } : {}),
    ...(o.history
      ? { history: [...o.history].filter((h) => h.fromStatus !== h.toStatus).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((h) => ({ status: OrderStatusCodec.toName(h.toStatus), at: h.createdAt })) }
      : {}),
    transferInstructions: transferInstructions(o, bank),
    onlinePayment: onlinePayment(o),
  };
}

/** Dữ liệu cho CTV: chỉ tên viết tắt của khách, không có SĐT hay địa chỉ. */
export function toAffiliateView(o: OrderFull) {
  return {
    id: o.id,
    code: o.code,
    status: OrderStatusCodec.toName(o.status),
    customer: maskCustomerName(o.shipName),
    channelCode: o.channelCode,
    isSelfPurchase: o.isSelfPurchase,
    subtotalAmount: o.subtotalAmount, shippingFee: o.shippingFee, totalAmount: o.totalAmount,
    placedAt: o.placedAt, deliveredAt: o.deliveredAt, completedAt: o.completedAt,
    ...(o.items ? { items: o.items.map((i) => ({ name: i.productName, quantity: i.quantity, lineTotal: i.lineTotal })) } : {}),
  };
}
