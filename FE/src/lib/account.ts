// Đăng nhập chung cho cửa hàng: một trang đăng nhập, vào đúng khu theo vai trò (ADMIN -> /admin, AFFILIATE -> /ctv/tai-khoan).
import type { createApi } from './api';
import { createSessionStore, SESSION_KEY as ADMIN_KEY, type Session } from './admin/auth';
import type { KeyValueStore } from './storage';

type Api = ReturnType<typeof createApi>;

export const PARTNER_KEY = 'pv.partner.session';

/** Khóa lưu phiên và trang đích theo vai trò; vai trò lạ thì không có khu để vào. */
const AREAS: Record<string, { key: string; to: string }> = {
  ADMIN: { key: ADMIN_KEY, to: '/admin' },
  AFFILIATE: { key: PARTNER_KEY, to: '/ctv/tai-khoan' },
};

export const areaFor = (role: string): { key: string; to: string } | null => AREAS[role] ?? null;

/** Đăng nhập hoặc đăng ký; lưu phiên vào đúng khu và trả đường dẫn để chuyển tới. Vai trò không có khu thì không lưu gì. */
export async function signIn(api: Api, store: KeyValueStore, path: '/auth/login' | '/auth/register', email: string, password: string): Promise<string> {
  const { data } = await api<Session>(path, { method: 'POST', body: { email, password } });
  const area = areaFor(data.user.role);
  if (!area) throw new Error('Tài khoản này không có quyền vào khu vực nào.');
  createSessionStore(store, area.key).save({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return area.to;
}

/** Trang đích nếu máy này đã đăng nhập (ưu tiên quản trị); chưa đăng nhập thì null. */
export function signedInTo(store: KeyValueStore): string | null {
  for (const role of ['ADMIN', 'AFFILIATE']) {
    const area = AREAS[role];
    if (createSessionStore(store, area.key).load()) return area.to;
  }
  return null;
}
