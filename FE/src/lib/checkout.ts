import type { CartState } from './cart';
import type { StoredReferral } from './referral';
import { toOrderCookie } from './referral';
import type { OrderCookie, PaymentMethod } from './types';

export interface CheckoutForm {
  fullName: string;
  phone: string;
  email: string;
  province: string;
  ward: string;
  addressLine: string;
  note: string;
  paymentMethod: PaymentMethod;
  /** Mã CTV khách tự nhập (ưu tiên hơn link đã bấm). */
  referralCode: string;
  marketingConsent: boolean;
}

export const EMPTY_CHECKOUT: CheckoutForm = {
  fullName: '', phone: '', email: '', province: '', ward: '', addressLine: '', note: '', paymentMethod: 'COD', referralCode: '', marketingConsent: false,
};

export type CheckoutErrors = Partial<Record<keyof CheckoutForm | 'items', string>>;

/**
 * Chuẩn hóa SĐT Việt Nam về +84xxxxxxxxx, giống backend (chấp nhận "0912 345 678", "+84 912-345-678", "84912345678", "912345678").
 * Trả về null nếu không hợp lệ.
 */
export function normalizeVnPhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.includes('+')) return null;
  if (digits.startsWith('84') && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1);
  else if (digits.length !== 9) return null;
  if (!/^[1-9]\d{8}$/.test(digits)) return null;
  return `+84${digits}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERRAL_CODE_RE = /^[a-z0-9]{4,12}$/;

/** Kiểm tra sớm ở trình duyệt để báo lỗi ngay; backend vẫn kiểm tra lại toàn bộ. */
export function validateCheckout(form: CheckoutForm, cart: CartState): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (cart.lines.length === 0) errors.items = 'Giỏ hàng đang trống.';
  const name = form.fullName.trim();
  if (name.length < 2 || name.length > 100) errors.fullName = 'Vui lòng nhập họ tên (2 đến 100 ký tự).';
  if (!normalizeVnPhone(form.phone)) errors.phone = 'Số điện thoại chưa đúng (ví dụ 0912 345 678).';
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = 'Email chưa đúng định dạng.';
  if (!form.province.trim()) errors.province = 'Vui lòng nhập tỉnh, thành phố.';
  if (!form.ward.trim()) errors.ward = 'Vui lòng nhập phường, xã.';
  if (!form.addressLine.trim()) errors.addressLine = 'Vui lòng nhập số nhà, tên đường.';
  if (form.note.trim().length > 500) errors.note = 'Ghi chú tối đa 500 ký tự.';
  const code = form.referralCode.trim().toLowerCase();
  if (code && !REFERRAL_CODE_RE.test(code)) errors.referralCode = 'Mã giới thiệu gồm 4 đến 12 chữ thường hoặc số.';
  return errors;
}

/** Nội dung gửi tới POST /public/orders. Giá và tên sản phẩm KHÔNG gửi: backend lấy từ catalog. */
export interface PlaceOrderPayload {
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: PaymentMethod;
  customer: {
    fullName: string; phone: string; email?: string; province: string; ward: string; addressLine: string; marketingConsent: boolean;
  };
  referralCode?: string;
  cookie?: OrderCookie;
  note?: string;
}

export function buildOrderPayload(form: CheckoutForm, cart: CartState, referral: StoredReferral | null): PlaceOrderPayload {
  const email = form.email.trim();
  const note = form.note.trim();
  const code = form.referralCode.trim().toLowerCase();
  return {
    items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    paymentMethod: form.paymentMethod,
    customer: {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      ...(email ? { email } : {}),
      province: form.province.trim(),
      ward: form.ward.trim(),
      addressLine: form.addressLine.trim(),
      marketingConsent: form.marketingConsent,
    },
    ...(code ? { referralCode: code } : {}),
    ...(referral ? { cookie: toOrderCookie(referral) } : {}),
    ...(note ? { note } : {}),
  };
}

/**
 * Đổi lỗi kiểm tra dữ liệu của backend ([{ field: "customer.phone", messages: [...] }]) thành lỗi theo từng ô của form.
 * Trường không có ô tương ứng được gom vào `items` để vẫn hiển thị cho khách.
 */
export function mapServerFieldErrors(details: unknown): CheckoutErrors {
  const out: CheckoutErrors = {};
  if (!Array.isArray(details)) return out;
  for (const d of details as Array<{ field?: string; messages?: string[] }>) {
    if (!d?.field || !d.messages?.length) continue;
    const key = d.field.startsWith('customer.') ? d.field.slice('customer.'.length) : d.field;
    const target = (key in EMPTY_CHECKOUT ? key : 'items') as keyof CheckoutErrors;
    out[target] = out[target] ? `${out[target]} ${d.messages[0]}` : d.messages[0];
  }
  return out;
}

/** Mô tả thân thiện cho lỗi hết hàng (409) hoặc sản phẩm ngừng bán (422) mà backend trả kèm `details`. */
export function describeStockProblems(details: unknown, cart: CartState): string[] {
  if (!Array.isArray(details)) return [];
  const nameOf = (id: string) => cart.lines.find((l) => l.productId === id)?.name ?? 'Sản phẩm';
  const out: string[] = [];
  for (const d of details as Array<{ productId?: string; requested?: number; available?: number; reason?: string }>) {
    if (!d?.productId) continue;
    if (typeof d.available === 'number') out.push(`${nameOf(d.productId)}: chỉ còn ${d.available} (bạn chọn ${d.requested ?? '?'}).`);
    else if (d.reason) out.push(`${nameOf(d.productId)}: hiện không còn được bán.`);
  }
  return out;
}
