// Đăng nhập quản trị: giữ phiên (access + refresh token) và gọi API kèm token, tự làm mới khi hết hạn.
import { ApiError, type ApiRequest, type ApiResult, type createApi } from '../api';
import type { KeyValueStore } from '../storage';

export interface AdminUser { id: string; email: string; role: string; /** Họ tên hiển thị (khách đăng ký tài khoản có; admin và CTV có thể không). */ fullName?: string | null }
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

  /** Đổi mật khẩu của chính mình: máy chủ thu hồi mọi phiên cũ và cấp cặp token mới cho phiên này. */
  async function changePassword(currentPassword: string, newPassword: string): Promise<Session> {
    const { data } = await authed<TokenPayload>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    const s: Session = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user };
    sessions.save(s);
    return s;
  }

  /** Giây còn lại của access token (đọc từ trường exp trong JWT, không kiểm tra chữ ký); không đọc được thì 0. */
  function secondsLeft(token: string): number {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      return typeof payload.exp === 'number' ? payload.exp - Math.floor(Date.now() / 1000) : 0;
    } catch { return 0; }
  }

  /**
   * Access token còn hạn dùng (làm mới trước nếu sắp hết), hoặc null nếu chưa đăng nhập / phiên đã hết.
   * Dùng cho API công khai có đọc token tùy chọn (vd đặt hàng): token hết hạn ở đó không báo 401 mà lặng lẽ coi là khách vãng lai.
   */
  async function freshAccessToken(): Promise<string | null> {
    const s = sessions.load();
    if (!s) return null;
    if (secondsLeft(s.accessToken) > 30) return s.accessToken;
    try { return (await refresh(s))?.accessToken ?? null; } catch { return null; }
  }

  /** Đổi họ tên hiển thị của chính mình và cập nhật phiên đang lưu. */
  async function updateProfile(fullName: string): Promise<Session> {
    const { data } = await authed<AdminUser>('/auth/me', { method: 'PATCH', body: { fullName } });
    const cur = sessions.load();
    if (!cur) throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại.');
    const s: Session = { ...cur, user: { ...cur.user, fullName: data.fullName ?? fullName } };
    sessions.save(s);
    return s;
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

  return { login, register, logout, changePassword, freshAccessToken, updateProfile, authed, session: () => sessions.load() };
}
export type AdminAuth = ReturnType<typeof createAdminAuth>;
