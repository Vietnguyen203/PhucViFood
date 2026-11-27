import { api } from './api';

/** Banner trang chủ như khách thấy (ảnh, tên làm mô tả ảnh, đích bấm). */
export interface PublicBanner { id: string; title: string; imageUrl: string; linkUrl: string | null }
export interface PublicBanners { main: PublicBanner[]; side: PublicBanner[] }

export async function fetchBanners(signal?: AbortSignal): Promise<PublicBanners> {
  return (await api<PublicBanners>('/public/banners', { signal })).data;
}

/** Số ô khuyến mãi tối đa ở khung bên phải (đủ chỗ cho hai ô xếp dọc). */
export const MAX_SIDE_BANNERS = 2;

/** Ảnh mặc định khi chưa cấu hình banner nào ở trang quản trị: chỉ ảnh, bấm vào ra khu sản phẩm. */
export const DEFAULT_MAIN_BANNERS: PublicBanner[] = [
  { id: 'default-1', title: 'Món ngon Việt cho mọi nhà', imageUrl: '/images/phuc-vi-home-hero.png', linkUrl: '/#best-sellers' },
  { id: 'default-2', title: 'Bộ quà tinh tuyển', imageUrl: '/images/phuc-vi-hero.png', linkUrl: '/#best-sellers' },
];

export type BannerTarget = { kind: 'internal'; to: string } | { kind: 'external'; href: string } | { kind: 'none' };

/** Phân loại đích bấm: trang trong cửa hàng (một dấu / đầu), link ngoài http(s), hoặc không bấm được. Mọi giá trị lạ (javascript:, //host) coi như không bấm được. */
export function bannerTarget(linkUrl: string | null | undefined): BannerTarget {
  const v = (linkUrl ?? '').trim();
  if (/^\/(?!\/)/.test(v)) return { kind: 'internal', to: v };
  if (/^https?:\/\/[^\s]+$/i.test(v)) return { kind: 'external', href: v };
  return { kind: 'none' };
}
