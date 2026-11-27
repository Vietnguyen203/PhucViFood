import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { api, ApiError, describeError } from "../lib/api";
import { useDocumentTitle } from "../lib/pageTitle";
import { passwordIssues } from "../lib/partnerAuth";
import "../home.css";

function Shell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page shop-auth">
        <div className="shop-card shop-auth-card">
          <img className="shop-auth-logo" src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
          <h1 className="shop-title">{title}</h1>
          {intro && <p className="shop-muted">{intro}</p>}
          {children}
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className={`shop-field${error ? " invalid" : ""}`}>
      <span>{label}</span>
      {children}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}

/** Quên mật khẩu: nhập email, hệ thống gửi liên kết đặt lại. Luôn báo "đã gửi" như nhau để không lộ email nào có tài khoản. */
export function ForgotPasswordPage() {
  useDocumentTitle("Quên mật khẩu");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (!email.trim()) { setError("Vui lòng nhập email."); return; }
    setBusy(true); setError(null);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 ? "Email chưa đúng định dạng." : e instanceof ApiError && e.status === 429 ? "Thử quá nhiều lần, vui lòng đợi một chút." : describeError(e));
    } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <Shell title="Kiểm tra email của bạn">
        <p className="shop-note" role="status">Nếu <b>{email.trim()}</b> có tài khoản, chúng tôi vừa gửi một liên kết đặt lại mật khẩu (có hiệu lực 60 phút). Hãy kiểm tra cả thư mục thư rác.</p>
        <p className="shop-auth-links"><Link to="/dang-nhap">Quay lại đăng nhập</Link></p>
      </Shell>
    );
  }
  return (
    <Shell title="Quên mật khẩu" intro="Nhập email đăng ký, chúng tôi sẽ gửi liên kết để đặt mật khẩu mới.">
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 14 }}>
        <Field label="Email" error={error ?? undefined}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        </Field>
        <button className="shop-btn primary" type="submit" disabled={busy}>{busy ? "Đang gửi..." : "Gửi liên kết đặt lại"}</button>
        <p className="shop-auth-links"><Link to="/dang-nhap">Quay lại đăng nhập</Link></p>
      </form>
    </Shell>
  );
}

/** Đặt mật khẩu mới từ liên kết trong thư (?token=...). Thành công thì chuyển về đăng nhập. */
export function ResetPasswordPage() {
  useDocumentTitle("Đặt lại mật khẩu");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    const issues = passwordIssues(password);
    if (issues.length > 0) found.password = issues[0];
    if (password !== confirm) found.confirm = "Mật khẩu nhập lại không khớp.";
    setErrors(found); setMessage(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, newPassword: password } });
      navigate("/dang-nhap", { replace: true, state: { passwordReset: true } });
    } catch (e) {
      setMessage(e instanceof ApiError && e.status === 400 ? "Liên kết không hợp lệ hoặc đã hết hạn." : describeError(e));
    } finally { setBusy(false); }
  }

  if (token.length < 20) {
    return (
      <Shell title="Liên kết không hợp lệ">
        <p className="shop-error" role="alert">Liên kết đặt lại mật khẩu thiếu hoặc không đúng.</p>
        <p className="shop-auth-links"><Link to="/quen-mat-khau">Yêu cầu liên kết mới</Link></p>
      </Shell>
    );
  }
  return (
    <Shell title="Đặt mật khẩu mới">
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 14 }}>
        <Field label="Mật khẩu mới" error={errors.password}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
        <Field label="Nhập lại mật khẩu mới" error={errors.confirm}>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {message && <p className="shop-error" role="alert">{message} <Link to="/quen-mat-khau">Yêu cầu liên kết mới</Link></p>}
        <button className="shop-btn primary" type="submit" disabled={busy}>{busy ? "Đang lưu..." : "Đặt mật khẩu"}</button>
      </form>
    </Shell>
  );
}
