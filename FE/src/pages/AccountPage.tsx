import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { ApiError, describeError } from "../lib/api";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, type OrderStatus } from "../lib/admin/types";
import { customerAuth } from "../lib/customerAuth";
import { formatVnd } from "../lib/money";
import { useDocumentTitle } from "../lib/pageTitle";
import { passwordIssues } from "../lib/partnerAuth";
import type { PublicOrder } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import "../home.css";

const PAGE_SIZE = 5;
const fmtDate = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour12: false });

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className={`shop-field${error ? " invalid" : ""}`}>
      <span>{label}</span>
      {children}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}

/** Họ tên: xem và đổi. */
function ProfileCard({ email, fullName, onSaved }: { email: string; fullName: string; onSaved: () => void }) {
  const [name, setName] = useState(fullName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2) { setMessage({ ok: false, text: "Họ tên cần ít nhất 2 ký tự." }); return; }
    setBusy(true); setMessage(null);
    try { await customerAuth.updateProfile(clean); setName(clean); setMessage({ ok: true, text: "Đã lưu họ tên." }); onSaved(); } catch (e) { setMessage({ ok: false, text: describeError(e) }); } finally { setBusy(false); }
  }
  return (
    <form className="shop-card" onSubmit={submit} noValidate>
      <h2>Thông tin tài khoản</h2>
      <Field label="Email"><input value={email} readOnly disabled /></Field>
      <Field label="Họ và tên"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" /></Field>
      {message && <p className={message.ok ? "shop-note" : "shop-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <button className="shop-btn primary" type="submit" disabled={busy}>{busy ? "Đang lưu..." : "Lưu thay đổi"}</button>
    </form>
  );
}

/** Đổi mật khẩu: các thiết bị khác bị đăng xuất, thiết bị này giữ nguyên phiên. */
function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (!current) found.current = "Vui lòng nhập mật khẩu hiện tại.";
    const issues = passwordIssues(next);
    if (issues.length > 0) found.next = issues[0];
    if (next !== again) found.again = "Mật khẩu nhập lại không khớp.";
    setErrors(found); setMessage(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await customerAuth.changePassword(current, next);
      setCurrent(""); setNext(""); setAgain("");
      setMessage({ ok: true, text: "Đã đổi mật khẩu. Các thiết bị khác cần đăng nhập lại." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError && e.status === 400 ? "Mật khẩu hiện tại không đúng hoặc mật khẩu mới chưa đạt yêu cầu." : describeError(e) });
    } finally { setBusy(false); }
  }
  return (
    <form className="shop-card" onSubmit={submit} noValidate>
      <h2>Đổi mật khẩu</h2>
      <Field label="Mật khẩu hiện tại" error={errors.current}><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
      <Field label="Mật khẩu mới" error={errors.next}><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Nhập lại mật khẩu mới" error={errors.again}><input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
      {message && <p className={message.ok ? "shop-note" : "shop-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <button className="shop-btn" type="submit" disabled={busy}>{busy ? "Đang đổi..." : "Đổi mật khẩu"}</button>
    </form>
  );
}

/** Chi tiết một đơn của mình (tải khi bấm xem). */
function OrderDetail({ code }: { code: string }) {
  const { data: o, error, loading } = useAsync(async (signal) => (await customerAuth.authed<PublicOrder>(`/my-orders/${encodeURIComponent(code)}`, { signal })).data, [code]);
  if (loading && !o) return <p className="shop-muted">Đang tải...</p>;
  if (error || !o) return <p className="shop-error" role="alert">{describeError(error)}</p>;
  const t = o.transferInstructions;
  return (
    <div className="shop-account-detail">
      <ul>
        {(o.items ?? []).map((i) => <li key={i.productId}><span>{i.name} × {i.quantity}</span><b>{formatVnd(i.lineTotal)}</b></li>)}
      </ul>
      <dl>
        <div><dt>Tạm tính</dt><dd>{formatVnd(o.subtotalAmount)}</dd></div>
        <div><dt>Phí giao hàng</dt><dd>{o.shippingFee === 0 ? "Miễn phí" : formatVnd(o.shippingFee)}</dd></div>
        <div className="total"><dt>Tổng cộng</dt><dd>{formatVnd(o.totalAmount)}</dd></div>
      </dl>
      <p className="shop-muted">Giao tới: {o.shipping.name}, {o.shipping.phone}, {o.shipping.addressLine}, {o.shipping.ward}, {o.shipping.province}</p>
      {t && (
        <p className="shop-note">Chuyển khoản {formatVnd(t.amount)} tới {t.bankName} · {t.accountNo} ({t.accountHolder}), nội dung <b>{t.content}</b>{t.dueAt ? `, trước ${fmtDate(t.dueAt)}` : ""}.</p>
      )}
      {o.history && o.history.length > 0 && (
        <ol className="shop-account-history">
          {o.history.map((h, i) => <li key={i}><span>{ORDER_STATUS_LABEL[h.status as OrderStatus] ?? h.status}</span><time>{fmtDate(h.at)}</time></li>)}
        </ol>
      )}
      <p><Link to={`/don-hang/${encodeURIComponent(o.code)}`}>Mở trang theo dõi đơn (hủy đơn, xác nhận đã nhận hàng)</Link></p>
    </div>
  );
}

/** Danh sách đơn đã đặt khi đăng nhập, mới nhất trước. */
function OrdersCard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync(
    async (signal) => {
      const items: PublicOrder[] = [];
      let last = { page: 1, totalPages: 1, total: 0 };
      for (let page = 1; page <= pages; page++) {
        const r = await customerAuth.authed<PublicOrder[]>(`/my-orders?page=${page}&pageSize=${PAGE_SIZE}`, { signal });
        items.push(...r.data);
        last = r.meta?.pagination ?? last;
      }
      return { items, total: last.total, hasMore: last.page < last.totalPages };
    },
    [pages],
  );
  if (error instanceof ApiError && error.status === 401) onUnauthorized();
  return (
    <div className="shop-card">
      <h2>Đơn hàng của tôi{data ? ` (${data.total})` : ""}</h2>
      {!!error && !(error instanceof ApiError && error.status === 401) && (
        <div className="shop-error" role="alert"><p>{describeError(error)}</p><button className="shop-btn" onClick={reload}>Thử lại</button></div>
      )}
      {loading && !data && <p className="shop-muted">Đang tải...</p>}
      {data && data.items.length === 0 && (
        <p className="shop-muted">Bạn chưa có đơn nào. Đơn đặt khi đã đăng nhập sẽ hiện ở đây. <Link to="/#best-sellers">Xem sản phẩm</Link></p>
      )}
      {data && data.items.length > 0 && (
        <ul className="shop-account-orders">
          {data.items.map((o) => (
            <li key={o.code}>
              <button className="shop-account-row" aria-expanded={open === o.code} onClick={() => setOpen(open === o.code ? null : o.code)}>
                <span><b>{o.code}</b><small>{fmtDate(o.placedAt)}</small></span>
                <span className={`shop-status ${o.status}`}>{ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}</span>
                <span><b>{formatVnd(o.totalAmount)}</b><small>{PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</small></span>
              </button>
              {open === o.code && <OrderDetail code={o.code} />}
            </li>
          ))}
        </ul>
      )}
      {data?.hasMore && <button className="shop-btn" onClick={() => setPages((n) => n + 1)} disabled={loading}>{loading ? "Đang tải..." : "Xem thêm đơn"}</button>}
    </div>
  );
}

/** Trang tài khoản của khách mua hàng: thông tin, đổi mật khẩu, lịch sử đơn. Chưa đăng nhập thì về trang đăng nhập. */
export default function AccountPage() {
  useDocumentTitle("Tài khoản của tôi");
  const navigate = useNavigate();
  const [session, setSession] = useState(() => customerAuth.session());
  if (!session) return <Navigate to="/dang-nhap" replace />;

  async function logout() {
    await customerAuth.logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page shop-account">
        <div className="shop-account-head">
          <h1 className="shop-title">Xin chào, {session.user.fullName || session.user.email}</h1>
          <button className="shop-btn" onClick={() => void logout()}>Đăng xuất</button>
        </div>
        <div className="shop-account-grid">
          <div className="shop-account-side">
            <ProfileCard email={session.user.email} fullName={session.user.fullName ?? ""} onSaved={() => setSession(customerAuth.session())} />
            <PasswordCard />
          </div>
          <OrdersCard onUnauthorized={() => { setSession(null); }} />
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
