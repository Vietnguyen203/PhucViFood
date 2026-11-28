import { describe, expect, it, vi } from 'vitest';
import { createApi } from './api';
import { areaFor, signedInTo, signIn } from './account';
import { MemoryStore } from './storage';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const apiWith = (handler: (url: string) => Response) => createApi({ baseUrl: '/api', fetch: vi.fn(async (u: string | URL | Request) => handler(String(u))) as unknown as typeof fetch });
const tokens = (role: string) => ({ user: { id: 'u1', email: 'a@b.vn', role }, accessToken: 'acc', refreshToken: 'r'.repeat(30) });

describe('đăng nhập chung', () => {
  it('ADMIN vào /admin, phiên lưu ở khóa quản trị', async () => {
    const store = new MemoryStore();
    const to = await signIn(apiWith(() => ok(tokens('ADMIN'))), store, '/auth/login', 'a@b.vn', 'x');
    expect(to).toBe('/admin');
    expect(store.getItem('pv.admin.session')).toContain('"acc"');
    expect(store.getItem('pv.partner.session')).toBeNull();
  });

  it('AFFILIATE vào khu CTV, phiên lưu ở khóa CTV', async () => {
    const store = new MemoryStore();
    const to = await signIn(apiWith(() => ok(tokens('AFFILIATE'))), store, '/auth/register', 'c@d.vn', 'x');
    expect(to).toBe('/affiliate/account');
    expect(store.getItem('pv.partner.session')).toContain('AFFILIATE');
    expect(store.getItem('pv.admin.session')).toBeNull();
  });

  it('CUSTOMER vào /account, phiên lưu ở khóa khách; trường thêm của form đăng ký được gửi đi', async () => {
    const store = new MemoryStore();
    let sent = '';
    const api = createApi({ baseUrl: '/api', fetch: vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { sent = String(init?.body); return ok(tokens('CUSTOMER')); }) as unknown as typeof fetch });
    const to = await signIn(api, store, '/auth/register-customer', 'k@d.vn', 'x', { fullName: 'Khách A' });
    expect(to).toBe('/account');
    expect(JSON.parse(sent)).toEqual({ email: 'k@d.vn', password: 'x', fullName: 'Khách A' });
    expect(store.getItem('pv.customer.session')).toContain('CUSTOMER');
    expect(store.getItem('pv.admin.session')).toBeNull();
    expect(store.getItem('pv.partner.session')).toBeNull();
  });

  it('vai trò lạ: báo lỗi và không lưu phiên', async () => {
    const store = new MemoryStore();
    await expect(signIn(apiWith(() => ok(tokens('SUPPORT'))), store, '/auth/login', 'a@b.vn', 'x')).rejects.toThrow();
    for (const k of ['pv.admin.session', 'pv.partner.session', 'pv.customer.session']) expect(store.getItem(k)).toBeNull();
    expect(areaFor('SUPPORT')).toBeNull();
  });

  it('nhận ra máy đã đăng nhập, ưu tiên quản trị', async () => {
    const store = new MemoryStore();
    expect(signedInTo(store)).toBeNull();
    await signIn(apiWith(() => ok(tokens('AFFILIATE'))), store, '/auth/login', 'c@d.vn', 'x');
    expect(signedInTo(store)).toBe('/affiliate/account');
    await signIn(apiWith(() => ok(tokens('ADMIN'))), store, '/auth/login', 'a@b.vn', 'x');
    expect(signedInTo(store)).toBe('/admin');
  });

  it('khách đã đăng nhập: vào /account (sau quản trị và CTV)', async () => {
    const store = new MemoryStore();
    await signIn(apiWith(() => ok(tokens('CUSTOMER'))), store, '/auth/login', 'k@d.vn', 'x');
    expect(signedInTo(store)).toBe('/account');
    await signIn(apiWith(() => ok(tokens('AFFILIATE'))), store, '/auth/login', 'c@d.vn', 'x');
    expect(signedInTo(store)).toBe('/affiliate/account');
  });
});
