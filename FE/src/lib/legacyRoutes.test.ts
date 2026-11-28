import { describe, expect, it } from 'vitest';
import { LEGACY_INFO_PAGES, LEGACY_REDIRECTS } from './legacyRoutes';

const params = (p: string) => [...p.matchAll(/:(\w+)\??/g)].map((m) => m[1]);

describe('đường dẫn cũ chuyển hướng', () => {
  it('không trùng đường dẫn cũ', () => {
    const olds = LEGACY_REDIRECTS.map(([o]) => o);
    expect(new Set(olds).size).toBe(olds.length);
  });
  it('tham số ở đường dẫn mới đều có ở đường dẫn cũ', () => {
    for (const [from, to] of LEGACY_REDIRECTS) for (const p of params(to)) expect(params(from), `${from} -> ${to}`).toContain(p);
  });
  it('đường dẫn mới là tiếng Anh không dấu và đường dẫn cũ không còn dùng được làm đích', () => {
    const olds = new Set(LEGACY_REDIRECTS.map(([o]) => o.replace(/\/:\w+\??/g, '')));
    for (const [, to] of LEGACY_REDIRECTS) {
      expect(to, to).toMatch(/^\/[a-z0-9/:?-]*$/);
      expect(olds.has(to.replace(/\/:\w+\??/g, '')) && !['/login'].includes(to), to).toBe(false);
    }
  });
  it('khóa trang thông tin cũ đều có khóa mới', () => {
    expect(Object.keys(LEGACY_INFO_PAGES).sort()).toEqual(['doi-tra', 'giao-hang', 'gioi-thieu', 'lien-he', 'thanh-toan']);
    for (const v of Object.values(LEGACY_INFO_PAGES)) expect(v).toMatch(/^[a-z]+$/);
  });
});
