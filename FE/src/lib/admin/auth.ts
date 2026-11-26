// Đăng nhập quản trị: giữ phiên (access + refresh token) và gọi API kèm token, tự làm mới khi hết hạn.
import { ApiError, type ApiRequest, type ApiResult, type createApi } from '../api';
import type { KeyValueStore } from '../storage';

export interface AdminUser { id: string; email: string; role: string }
export interface Session { accessToken: string; refreshToken: string; user: AdminUser }
type Api = ReturnType<typeof createApi>;

export const SESSION_KEY = 'pv.admin.session';

export function createSessionStore(store: KeyValueStore, key = SESSION_KEY) {
  return {
    load(): Session | null {
      try {
        const v = JSON.parse(store.getItem(key) ?? 'null') as Partial<Session> | null;
        return v?.accessToken && v.refreshToken && v.user?.role ? (v as Session) : null;
      } catch { return null; }
    },
    save(s: Session) { store.setItem(key, JSON.stringify(s)); },
    clear() { store.removeItem(key); },
  };
}

interface TokenPayload { user: AdminUser; accessToken: string; refreshToken: string }

export interface AdminAuthOptions {
  api: Api; store: KeyValueStore; onSessionLost?: () => void;
  /** Vai trò được phép vào khu vực này (mặc định ADMIN; khu CTV dùng AFFILIATE). */
  role?: string;
  /** Khóa lưu phiên; mỗi khu vực một khóa để hai phiên không đè nhau. */
  sessionKey?: string;
}

export function createAdminAuth({ api, store, onSessionLost, role = 'ADMIN', sessionKey }: AdminAuthOptions) {
  const sessions = createSessionStore(store, sessionKey);
  let refreshing: Promise<Session | null> | null = null;

  /** Đăng nhập hoặc đăng ký; chỉ nhận đúng vai trò của khu vực (tài khoản khác không lưu phiên, tránh vào nhầm khu). */
  async function authenticate(path: '/auth/login' | '/auth/register', email: string, password: string): Promise<Session> {
    const { data } = await api<TokenPayload>(path, { method: 'POST', body: { email, password } });
    if (data.user.role !== role) throw new ApiError(403, 'FORBIDDEN', 'Tài khoản này không có quyền vào khu vực này.');
    const s: Session = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user };
    sessions.save(s);
    return s;
  }
  const login = (email: string, password: string) => authenticate('/auth/login', email, password);
  const register = (email: string, password: string) => authenticate('/auth/register', email, password);

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

  return { login, register, logout, authed, session: () => sessions.load() };
}
export type AdminAuth = ReturnType<typeof createAdminAuth>;
