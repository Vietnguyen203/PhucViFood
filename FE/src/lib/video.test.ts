import { describe, expect, it } from 'vitest';
import { playableVideo, resolveVideo, videoThumb, youtubeId } from './video';

describe('mã video YouTube', () => {
  it('đọc các dạng link', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=5', 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', ' https://youtu.be/dQw4w9WgXcQ ',
    ]) expect(youtubeId(u), u).toBe('dQw4w9WgXcQ');
  });
  it('không phải YouTube thì null', () => {
    for (const u of [null, undefined, '', '/san-pham/abc', 'https://vimeo.com/123456789', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://evil.example/youtu.be/dQw4w9WgXcQ', 'https://youtu.be/short', 'javascript:alert(1)']) {
      expect(youtubeId(u), String(u)).toBeNull();
    }
  });
});

describe('cách phát link video', () => {
  it('YouTube: khung nhúng youtube-nocookie dựng từ mã', () => {
    expect(resolveVideo('https://youtu.be/dQw4w9WgXcQ?t=5')).toMatchObject({ kind: 'iframe', provider: 'youtube', portrait: false });
    expect((resolveVideo('https://youtu.be/dQw4w9WgXcQ') as any).src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  });
  it('Vimeo, kể cả link riêng tư có mã h', () => {
    expect((resolveVideo('https://vimeo.com/123456789') as any).src).toBe('https://player.vimeo.com/video/123456789?autoplay=1');
    expect((resolveVideo('https://vimeo.com/123456789/abcdef1234') as any).src).toBe('https://player.vimeo.com/video/123456789?autoplay=1&h=abcdef1234');
    expect((resolveVideo('https://player.vimeo.com/video/123456789') as any).provider).toBe('vimeo');
    expect((resolveVideo('https://vimeo.com/channels/staffpicks/123456789') as any).provider).toBe('vimeo');
  });
  it('TikTok: khung dọc', () => {
    expect(resolveVideo('https://www.tiktok.com/@phucvi.foods/video/7301234567890123456')).toMatchObject({ kind: 'iframe', provider: 'tiktok', portrait: true, src: 'https://www.tiktok.com/embed/v2/7301234567890123456' });
    expect(resolveVideo('https://vm.tiktok.com/ZMabc123/')).toEqual({ kind: 'link', href: 'https://vm.tiktok.com/ZMabc123/' }); // link rút gọn không nhúng được
  });
  it('Facebook: khung plugin, href được mã hóa', () => {
    const r = resolveVideo('https://www.facebook.com/phucvi/videos/123456789012345/') as any;
    expect(r).toMatchObject({ kind: 'iframe', provider: 'facebook' });
    expect(r.src).toContain('href=' + encodeURIComponent('https://www.facebook.com/phucvi/videos/123456789012345/'));
    expect((resolveVideo('https://fb.watch/abcDEF123/') as any).provider).toBe('facebook');
    expect((resolveVideo('https://www.facebook.com/reel/123456789') as any).portrait).toBe(true);
    expect(resolveVideo('https://www.facebook.com/phucvi')).toMatchObject({ kind: 'link' }); // trang cá nhân không phải video
  });
  it('tệp video trực tiếp', () => {
    for (const u of ['https://cdn.example.com/a.mp4', 'https://cdn.example.com/a.WEBM?x=1', 'http://x.vn/v/clip.mov', 'https://x.vn/a.m4v', 'https://x.vn/a.ogg']) expect(resolveVideo(u), u).toEqual({ kind: 'file', src: u });
  });
  it('link lạ chỉ mở tab mới; không phải http(s) thì null', () => {
    expect(resolveVideo('https://example.com/xem-video')).toEqual({ kind: 'link', href: 'https://example.com/xem-video' });
    for (const u of [null, '', '   ', '/san-pham/abc', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.vn/a.mp4', 'khong phai link']) expect(resolveVideo(u), String(u)).toBeNull();
  });
  it('link giả mạo tên miền không được nhúng', () => {
    for (const u of ['https://vimeo.com.evil.example/123456789', 'https://evil.example/vimeo.com/123456789', 'https://tiktok.com.evil.example/@a/video/7301234567890123456', 'https://facebook.com.evil.example/a/videos/1']) {
      expect(resolveVideo(u), u).toMatchObject({ kind: 'link' });
    }
  });
  it('playableVideo bỏ qua link chỉ mở tab mới', () => {
    expect(playableVideo('https://example.com/xem-video')).toBeNull();
    expect(playableVideo('/san-pham/abc')).toBeNull();
    expect(playableVideo('https://cdn.example.com/a.mp4')).toMatchObject({ kind: 'file' });
  });
});

describe('ảnh bìa', () => {
  it('ưu tiên ảnh admin đặt, rồi ảnh YouTube, còn lại null', () => {
    expect(videoThumb('https://youtu.be/dQw4w9WgXcQ', 'https://cdn.example.com/c.jpg')).toBe('https://cdn.example.com/c.jpg');
    expect(videoThumb('https://youtu.be/dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(videoThumb('https://cdn.example.com/a.mp4')).toBeNull();
    expect(videoThumb('https://cdn.example.com/a.mp4', '')).toBeNull();
  });
});
