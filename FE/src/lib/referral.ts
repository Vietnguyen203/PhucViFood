import type { KeyValueStore } from './storage';
import type { OrderCookie, ReferralCookie } from './types';

const REFERRAL_KEY = 'pv.referral';
const DAY_MS = 86_400_000;

/** Link CTV khách đã bấm gần nhất (bấm sau ghi đè bấm trước), kèm mã người xem do backend cấp. */
export interface StoredReferral extends ReferralCookie { visitorId: string }

/** Kết quả hợp lệ của API ghi nhận lượt bấm. */
export interface ClickResult { visitorId: string; cookie: ReferralCookie }

export function saveReferral(store: KeyValueStore, click: ClickResult): void {
  const value: StoredReferral = { ...click.cookie, visitorId: click.visitorId };
  store.setItem(REFERRAL_KEY, JSON.stringify(value));
}

/** Link CTV còn hiệu lực. Quá `maxAgeDays` kể từ lúc bấm thì coi như không có (và được xóa). */
export function loadReferral(store: KeyValueStore, now: number = Date.now()): StoredReferral | null {
  const raw = store.getItem(REFERRAL_KEY);
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<StoredReferral>;
    const clicked = typeof r.clickedAt === 'string' ? Date.parse(r.clickedAt) : NaN;
    if (typeof r.code !== 'string' || !r.code || typeof r.visitorId !== 'string' || Number.isNaN(clicked)) throw new Error('sai dạng');
    const maxAgeDays = typeof r.maxAgeDays === 'number' && r.maxAgeDays > 0 ? r.maxAgeDays : 30;
    if (now > clicked + maxAgeDays * DAY_MS) { store.removeItem(REFERRAL_KEY); return null; }
    return { code: r.code, channelCode: typeof r.channelCode === 'string' ? r.channelCode : null, clickedAt: r.clickedAt as string, maxAgeDays, visitorId: r.visitorId };
  } catch {
    store.removeItem(REFERRAL_KEY);
    return null;
  }
}

export function clearReferral(store: KeyValueStore): void {
  store.removeItem(REFERRAL_KEY);
}

/** Phần gửi kèm đơn hàng để backend ghi nhận CTV (không gồm visitorId). */
export function toOrderCookie(r: StoredReferral): OrderCookie {
  return { code: r.code, ...(r.channelCode ? { channelCode: r.channelCode } : {}), clickedAt: r.clickedAt, maxAgeDays: r.maxAgeDays };
}
