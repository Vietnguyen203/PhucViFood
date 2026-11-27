import { api } from './api';

/** Cách phát một link video: nhúng khung (iframe), tệp video trực tiếp, hoặc chỉ mở link ở tab mới (link lạ không nhúng được). */
export type VideoSource =
  | { kind: 'iframe'; src: string; provider: 'youtube' | 'vimeo' | 'tiktok' | 'facebook'; portrait: boolean }
  | { kind: 'file'; src: string }
  | { kind: 'link'; href: string };

/** Mã video YouTube (11 ký tự) từ link watch, youtu.be, shorts, embed, live; không phải YouTube thì null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/.exec(url.trim());
  return m ? m[1] : null;
}

const FILE_RE = /\.(?:mp4|webm|ogg|ogv|mov|m4v)$/i;

/**
 * Nhận biết link video và cách phát: YouTube, Vimeo, TikTok, Facebook (nhúng khung); đuôi .mp4/.webm/.ogg/.mov/.m4v (thẻ video);
 * link http(s) khác chỉ mở ở tab mới. Không phải http(s) thì null. Địa chỉ khung nhúng luôn dựng từ mã đã tách, không dùng nguyên link khách nhập.
 */
export function resolveVideo(raw: string | null | undefined): VideoSource | null {
  const url = raw?.trim();
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|web)\./, '');

  const yt = youtubeId(url);
  if (yt) return { kind: 'iframe', provider: 'youtube', portrait: false, src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&autoplay=1` };

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = /^\/(?:video\/|(?:[^/]+\/)*)(\d{6,12})(?:\/([a-f0-9]{8,12}))?\/?$/.exec(u.pathname);
    if (m) return { kind: 'iframe', provider: 'vimeo', portrait: false, src: `https://player.vimeo.com/video/${m[1]}?autoplay=1${m[2] ? `&h=${m[2]}` : ''}` };
  }
  if (host === 'tiktok.com') {
    const m = /^\/(?:@[\w.-]+\/video|embed\/v2)\/(\d{10,25})\/?$/.exec(u.pathname);
    if (m) return { kind: 'iframe', provider: 'tiktok', portrait: true, src: `https://www.tiktok.com/embed/v2/${m[1]}` };
  }
  if (host === 'fb.watch' || (host === 'facebook.com' && /^\/(?:[^/]+\/videos\/|watch\/?$|reel\/|share\/[vr]\/)/.test(u.pathname))) {
    const portrait = host === 'facebook.com' && u.pathname.startsWith('/reel/');
    return { kind: 'iframe', provider: 'facebook', portrait, src: `https://www.facebook.com/plugins/video.php?show_text=false&autoplay=true&href=${encodeURIComponent(u.origin + u.pathname + (u.pathname.startsWith('/watch') ? u.search : ''))}` };
  }
  if (FILE_RE.test(u.pathname)) return { kind: 'file', src: url };
  return { kind: 'link', href: url };
}

/** Chỉ cách phát ngay trên trang (khung nhúng hoặc tệp video); link lạ trả null. */
export function playableVideo(raw: string | null | undefined): Extract<VideoSource, { kind: 'iframe' | 'file' }> | null {
  const s = resolveVideo(raw);
  return s && s.kind !== 'link' ? s : null;
}

/** Ảnh bìa YouTube (không tải khung phát cho tới khi khách bấm). */
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Ảnh bìa: ảnh admin đặt, nếu không thì ảnh YouTube; video khác không có thì null. */
export function videoThumb(videoUrl: string, thumbnailUrl?: string | null): string | null {
  if (thumbnailUrl) return thumbnailUrl;
  const id = youtubeId(videoUrl);
  return id ? youtubeThumb(id) : null;
}

/** Video như khách thấy ở trang chủ. */
export interface PublicVideo { id: string; title: string; videoUrl: string; thumbnailUrl: string | null }

export async function fetchVideos(signal?: AbortSignal): Promise<PublicVideo[]> {
  return (await api<PublicVideo[]>('/public/videos', { signal })).data;
}
