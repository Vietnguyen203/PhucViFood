import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { signedInTo, signIn } from "../lib/account";
import { api, ApiError, describeError } from "../lib/api";
import { useDocumentTitle } from "../lib/pageTitle";
import { passwordIssues } from "../lib/partnerAuth";
import { safeStorage } from "../lib/storage";
import "../home.css";

const store = safeStorage();

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={`shop-field${error ? " invalid" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}

type Mode = "login" | "register" | "register-partner";

/**
 * Đăng nhập (mọi vai trò, tự vào đúng khu) và hai kiểu đăng ký cùng một khung:
 * "register" cho khách mua hàng (/register), "register-partner" cho cộng tác viên (/affiliate/register).
 */
function AuthForm({ mode }: { mode: Mode }) {
  const isPartner = mode === "register-partner";
  useDocumentTitle(isPartner ? "Đăng ký cộng tác viên" : mode === "register" ? "Đăng ký tài khoản" : "Đăng nhập");
  const navigate = useNavigate();
  const passwordReset = Boolean((useLocation().state as { passwordReset?: boolean } | null)?.passwordReset);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isRegister = mode !== "login";
  const already = signedInTo(store);
  if (already) return <Navigate to={already} replace />;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (mode === "register" && fullName.trim().length < 2) found.fullName = "Vui lòng nhập họ tên (ít nhất 2 ký tự).";
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
      const path = mode === "login" ? "/auth/login" : isPartner ? "/auth/register" : "/auth/register-customer";
      const extra: Record<string, string> = mode === "register" ? { fullName: fullName.trim().replace(/\s+/g, " ") } : {};
      navigate(await signIn(api, store, path, email.trim(), password, extra), { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401 ? "Email hoặc mật khẩu không đúng."
        : e instanceof ApiError && e.status === 403 ? "Tài khoản này đã bị khóa hoặc không có quyền đăng nhập."
        : e instanceof ApiError && e.status === 409 ? "Email này đã được đăng ký, hãy đăng nhập."
        : e instanceof ApiError && e.status === 429 ? "Thử quá nhiều lần, vui lòng đợi một chút."
        : describeError(e),
      );
    } finally { setBusy(false); }
  }

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page shop-auth">
        <form className="shop-card shop-auth-card" onSubmit={submit} noValidate>
          <img className="shop-auth-logo" src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
          <h1 className="shop-title">{isPartner ? "Đăng ký cộng tác viên" : mode === "register" ? "Đăng ký tài khoản" : "Đăng nhập"}</h1>
          <p className="shop-muted">
            {isPartner ? "Tạo tài khoản để nhận link giới thiệu và hoa hồng 10% cho mỗi đơn." : mode === "register" ? "Lưu thông tin giao hàng và xem lại lịch sử đơn hàng của bạn." : ""}
          </p>
          {mode === "register" && (
            <Field label="Họ và tên" error={errors.fullName}>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={100} autoFocus />
            </Field>
          )}
          <Field label="Email" error={errors.email}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus={mode !== "register"} />
          </Field>
          <Field label="Mật khẩu" error={errors.password} hint={isRegister ? "Ít nhất 8 ký tự, có chữ và số." : undefined}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} />
          </Field>
          {isRegister && (
            <Field label="Nhập lại mật khẩu" error={errors.confirm}>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
          )}
          {passwordReset && mode === "login" && <p className="shop-note" role="status">Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.</p>}
          {error && <p className="shop-error" role="alert">{error}</p>}
          <button className="shop-btn primary" type="submit" disabled={busy}>{busy ? "Đang xử lý..." : isRegister ? "Tạo tài khoản" : "Đăng nhập"}</button>
          <p className="shop-auth-links">
            {mode === "login" && <><Link to="/forgot-password">Quên mật khẩu?</Link><br /></>}
            {isRegister
              ? <>Đã có tài khoản? <Link to="/login">Đăng nhập</Link></>
              : <>Chưa có tài khoản? <Link to="/register">Đăng ký</Link></>}
            <br />
            {isPartner
              ? <Link to="/affiliate">Tìm hiểu chương trình cộng tác viên</Link>
              : <>Muốn nhận hoa hồng? <Link to="/affiliate/register">Đăng ký làm cộng tác viên</Link></>}
          </p>
        </form>
      </main>
      <HomeFooter />
    </div>
  );
}

export const LoginPage = () => <AuthForm mode="login" />;
export const RegisterPage = () => <AuthForm mode="register" />;
export const RegisterPartnerPage = () => <AuthForm mode="register-partner" />;
