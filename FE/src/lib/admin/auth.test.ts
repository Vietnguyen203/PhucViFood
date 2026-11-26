import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from '../api';
import { MemoryStore } from '../storage';
import { createAdminAuth, SESSION_KEY } from './auth';
import { buildQuery } from './query';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const fail = (status: number, code = 'UNAUTHORIZED') => new Response(JSON.stringify({ success: false, error: { code, message: 'x' } }), { status });
const user = { id: 'u1', email: 'a@b.vn', role: 'ADMIN' };
const bearer = (init: RequestInit) => (init.headers as Record<string, string>).authorization;

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return handler(String(url), init ?? {}); });
  const store = new MemoryStore();
  const lost = vi.fn();
  const auth = createAdminAuth({ api: createApi({ baseUrl: '/api', fetch: f as unknown as typeof fetch }), store, onSessionLost: lost });
  return { auth, store, calls, lost };
}
const seed = (store: MemoryStore, access = 'old') => store.setItem(SESSION_KEY, JSON.stringify({ accessToken: access, refreshToken: 'r'.repeat(30), user }));

describe('đăng nhập quản trị', () => {
  it('lưu phiên khi là ADMIN', async () => {
    const { auth, store } = setup(() => ok({ user, accessToken: 'a', refreshToken: 'r' }));
    await auth.login('a@b.vn', 'x');
    expect(auth.session()?.accessToken).toBe('a');
    expect(store.getItem(SESSION_KEY)).toContain('"a"');
  });
  it('từ chối tài khoản không phải ADMIN và không lưu phiên', async () => {
    const { auth } = setup(() => ok({ user: { ...user, role: 'AFFILIATE' }, accessToken: 'a', refreshToken: 'r' }));
    await expect(auth.login('a@b.vn', 'x')).rejects.toMatchObject({ status: 403 });
    expect(auth.session()).toBeNull();
  });
  it('sai mật khẩu: ném ApiError, không có phiên', async () => {
    const { auth } = setup(() => fail(401, 'INVALID_CREDENTIALS'));
    await expect(auth.login('a@b.vn', 'x')).rejects.toBeInstanceOf(ApiError);
    expect(auth.session()).toBeNull();
  });
});

describe('gọi API có token', () => {
  it('không có phiên: báo mất phiên', async () => {
    const { auth, lost } = setup(() => ok(1));
    await expect(auth.authed('/x')).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalled();
  });
  it('gắn Bearer token', async () => {
    const { auth, store, calls } = setup(() => ok({ a: 1 }));
    seed(store);
    await auth.authed('/orders');
    expect(bearer(calls[0].init)).toBe('Bearer old');
  });
  it('401: làm mới rồi thử lại đúng một lần', async () => {
    const { auth, store, calls } = setup((url, init) => {
      if (url.endsWith('/auth/refresh')) return ok({ user, accessToken: 'new', refreshToken: 'r2' });
      return bearer(init) === 'Bearer new' ? ok('đã vào') : fail(401);
    });
    seed(store);
    expect((await auth.authed('/orders')).data).toBe('đã vào');
    expect(calls.map((c) => c.url)).toEqual(['/api/orders', '/api/auth/refresh', '/api/orders']);
    expect(auth.session()?.refreshToken).toBe('r2');
  });
  it('nhiều yêu cầu cùng 401 chỉ làm mới một lần', async () => {
    let refreshes = 0;
    const { auth, store } = setup(async (url, init) => {
      if (url.endsWith('/auth/refresh')) { refreshes++; await new Promise((r) => setTimeout(r, 10)); return ok({ user, accessToken: 'new', refreshToken: 'r2' }); }
      return bearer(init) === 'Bearer new' ? ok(1) : fail(401);
    });
    seed(store);
    await Promise.all([auth.authed('/a'), auth.authed('/b'), auth.authed('/c')]);
    expect(refreshes).toBe(1);
  });
  it('làm mới bị từ chối: xóa phiên và báo mất phiên', async () => {
    const { auth, store, lost } = setup((url) => (url.endsWith('/auth/refresh') ? fail(401, 'INVALID_REFRESH_TOKEN') : fail(401)));
    seed(store);
    await expect(auth.authed('/orders')).rejects.toMatchObject({ status: 401 });
    expect(auth.session()).toBeNull();
    expect(lost).toHaveBeenCalled();
  });
  it('làm mới gặp lỗi mạng: giữ phiên', async () => {
    const { auth, store, lost } = setup((url) => { if (url.endsWith('/auth/refresh')) throw new TypeError('net'); return fail(401); });
    seed(store);
    await expect(auth.authed('/orders')).rejects.toMatchObject({ code: 'NETWORK' });
    expect(auth.session()).not.toBeNull();
    expect(lost).not.toHaveBeenCalled();
  });
  it('lỗi khác 401 không làm mới', async () => {
    const { auth, store, calls } = setup(() => fail(403, 'FORBIDDEN'));
    seed(store);
    await expect(auth.authed('/orders')).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
  });
  it('đăng xuất xóa phiên dù máy chủ lỗi', async () => {
    const { auth, store } = setup(() => fail(500, 'X'));
    seed(store);
    await auth.logout();
    expect(auth.session()).toBeNull();
  });
});

describe('buildQuery', () => {
  it('rỗng', () => expect(buildQuery()).toBe(''));
  it('trang 1 không ghi, bỏ giá trị rỗng', () => {
    expect(buildQuery({ page: 1, filters: { status: '', x: undefined } })).toBe('');
  });
  it('đủ tham số', () => {
    const s = decodeURIComponent(buildQuery({ page: 2, pageSize: 20, sort: '-placedAt', q: ' abc ', filters: { status: 'PLACED', isVisible: false, placedAt: { gte: '2026-01-01', lte: '' } }, extra: { tier: 'VIP' } }));
    expect(s).toBe('?page=2&pageSize=20&sort=-placedAt&q=abc&filter[status]=PLACED&filter[isVisible]=false&filter[placedAt][gte]=2026-01-01&tier=VIP');
  });
});
