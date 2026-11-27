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
    expect(to).toBe('/ctv/tai-khoan');
    expect(store.getItem('pv.partner.session')).toContain('AFFILIATE');
    expect(store.getItem('pv.admin.session')).toBeNull();
  });

  it('vai trò lạ: báo lỗi và không lưu phiên', async () => {
    const store = new MemoryStore();
    await expect(signIn(apiWith(() => ok(tokens('CUSTOMER'))), store, '/auth/login', 'a@b.vn', 'x')).rejects.toThrow();
    expect(store.getItem('pv.admin.session')).toBeNull();
    expect(store.getItem('pv.partner.session')).toBeNull();
    expect(areaFor('CUSTOMER')).toBeNull();
  });

  it('nhận ra máy đã đăng nhập, ưu tiên quản trị', async () => {
    const store = new MemoryStore();
    expect(signedInTo(store)).toBeNull();
    await signIn(apiWith(() => ok(tokens('AFFILIATE'))), store, '/auth/login', 'c@d.vn', 'x');
    expect(signedInTo(store)).toBe('/ctv/tai-khoan');
    await signIn(apiWith(() => ok(tokens('ADMIN'))), store, '/auth/login', 'a@b.vn', 'x');
    expect(signedInTo(store)).toBe('/admin');
  });
});
