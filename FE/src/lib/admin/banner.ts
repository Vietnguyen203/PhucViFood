import type { AdminBanner } from './types';

export type BannerState = 'LIVE' | 'OFF' | 'UPCOMING' | 'EXPIRED';

/** Trạng thái hiển thị của banner tại thời điểm `now`: đang hiện, đã tắt, chưa tới lịch hoặc đã hết hạn (cùng quy tắc với backend). */
export function bannerState(b: Pick<AdminBanner, 'isActive' | 'startsAt' | 'endsAt'>, now: Date = new Date()): BannerState {
  if (!b.isActive) return 'OFF';
  if (b.startsAt && new Date(b.startsAt).getTime() > now.getTime()) return 'UPCOMING';
  if (b.endsAt && new Date(b.endsAt).getTime() <= now.getTime()) return 'EXPIRED';
  return 'LIVE';
}

export const BANNER_STATE_LABEL: Record<BannerState, string> = { LIVE: 'Đang hiển thị', OFF: 'Đã tắt', UPCOMING: 'Chưa tới lịch', EXPIRED: 'Đã hết hạn' };

/** Giá trị cho ô datetime-local (giờ máy người dùng, dạng yyyy-MM-ddTHH:mm) từ chuỗi ISO; rỗng thì trả "". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Ngược lại: từ ô datetime-local ra chuỗi ISO (UTC) gửi backend; rỗng hoặc sai thì null. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
