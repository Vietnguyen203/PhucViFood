import { api } from './api';
import { customerAuth } from './customerAuth';
import type { PlaceOrderPayload } from './checkout';
import type { PublicOrder } from './types';

/** Khóa chống đặt trùng khi bấm đúp hoặc mạng chập chờn thử lại: cùng khóa thì backend trả lại đúng đơn cũ. Gồm 8-100 ký tự chữ, số, . _ - */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function placeOrder(payload: PlaceOrderPayload, idempotencyKey: string, signal?: AbortSignal): Promise<PublicOrder> {
  // Khách đã đăng nhập: gửi kèm token để đơn gắn với tài khoản (xem lại ở trang tài khoản). Không có token thì đặt như khách vãng lai.
  const token = (await customerAuth.freshAccessToken()) ?? undefined;
  return (await api<PublicOrder>('/public/orders', { method: 'POST', body: payload, headers: { 'idempotency-key': idempotencyKey }, token, signal })).data;
}

/** Tra cứu bằng mã đơn và SĐT đã dùng khi đặt (sai một trong hai đều báo không tìm thấy). */
export async function lookupOrder(code: string, phone: string, signal?: AbortSignal): Promise<PublicOrder> {
  const path = `/public/orders/${encodeURIComponent(code.trim().toUpperCase())}?phone=${encodeURIComponent(phone.trim())}`;
  return (await api<PublicOrder>(path, { signal })).data;
}

export async function cancelOrder(code: string, phone: string, reason?: string): Promise<PublicOrder> {
  return (await api<PublicOrder>(`/public/orders/${encodeURIComponent(code)}/cancel`, { method: 'POST', body: { phone: phone.trim(), ...(reason?.trim() ? { reason: reason.trim() } : {}) } })).data;
}

export async function confirmReceived(code: string, phone: string): Promise<PublicOrder> {
  return (await api<PublicOrder>(`/public/orders/${encodeURIComponent(code)}/confirm-received`, { method: 'POST', body: { phone: phone.trim() } })).data;
}

/** Cách thanh toán online cửa hàng đang bật (VNPay chỉ bật khi có cấu hình ở máy chủ). */
export async function fetchPaymentOptions(signal?: AbortSignal): Promise<{ vnpay: boolean }> {
  return (await api<{ vnpay: boolean }>('/public/payments/options', { signal })).data;
}

/** Khách thanh toán (lại) đơn VNPay chưa trả: lấy link sang cổng thanh toán. */
export async function requestPayUrl(code: string, phone: string): Promise<string> {
  return (await api<{ url: string }>(`/public/orders/${encodeURIComponent(code)}/pay-url`, { method: 'POST', body: { phone: phone.trim() } })).data.url;
}

export interface VnpayResult { success: boolean; valid: boolean; orderCode: string | null; message: string }

/** Trang kết quả gửi nguyên query VNPay đưa về để máy chủ kiểm tra chữ ký và ghi nhận thanh toán. */
export async function confirmVnpay(search: string, signal?: AbortSignal): Promise<VnpayResult> {
  return (await api<VnpayResult>(`/public/payments/vnpay/return${search.startsWith('?') ? search : `?${search}`}`, { signal })).data;
}

