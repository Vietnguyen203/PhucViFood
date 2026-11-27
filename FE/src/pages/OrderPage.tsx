import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { ApiError, describeError } from "../lib/api";
import { formatVnd } from "../lib/money";
import { cancelOrder, confirmReceived, lookupOrder } from "../lib/orders";
import type { OrderStatus, PaymentStatus, PublicOrder } from "../lib/types";
import { LAST_ORDER_KEY } from "./CheckoutPage";
import { useDocumentTitle } from "../lib/pageTitle";
import "../home.css";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "Đã đặt hàng", CONFIRMED: "Đã xác nhận", SHIPPING: "Đang giao hàng", DELIVERED: "Đã giao hàng",
  COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy", RETURNED: "Đã hoàn trả",
};
export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Thanh toán khi nhận hàng", UNPAID: "Chờ chuyển khoản", PAID: "Đã thanh toán", REFUNDED: "Đã hoàn tiền",
};

/** Các bước bình thường của một đơn, để vẽ tiến trình. Đơn hủy hoặc hoàn trả hiển thị riêng. */
const STEPS: OrderStatus[] = ["PLACED", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"];

const fmtDate = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour12: false });

function readLastOrder(code: string | undefined): { code: string; phone: string } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY) ?? "null") as { code?: string; phone?: string } | null;
    if (v?.code && v.phone && (!code || v.code.toUpperCase() === code.toUpperCase())) return { code: v.code, phone: v.phone };
  } catch { /* bỏ qua */ }
  return null;
}

function lookupMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return "Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã đơn và số điện thoại đã dùng khi đặt hàng.";
  if (e instanceof ApiError && e.status === 429) return "Bạn tra cứu quá nhanh, vui lòng đợi một chút rồi thử lại.";
  return describeError(e);
}

function OrderDetail({ order, onChange, phone }: { order: PublicOrder; onChange: (o: PublicOrder) => void; phone: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const t = order.transferInstructions;
  const canCancel = order.status === "PLACED" || order.status === "CONFIRMED";
  const canConfirm = order.status === "DELIVERED";
  const stepIndex = STEPS.indexOf(order.status);

  async function act(fn: () => Promise<PublicOrder>) {
    setBusy(true);
    setMessage(null);
    try { onChange(await fn()); setCancelling(false); } catch (e) { setMessage(describeError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="shop-card shop-order">
      <header>
        <div>
          <small>Mã đơn hàng</small>
          <h2>{order.code}</h2>
          <span>Đặt lúc {fmtDate(order.placedAt)}</span>
        </div>
        <div className="shop-badges">
          <b className={`status ${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status]}</b>
          <b className="pay">{PAYMENT_LABEL[order.paymentStatus]}</b>
        </div>
      </header>

      {stepIndex >= 0 ? (
        <ol className="shop-steps" aria-label="Tiến trình đơn hàng">
          {STEPS.map((s, i) => <li key={s} className={i <= stepIndex ? "done" : ""}><span>{i + 1}</span>{STATUS_LABEL[s]}</li>)}
        </ol>
      ) : (
        <p className="shop-note">{order.status === "CANCELLED" ? `Đơn hàng đã bị hủy${order.cancelledAt ? ` lúc ${fmtDate(order.cancelledAt)}` : ""}.` : "Đơn hàng đã được hoàn trả."}</p>
      )}

      {t && (
        <section className="shop-transfer">
          <h3>Thông tin chuyển khoản</h3>
          <dl>
            <div><dt>Ngân hàng</dt><dd>{t.bankName}</dd></div>
            <div><dt>Số tài khoản</dt><dd>{t.accountNo}</dd></div>
            <div><dt>Chủ tài khoản</dt><dd>{t.accountHolder}</dd></div>
            <div><dt>Số tiền</dt><dd>{formatVnd(t.amount)}</dd></div>
            <div><dt>Nội dung chuyển khoản</dt><dd><b>{t.content}</b></dd></div>
          </dl>
          <p>Vui lòng ghi đúng nội dung chuyển khoản là mã đơn để được xác nhận nhanh.{t.dueAt && <> Đơn sẽ <b>tự động hủy</b> nếu chưa thanh toán trước <b>{fmtDate(t.dueAt)}</b>.</>}</p>
        </section>
      )}

      <section>
        <h3>Sản phẩm</h3>
        <table className="shop-table">
          <thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr></thead>
          <tbody>
            {(order.items ?? []).map((i) => (
              <tr key={i.productId}><td>{i.name}</td><td>{formatVnd(i.unitPrice)}</td><td>{i.quantity}</td><td>{formatVnd(i.lineTotal)}</td></tr>
            ))}
          </tbody>
        </table>
        <dl className="shop-totals">
          <div><dt>Tạm tính</dt><dd>{formatVnd(order.subtotalAmount)}</dd></div>
          <div><dt>Phí giao hàng</dt><dd>{order.shippingFee === 0 ? "Miễn phí" : formatVnd(order.shippingFee)}</dd></div>
          <div className="total"><dt>Tổng cộng</dt><dd>{formatVnd(order.totalAmount)}</dd></div>
        </dl>
      </section>

      <section>
        <h3>Giao đến</h3>
        <p className="shop-address"><b>{order.shipping.name}</b> · {order.shipping.phone}<br />{order.shipping.addressLine}, {order.shipping.ward}, {order.shipping.province}</p>
      </section>

      {order.history && order.history.length > 0 && (
        <section>
          <h3>Lịch sử</h3>
          <ul className="shop-history">
            {order.history.map((h, i) => <li key={i}><b>{STATUS_LABEL[h.status]}</b><span>{fmtDate(h.at)}</span></li>)}
          </ul>
        </section>
      )}

      {(canCancel || canConfirm) && (
        <section className="shop-actions">
          {canConfirm && <button className="shop-btn primary" disabled={busy} onClick={() => act(() => confirmReceived(order.code, phone))}>Tôi đã nhận được hàng</button>}
          {canCancel && !cancelling && <button className="shop-btn" disabled={busy} onClick={() => setCancelling(true)}>Hủy đơn hàng</button>}
          {canCancel && cancelling && (
            <div className="shop-cancel">
              <label className="shop-field"><span>Lý do hủy (không bắt buộc)</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} /></label>
              <div>
                <button className="shop-btn danger" disabled={busy} onClick={() => act(() => cancelOrder(order.code, phone, reason))}>{busy ? "Đang hủy..." : "Xác nhận hủy đơn"}</button>
                <button className="shop-btn" disabled={busy} onClick={() => setCancelling(false)}>Không hủy</button>
              </div>
            </div>
          )}
          {message && <p className="shop-error" role="alert">{message}</p>}
        </section>
      )}
    </div>
  );
}

export default function OrderPage() {
  useDocumentTitle("Tra cứu đơn hàng");
  const { code: codeParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const justPlaced = Boolean((location.state as { justPlaced?: boolean } | null)?.justPlaced);
  const remembered = readLastOrder(codeParam);
  const [code, setCode] = useState(codeParam ?? "");
  const [phone, setPhone] = useState(remembered?.phone ?? "");
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function search(c: string, p: string) {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setLoading(true);
    setError(null);
    try {
      const found = await lookupOrder(c, p, ctl.signal);
      if (ctl.signal.aborted) return;
      setOrder(found);
      try { sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ code: found.code, phone: p.trim() })); } catch { /* bỏ qua */ }
      if (!codeParam || codeParam.toUpperCase() !== found.code) navigate(`/don-hang/${found.code}`, { replace: true });
    } catch (e) {
      if (ctl.signal.aborted) return;
      setOrder(null);
      setError(lookupMessage(e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }

  // Vừa đặt xong, hoặc tải lại trang trong cùng phiên: tự tra cứu bằng SĐT đã nhớ.
  useEffect(() => {
    if (codeParam && remembered) void search(codeParam, remembered.phone);
    return () => controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam]);

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!code.trim() || !phone.trim()) { setError("Vui lòng nhập mã đơn hàng và số điện thoại đặt hàng."); return; }
    void search(code, phone);
  }

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        {justPlaced && order && order.status === "PLACED" && (
          <div className="shop-success" role="status">
            <strong>Đặt hàng thành công!</strong>
            <span>Cảm ơn bạn. Hãy lưu lại mã đơn <b>{order.code}</b> để tra cứu khi cần.</span>
          </div>
        )}
        <h1 className="shop-title">Tra cứu đơn hàng</h1>

        {!order && (
          <form className="shop-card shop-lookup" onSubmit={onSubmit} noValidate>
            <label className="shop-field"><span>Mã đơn hàng</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PV-261126-ABCD" autoCapitalize="characters" /></label>
            <label className="shop-field"><span>Số điện thoại đặt hàng</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0912 345 678" /></label>
            <button className="shop-btn primary" type="submit" disabled={loading}>{loading ? "Đang tìm..." : "Tra cứu"}</button>
          </form>
        )}
        {loading && order === null && codeParam && <p className="shop-note">Đang tải đơn hàng...</p>}
        {error && <p className="shop-error" role="alert">{error}</p>}

        {order && (
          <>
            <OrderDetail order={order} phone={phone || remembered?.phone || ""} onChange={setOrder} />
            <p><button className="shop-link" onClick={() => { setOrder(null); setCode(""); navigate("/don-hang"); }}>Tra cứu đơn khác</button> · <Link className="shop-link" to="/">Về trang chủ</Link></p>
          </>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}

