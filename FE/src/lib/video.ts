import { api } from './api';

/** Mã video YouTube (11 ký tự) từ link watch, youtu.be, shorts, embed, live; không phải YouTube thì null. Giống luật kiểm tra ở backend. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/.exec(url.trim());
  return m ? m[1] : null;
}

/** Ảnh bìa của video (không tải khung phát cho tới khi khách bấm). */
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Khung phát nhúng, dùng tên miền youtube-nocookie (không đặt cookie theo dõi trước khi phát). */
export const youtubeEmbed = (id: string, autoplay = true) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}`;

/** Video như khách thấy ở trang chủ. */
export interface PublicVideo { id: string; title: string; videoUrl: string }

export async function fetchVideos(signal?: AbortSignal): Promise<PublicVideo[]> {
  return (await api<PublicVideo[]>('/public/videos', { signal })).data;
}
