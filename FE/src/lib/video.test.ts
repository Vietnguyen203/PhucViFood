import { describe, expect, it } from 'vitest';
import { youtubeEmbed, youtubeId } from './video';

describe('mã video YouTube', () => {
  it('đọc các dạng link', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=5', 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', ' https://youtu.be/dQw4w9WgXcQ ',
    ]) expect(youtubeId(u), u).toBe('dQw4w9WgXcQ');
  });
  it('không phải YouTube thì null', () => {
    for (const u of [null, undefined, '', '/san-pham/abc', 'https://vimeo.com/123456789', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://evil.example/youtu.be/dQw4w9WgXcQ', 'https://youtu.be/short', 'javascript:alert(1)', 'https://www.youtube.com/watch?v=dQw4w9WgXcQextra!']) {
      expect(youtubeId(u), String(u)).toBeNull();
    }
  });
  it('khung nhúng dùng youtube-nocookie', () => {
    expect(youtubeEmbed('dQw4w9WgXcQ')).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youtubeEmbed('dQw4w9WgXcQ', false)).not.toContain('autoplay');
  });
});
