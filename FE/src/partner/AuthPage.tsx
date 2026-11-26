import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ApiError, describeError } from "../lib/api";
import { passwordIssues } from "../lib/partnerAuth";
import { useAdmin } from "../admin/AdminContext";
import { Field, fieldErrors } from "../admin/ui";
import "../admin/admin.css";

/** Đăng nhập hoặc đăng ký cộng tác viên (cùng một trang, hai chế độ). Đăng ký xong vào luôn khu CTV để điền hồ sơ. */
export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { session, login, register } = useAdmin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (session) return <Navigate to="/ctv/tai-khoan" replace />;
  const isRegister = mode === "register";

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (!email.trim()) found.email = "Vui lòng nhập email.";
    if (!password) found.password = "Vui lòng nhập mật khẩu.";
    if (isRegister) {
      const issues = passwordIssues(password);
      if (password && issues.length > 0) found.password = issues[0];
      if (password !== confirm) found.confirm = "Mật khẩu nhập lại không khớp.";
    }
    setErrors(found); setError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await (isRegister ? register : login)(email.trim(), password);
      navigate("/ctv/tai-khoan", { replace: true });
    } catch (e) {
      const fe = fieldErrors(e);
      if (Object.keys(fe).length > 0) setErrors(fe);
      setError(
        e instanceof ApiError && e.status === 401 ? "Email hoặc mật khẩu không đúng."
        : e instanceof ApiError && e.status === 409 ? "Email này đã được đăng ký, hãy đăng nhập."
        : e instanceof ApiError && e.status === 429 ? "Thử quá nhiều lần, vui lòng đợi một chút."
        : e instanceof ApiError && e.status === 403 ? "Tài khoản này không phải tài khoản cộng tác viên."
        : describeError(e),
      );
    } finally { setBusy(false); }
  }

  return (
    <div className="ad-login">
      <form className="ad-card" onSubmit={submit} noValidate>
        <h1>{isRegister ? "Đăng ký cộng tác viên" : "Đăng nhập cộng tác viên"}</h1>
        <Field label="Email" error={errors.email}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></Field>
        <Field label="Mật khẩu" error={errors.password} hint={isRegister ? "Ít nhất 8 ký tự, có chữ và số." : undefined}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} /></Field>
        {isRegister && <Field label="Nhập lại mật khẩu" error={errors.confirm}><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>}
        {error && <p className="ad-error" role="alert">{error}</p>}
        <button className="ad-btn primary block" type="submit" disabled={busy}>{busy ? "Đang xử lý..." : isRegister ? "Tạo tài khoản" : "Đăng nhập"}</button>
        <p className="ad-muted" style={{ textAlign: "center" }}>
          {isRegister ? <>Đã có tài khoản? <Link className="ad-link" to="/ctv/dang-nhap">Đăng nhập</Link></> : <>Chưa có tài khoản? <Link className="ad-link" to="/ctv/dang-ky">Đăng ký CTV</Link></>}
          {" · "}<Link className="ad-link" to="/ctv">Về trang giới thiệu</Link>
        </p>
      </form>
    </div>
  );
}
