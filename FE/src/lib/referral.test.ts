import { describe, expect, it, vi } from 'vitest';
import { MemoryStore, safeStorage } from './storage';
import { clearReferral, landingTarget, loadReferral, saveReferral, toOrderCookie } from './referral';

const click = (over: Partial<{ clickedAt: string; maxAgeDays: number; channelCode: string | null }> = {}) => ({
  visitorId: '0191e2c0-aaaa-7bbb-8ccc-123456789abc',
  cookie: { code: 'linh01', channelCode: 'tiktok' as string | null, clickedAt: '2026-11-20T00:00:00.000Z', maxAgeDays: 30, ...over },
});
const day = (iso: string, plusDays = 0) => Date.parse(iso) + plusDays * 86_400_000;

describe('link CTV đã bấm', () => {
  it('lưu rồi đọc lại đúng, kèm visitorId', () => {
    const store = new MemoryStore();
    saveReferral(store, click());
    expect(loadReferral(store, day('2026-11-21T00:00:00Z'))).toEqual({
      code: 'linh01', channelCode: 'tiktok', clickedAt: '2026-11-20T00:00:00.000Z', maxAgeDays: 30, visitorId: '0191e2c0-aaaa-7bbb-8ccc-123456789abc',
    });
  });

  it('hết hạn sau maxAgeDays: không còn và được xóa khỏi bộ nhớ; còn đúng ngày cuối thì vẫn dùng được', () => {
    const store = new MemoryStore();
    saveReferral(store, click());
    expect(loadReferral(store, day('2026-11-20T00:00:00Z', 30))).not.toBeNull();
    expect(loadReferral(store, day('2026-11-20T00:00:00Z', 30) + 1)).toBeNull();
    expect(store.getItem('pv.referral')).toBeNull();
  });

  it('bấm link khác thì ghi đè (link bấm sau cùng thắng)', () => {
    const store = new MemoryStore();
    saveReferral(store, click());
    saveReferral(store, { visitorId: 'v2', cookie: { code: 'minh02', channelCode: null, clickedAt: '2026-11-22T00:00:00.000Z', maxAgeDays: 30 } });
    expect(loadReferral(store, day('2026-11-23T00:00:00Z'))).toMatchObject({ code: 'minh02', channelCode: null, visitorId: 'v2' });
  });

  it('dữ liệu hỏng hoặc thiếu trường thì coi như không có và được dọn', () => {
    const store = new MemoryStore();
    for (const raw of ['{', 'null', '{"code":"x"}', '{"code":"x","visitorId":"v","clickedAt":"không phải ngày"}']) {
      store.setItem('pv.referral', raw);
      expect(loadReferral(store)).toBeNull();
      expect(store.getItem('pv.referral')).toBeNull();
    }
  });

  it('không có maxAgeDays hợp lệ thì dùng 30 ngày', () => {
    const store = new MemoryStore();
    store.setItem('pv.referral', JSON.stringify({ code: 'a1b2', visitorId: 'v', clickedAt: '2026-11-20T00:00:00.000Z', maxAgeDays: 'x' }));
    expect(loadReferral(store, day('2026-11-25T00:00:00Z'))?.maxAgeDays).toBe(30);
  });

  it('clearReferral xóa; toOrderCookie bỏ visitorId và bỏ kênh khi không có', () => {
    const store = new MemoryStore();
    saveReferral(store, click({ channelCode: null }));
    const r = loadReferral(store, day('2026-11-21T00:00:00Z'))!;
    expect(toOrderCookie(r)).toEqual({ code: 'linh01', clickedAt: '2026-11-20T00:00:00.000Z', maxAgeDays: 30 });
    expect(toOrderCookie({ ...r, channelCode: 'zalo' })).toMatchObject({ channelCode: 'zalo' });
    clearReferral(store);
    expect(loadReferral(store)).toBeNull();
  });
});

describe('safeStorage', () => {
  it('không có localStorage (hoặc bị chặn) vẫn dùng được, rơi về bộ nhớ trong', () => {
    const s = safeStorage();
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    s.removeItem('k');
    expect(s.getItem('k')).toBeNull();
  });

  it('localStorage ném lỗi (đầy, chặn) thì không làm vỡ ứng dụng', () => {
    const broken = { getItem: vi.fn(() => { throw new Error('chặn'); }), setItem: vi.fn(() => { throw new Error('đầy'); }), removeItem: vi.fn(() => { throw new Error('chặn'); }) };
    vi.stubGlobal('window', { localStorage: broken });
    try {
      const s = safeStorage();
      expect(() => s.setItem('a', '1')).not.toThrow();
      expect(s.getItem('a')).toBe('1');
      expect(() => s.removeItem('a')).not.toThrow();
      expect(s.getItem('a')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('đích của link giới thiệu', () => {
  it('chỉ nhận trang sản phẩm trong cửa hàng', () => {
    expect(landingTarget('/san-pham/tom-kho-ca-mau-200g')).toBe('/san-pham/tom-kho-ca-mau-200g');
  });
  it('mọi giá trị khác về trang chủ', () => {
    for (const v of [null, undefined, '', '/', 'https://evil.example/', '//evil.example', '/admin', '/san-pham/../admin', '/san-pham/A', '/san-pham/' + 'a'.repeat(200), 'javascript:alert(1)']) {
      expect(landingTarget(v as string | null), String(v)).toBe('/');
    }
  });
});
