import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * VNPay (pay 2.1.0): ký HMAC-SHA512 trên chuỗi tham số vnp_* đã sắp A-Z và mã hóa URL (khoảng trắng thành +).
 * Mọi hàm ở đây là hàm thuần để kiểm thử không cần mạng.
 */
export const VNP_VERSION = '2.1.0';

/** Ngày giờ theo giờ Việt Nam (GMT+7) dạng yyyyMMddHHmmss như VNPay yêu cầu. */
export function vnpDate(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3_600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');

/** Chuỗi để ký: các tham số vnp_* (bỏ chữ ký), sắp theo tên, giá trị mã hóa URL. */
export function signingString(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${enc(k)}=${enc(String(params[k]))}`)
    .join('&');
}

export const hmacSha512 = (secret: string, data: string): string => createHmac('sha512', secret).update(Buffer.from(data, 'utf-8')).digest('hex');

export interface PaymentUrlInput {
  tmnCode: string; hashSecret: string; payUrl: string; returnUrl: string;
  /** Mã đơn (vnp_TxnRef, duy nhất mỗi lần thanh toán). */
  txnRef: string;
  /** Số tiền VND nguyên (nhân 100 khi gửi). */
  amountVnd: number;
  orderInfo: string;
  ipAddr: string;
  now: Date;
  /** Hết hạn thanh toán trên cổng VNPay. */
  expiresAt: Date;
}

/** Link chuyển khách sang cổng thanh toán VNPay, đã ký. */
export function buildPaymentUrl(i: PaymentUrlInput): string {
  const params: Record<string, string> = {
    vnp_Version: VNP_VERSION, vnp_Command: 'pay', vnp_TmnCode: i.tmnCode,
    vnp_Amount: String(Math.round(i.amountVnd) * 100), vnp_CurrCode: 'VND',
    vnp_TxnRef: i.txnRef, vnp_OrderInfo: i.orderInfo, vnp_OrderType: 'other', vnp_Locale: 'vn',
    vnp_ReturnUrl: i.returnUrl, vnp_IpAddr: i.ipAddr,
    vnp_CreateDate: vnpDate(i.now), vnp_ExpireDate: vnpDate(i.expiresAt),
  };
  const data = signingString(params);
  return `${i.payUrl}?${data}&vnp_SecureHash=${hmacSha512(i.hashSecret, data)}`;
}

/** Kiểm tra chữ ký của dữ liệu VNPay gửi về (trang kết quả hoặc IPN). So sánh thời gian hằng số. */
export function verifySignature(params: Record<string, string>, secret: string): boolean {
  const given = String(params.vnp_SecureHash ?? '').toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(given)) return false;
  const want = hmacSha512(secret, signingString(params));
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(want, 'hex'));
}

/** Chỉ giữ tham số dạng chuỗi bắt đầu bằng vnp_ (query có thể chứa mảng hoặc object nếu bị chèn). */
export function pickVnpParams(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (k.startsWith('vnp_') && typeof v === 'string' && v.length <= 1000) out[k] = v;
  return out;
}

/** Thanh toán thành công khi cả mã phản hồi và mã trạng thái giao dịch đều là 00. */
export const isSuccessful = (p: Record<string, string>): boolean => p.vnp_ResponseCode === '00' && (p.vnp_TransactionStatus ?? '00') === '00';

/** Thông báo cho khách theo mã phản hồi VNPay (không lộ chi tiết kỹ thuật). */
export function responseMessage(code: string | undefined): string {
  switch (code) {
    case '00': return 'Thanh toán thành công';
    case '07': return 'Giao dịch bị nghi ngờ gian lận, vui lòng liên hệ ngân hàng';
    case '09': return 'Thẻ hoặc tài khoản chưa đăng ký dịch vụ Internet Banking';
    case '10': return 'Xác thực thông tin thẻ quá 3 lần';
    case '11': return 'Đã hết thời gian chờ thanh toán';
    case '12': return 'Thẻ hoặc tài khoản bị khóa';
    case '13': return 'Sai mật khẩu xác thực giao dịch (OTP)';
    case '24': return 'Bạn đã hủy giao dịch';
    case '51': return 'Tài khoản không đủ số dư';
    case '65': return 'Tài khoản vượt hạn mức giao dịch trong ngày';
    case '75': return 'Ngân hàng đang bảo trì';
    case '79': return 'Nhập sai mật khẩu thanh toán quá số lần quy định';
    default: return 'Thanh toán chưa thành công';
  }
}
