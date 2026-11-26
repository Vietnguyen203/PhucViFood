import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type ApiRequest, type ApiResult } from "../lib/api";
import { createAdminAuth, type AdminAuth, type Session } from "../lib/admin/auth";
import { safeStorage } from "../lib/storage";

export interface Toast { id: number; kind: "ok" | "error"; text: string }

interface AdminContextValue {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Gọi API quản trị kèm token (tự làm mới khi hết hạn). */
  adm: <T>(path: string, req?: ApiRequest) => Promise<ApiResult<T>>;
  auth: AdminAuth;
  toasts: Toast[];
  notify: (text: string, kind?: Toast["kind"]) => void;
}

const Ctx = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const lost = useRef<() => void>(() => {});
  // Khởi tạo một lần: phiên đọc từ localStorage; mất phiên (refresh bị từ chối) thì về trạng thái chưa đăng nhập.
  const [auth] = useState(() => createAdminAuth({ api, store: safeStorage(), onSessionLost: () => lost.current() }));
  const [session, setSession] = useState<Session | null>(() => auth.session());
  lost.current = () => setSession(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const login = useCallback(async (email: string, password: string) => { setSession(await auth.login(email, password)); }, [auth]);
  const logout = useCallback(async () => { setSession(null); await auth.logout(); }, [auth]);
  const notify = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const value = useMemo<AdminContextValue>(() => ({ session, login, logout, adm: auth.authed, auth, toasts, notify }), [session, login, logout, auth, toasts, notify]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin phải nằm trong AdminProvider");
  return v;
}
