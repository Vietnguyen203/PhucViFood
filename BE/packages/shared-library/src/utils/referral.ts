/** Mã giới thiệu CTV: 4-12 ký tự, chữ thường + số; tra cứu không phân biệt hoa thường. */
export const REFERRAL_CODE_REGEX = /^[a-z0-9]{4,12}$/;
/** Mã kênh trong link /r/{mã}?c={kênh}. */
export const CHANNEL_CODE_REGEX = /^[a-z0-9_-]{1,30}$/;
/** Cookie ghi nhận link CTV (ngày). Giá trị thật đọc từ settings, đây là mặc định. */
export const DEFAULT_COOKIE_DAYS = 30;

/** Từ khóa không cho dùng làm mã để tránh đụng đường dẫn hệ thống. */
const RESERVED_CODES = new Set(['admin', 'api', 'login', 'logout', 'register', 'cart', 'checkout', 'order', 'orders', 'static', 'assets']);

export function normalizeReferralCode(input: string | null | undefined): string | null {
  const code = input?.trim().toLowerCase();
  return code ? code : null;
}

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_REGEX.test(code) && !RESERVED_CODES.has(code);
}

export function normalizeChannelCode(input: string | null | undefined): string | null {
  const code = input?.trim().toLowerCase();
  return code && CHANNEL_CODE_REGEX.test(code) ? code : null;
}

export interface ReferralCookie {
  code: string;
  channelCode: string | null;
  /** Thời điểm bấm link (ISO hoặc Date); link bấm sau cùng thắng nên cookie luôn là lần bấm gần nhất. */
  clickedAt: Date | string;
}

export interface ChosenReferral {
  code: string;
  channelCode: string | null;
  source: 'LINK' | 'CODE';
}

/**
 * Chọn nguồn ghi nhận khi đặt hàng: mã khách tự nhập ở thanh toán ưu tiên hơn cookie.
 * Cookie hết hạn sau `cookieDays` ngày thì bị bỏ qua.
 */
export function chooseReferral(args: {
  inputCode?: string | null;
  cookie?: ReferralCookie | null;
  now?: Date;
  cookieDays?: number;
}): ChosenReferral | null {
  const typed = normalizeReferralCode(args.inputCode);
  if (typed) {
    // Mã nhập tay giữ kênh của cookie nếu cùng mã, để thống kê kênh vẫn đúng.
    const sameCookie = args.cookie && normalizeReferralCode(args.cookie.code) === typed ? args.cookie : null;
    return { code: typed, channelCode: sameCookie ? normalizeChannelCode(sameCookie.channelCode) : null, source: 'CODE' };
  }
  const cookie = args.cookie;
  if (!cookie) return null;
  const code = normalizeReferralCode(cookie.code);
  if (!code) return null;
  const now = args.now ?? new Date();
  const ageMs = now.getTime() - new Date(cookie.clickedAt).getTime();
  const maxMs = (args.cookieDays ?? DEFAULT_COOKIE_DAYS) * 24 * 3600 * 1000;
  if (Number.isNaN(ageMs) || ageMs > maxMs) return null;
  return { code, channelCode: normalizeChannelCode(cookie.channelCode), source: 'LINK' };
}
