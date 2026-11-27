import type { PaymentStatus, PublicOrder } from './types';

/** Nhãn trạng thái thanh toán: "chưa trả" của đơn VNPay là chờ thanh toán online, của chuyển khoản là chờ chuyển khoản. */
export function paymentStatusLabel(order: Pick<PublicOrder, 'paymentMethod' | 'paymentStatus'>): string {
  const labels: Record<PaymentStatus, string> = { PENDING: 'Thanh toán khi nhận hàng', UNPAID: 'Chờ chuyển khoản', PAID: 'Đã thanh toán', REFUNDED: 'Đã hoàn tiền' };
  return order.paymentStatus === 'UNPAID' && order.paymentMethod === 'VNPAY' ? 'Chờ thanh toán online' : labels[order.paymentStatus];
}

/** Đưa khách sang cổng thanh toán (rời trang, quay lại qua trang kết quả). Chỉ nhận link https của VNPay/sandbox hoặc cùng nguồn. */
export function isPaymentGatewayUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://localhost.invalid');
    return u.protocol === 'https:' && /(^|\.)vnpayment\.vn$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Mã phản hồi ở trang kết quả: lấy đúng chuỗi query VNPay đưa về (giữ nguyên để backend kiểm tra chữ ký). */
export function hasVnpayParams(search: string): boolean {
  return new URLSearchParams(search).has('vnp_SecureHash');
}
