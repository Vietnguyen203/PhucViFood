import { describe, expect, it } from 'vitest';
import { bannerTarget, DEFAULT_MAIN_BANNERS } from './banner';

describe('đích bấm của banner', () => {
  it('trang trong cửa hàng', () => {
    expect(bannerTarget('/san-pham/kho-ca-loc')).toEqual({ kind: 'internal', to: '/san-pham/kho-ca-loc' });
    expect(bannerTarget('/#best-sellers')).toEqual({ kind: 'internal', to: '/#best-sellers' });
    expect(bannerTarget('  /danh-muc/tra  ')).toEqual({ kind: 'internal', to: '/danh-muc/tra' });
  });
  it('link ngoài http(s)', () => {
    expect(bannerTarget('https://shop.example.vn/km')).toEqual({ kind: 'external', href: 'https://shop.example.vn/km' });
    expect(bannerTarget('http://a.vn')).toEqual({ kind: 'external', href: 'http://a.vn' });
  });
  it('rỗng, thiếu hoặc nguy hiểm thì không bấm được', () => {
    for (const v of [null, undefined, '', '   ', 'javascript:alert(1)', '//evil.example', 'data:text/html,x', 'san-pham/a', 'ftp://x.vn']) {
      expect(bannerTarget(v), String(v)).toEqual({ kind: 'none' });
    }
  });
  it('ảnh mặc định đều bấm được vào khu sản phẩm', () => {
    for (const b of DEFAULT_MAIN_BANNERS) expect(bannerTarget(b.linkUrl).kind).toBe('internal');
  });
});
