// Đăng nhập quản trị: giữ phiên (access + refresh token) và gọi API kèm token, tự làm mới khi hết hạn.
import { ApiError, type ApiRequest, type ApiResult, type createApi } from '../api';
import type { KeyValueStore } from '../storage';

export interface AdminUser { id: string; email: string; role: string }
export interface Session { accessToken: string; refreshToken: string; user: AdminUser }
type Api = ReturnType<typeof createApi>;

export const SESSION_KEY = 'pv.admin.session';

export function createSessionStore(store: KeyValueStore) {
  return {
    load(): Session | null {
      try {
        const v = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as Partial<Session> | null;
        return v?.accessToken && v.refreshToken && v.user?.role ? (v as Session) : null;
      } catch { return null; }
    },
    save(s: Session) { store.setItem(SESSION_KEY, JSON.stringify(s)); },
    clear() { store.removeItem(SESSION_KEY); },
  };
}

interface TokenPayload { user: AdminUser; accessToken: string; refreshToken: string }

export interface AdminAuthOptions { api: Api; store: KeyValueStore; onSessionLost?: () => void }

export function createAdminAuth({ api, store, onSessionLost }: AdminAuthOptions) {
  const sessions = createSessionStore(store);
  let refreshing: Promise<Session | null> | null = null;

  /** Đăng nhập; chỉ nhận ADMIN (tài khoản khác đăng nhập được nhưng không có quyền, nên từ chối sớm và không lưu phiên). */
  async function login(email: string, password: string): Promise<Session> {
    const { data } = await api<TokenPayload>('/auth/login', { method: 'POST', body: { email, password } });
    if (data.user.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Tài khoản này không có quyền quản trị.');
    const s: Session = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user };
    sessions.save(s);
    return s;
  }

  async function logout(): Promise<void> {
    const s = sessions.load();
    sessions.clear();
    if (s) { try { await api('/auth/logout', { method: 'POST', body: { refreshToken: s.refreshToken }, token: s.accessToken, timeoutMs: 5000 }); } catch { /* đã xóa phiên cục bộ */ } }
  }

  /** Một lần làm mới dùng chung cho nhiều yêu cầu cùng hết hạn (refresh token chỉ dùng được một lần). */
  function refresh(stale: Session): Promise<Session | null> {
    refreshing ??= (async () => {
      try {
        const { data } = await api<TokenPayload>('/auth/refresh', { method: 'POST', body: { refreshToken: stale.refreshToken } });
        const s: Session = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user ?? stale.user };
        sessions.save(s);
        return s;
      } catch (e) {
        // Mất mạng không có nghĩa là phiên hỏng: chỉ bỏ phiên khi máy chủ từ chối dứt khoát.
        if (e instanceof ApiError && !e.isTransient) { sessions.clear(); onSessionLost?.(); return null; }
        throw e;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  /** Gọi API kèm token; 401 thì làm mới token rồi thử lại đúng một lần. */
  async function authed<T>(path: string, req: ApiRequest = {}): Promise<ApiResult<T>> {
    const s = sessions.load();
    if (!s) { onSessionLost?.(); throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại.'); }
    try {
      return await api<T>(path, { ...req, token: s.accessToken });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      // Token đã được tab khác làm mới thì dùng luôn token mới, không làm mới lần nữa.
      const current = sessions.load();
      const next = current && current.accessToken !== s.accessToken ? current : await refresh(s);
      if (!next) throw e;
      return api<T>(path, { ...req, token: next.accessToken });
    }
  }

  return { login, logout, authed, session: () => sessions.load() };
}
export type AdminAuth = ReturnType<typeof createAdminAuth>;
