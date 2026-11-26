import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError, describeError } from "../lib/api";
import { useAdmin } from "./AdminContext";
import { Field } from "./ui";
import "./admin.css";

export default function LoginPage() {
  const { session, login } = useAdmin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session) return <Navigate to="/admin/don-hang" replace />;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) { setError("Vui lòng nhập email và mật khẩu."); return; }
    setBusy(true); setError(null);
    try { await login(email.trim(), password); navigate("/admin/don-hang", { replace: true }); } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Email hoặc mật khẩu không đúng." : e instanceof ApiError && e.status === 429 ? "Thử quá nhiều lần, vui lòng đợi một chút." : describeError(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="ad-login">
      <form className="ad-card" onSubmit={submit} noValidate>
        <h1>Đăng nhập quản trị</h1>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></Field>
        <Field label="Mật khẩu"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        {error && <p className="ad-error" role="alert">{error}</p>}
        <button className="ad-btn primary block" type="submit" disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
      </form>
    </div>
  );
}
