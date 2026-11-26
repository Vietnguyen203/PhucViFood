import { api } from './api';
import type { KeyValueStore } from './storage';
import { loadReferral, saveReferral, type ClickResult } from './referral';

/** Loại tương tác backend ghi nhận (chỉ để thống kê cho CTV, không liên quan tiền). */
export type TrackingEventType = 'PRODUCT_VIEW' | 'ADD_TO_CART' | 'CHECKOUT_START';

type ClickResponse = { valid: false } | ({ valid: true } & ClickResult);

/**
 * Ghi nhận khách bấm link CTV /r/{mã}?c={kênh}. Hợp lệ thì lưu cookie (bấm sau ghi đè bấm trước) để gửi kèm khi đặt hàng.
 * Trả về true nếu mã hợp lệ. Mọi lỗi đều được nuốt: theo dõi không bao giờ được làm hỏng việc xem hàng.
 */
export async function trackReferralClick(store: KeyValueStore, code: string, channel: string | null, landingPath: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const existing = loadReferral(store);
    const { data } = await api<ClickResponse>('/public/referrals/click', {
      method: 'POST', signal,
      body: { code, ...(channel ? { channel } : {}), ...(existing ? { visitorId: existing.visitorId } : {}), landingPath: landingPath.slice(0, 500) },
    });
    if (!data.valid) return false;
    saveReferral(store, data);
    return true;
  } catch {
    return false;
  }
}

/** Ghi một tương tác của khách đã vào qua link CTV. Không có link CTV còn hạn thì không làm gì. Gửi xong không chờ, lỗi bị bỏ qua. */
export function trackEvent(store: KeyValueStore, type: TrackingEventType, productId?: string): void {
  const ref = loadReferral(store);
  if (!ref) return;
  void api('/public/tracking/events', {
    method: 'POST',
    body: { code: ref.code, visitorId: ref.visitorId, type, ...(productId ? { productId } : {}), ...(ref.channelCode ? { channel: ref.channelCode } : {}) },
  }).catch(() => undefined);
}
