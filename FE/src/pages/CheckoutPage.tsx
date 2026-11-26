import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { PRODUCT_PLACEHOLDER } from "../components/CartDrawer";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { useCart } from "../context/CartContext";
import { ApiError, describeError } from "../lib/api";
import { estimateShipping } from "../lib/cart";
import {
  buildOrderPayload, describeStockProblems, EMPTY_CHECKOUT, mapServerFieldErrors, validateCheckout, type CheckoutErrors, type CheckoutForm,
} from "../lib/checkout";
import { formatVnd } from "../lib/money";
import { newIdempotencyKey, placeOrder } from "../lib/orders";
import { loadReferral } from "../lib/referral";
import { safeStorage } from "../lib/storage";
import { trackEvent } from "../lib/tracking";
import "../home.css";

const store = safeStorage();
/** Mã đơn và SĐT vừa đặt, giữ trong phiên để trang đơn hàng tự tra cứu mà khách không phải nhập lại. */
export const LAST_ORDER_KEY = "pv.lastOrder";

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={`shop-field${error ? " invalid" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}

export default function CheckoutPage() {
  const { cart, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState<CheckoutForm>(EMPTY_CHECKOUT);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [stockProblems, setStockProblems] = useState<string[]>([]);
  // Cùng khóa cho các lần gửi lại sau lỗi mạng (backend trả đúng đơn cũ, không tạo trùng); đổi khóa sau lỗi dứt khoát.
  const idempotencyKey = useRef(newIdempotencyKey());
  const referral = loadReferral(store);

  // Bắt đầu thanh toán: ghi nhận cho CTV (nếu khách vào qua link CTV). Một lần mỗi lần mở trang.
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || cart.lines.length === 0) return;
    tracked.current = true;
    trackEvent(store, "CHECKOUT_START");
  }, [cart.lines.length]);

  const shipping = estimateShipping(subtotal);
  const set = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setServerMessage(null);
    setStockProblems([]);
    const found = validateCheckout(form, cart);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.querySelector<HTMLElement>(".shop-field.invalid input, .shop-field.invalid textarea")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const order = await placeOrder(buildOrderPayload(form, cart, referral), idempotencyKey.current);
      try { sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ code: order.code, phone: form.phone.trim() })); } catch { /* không lưu được thì khách tự nhập SĐT */ }
      clear();
      navigate(`/don-hang/${order.code}`, { replace: true, state: { justPlaced: true } });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "VALIDATION_FAILED") setErrors((prev) => ({ ...prev, ...mapServerFieldErrors(e.details) }));
        const problems = describeStockProblems(e.details, cart);
        if (problems.length > 0) setStockProblems(problems);
        setServerMessage(
          e.status === 409 ? "Một số sản phẩm không đủ hàng. Vui lòng điều chỉnh giỏ hàng rồi đặt lại."
          : e.status === 422 ? "Một số sản phẩm hiện không còn được bán. Vui lòng xem lại giỏ hàng."
          : e.status === 429 ? "Bạn thao tác quá nhanh, vui lòng đợi một chút rồi thử lại."
          : e.message,
        );
        // Lỗi dứt khoát (4xx): chưa có đơn nào được tạo nên lần gửi sau dùng khóa mới. Lỗi tạm thời (mạng, 5xx): giữ khóa.
        if (!e.isTransient) idempotencyKey.current = newIdempotencyKey();
      } else {
        setServerMessage(describeError(e));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <h1 className="shop-title">Thanh toán</h1>

        {cart.lines.length === 0 ? (
          <div className="shop-card shop-empty-page">
            <p>Giỏ hàng của bạn đang trống.</p>
            <Link className="shop-btn primary" to="/#best-sellers">Xem sản phẩm</Link>
          </div>
        ) : (
          <form className="shop-checkout" onSubmit={onSubmit} noValidate>
            <div className="shop-card">
              <h2>Thông tin giao hàng</h2>
              <div className="shop-grid">
                <Field label="Họ và tên *" error={errors.fullName}>
                  <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" maxLength={100} />
                </Field>
                <Field label="Số điện thoại *" error={errors.phone}>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0912 345 678" />
                </Field>
                <Field label="Email (không bắt buộc)" error={errors.email} hint="Để nhận thông tin đơn hàng.">
                  <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" autoComplete="email" />
                </Field>
                <Field label="Tỉnh / Thành phố *" error={errors.province}>
                  <input value={form.province} onChange={(e) => set("province", e.target.value)} autoComplete="address-level1" />
                </Field>
                <Field label="Phường / Xã *" error={errors.ward}>
                  <input value={form.ward} onChange={(e) => set("ward", e.target.value)} autoComplete="address-level3" />
                </Field>
                <Field label="Số nhà, tên đường *" error={errors.addressLine}>
                  <input value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} autoComplete="street-address" />
                </Field>
              </div>
              <Field label="Ghi chú cho đơn hàng" error={errors.note}>
                <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={3} maxLength={500} placeholder="Ví dụ: giao giờ hành chính" />
              </Field>

              <h2>Phương thức thanh toán</h2>
              <div className="shop-radio-group" role="radiogroup" aria-label="Phương thức thanh toán">
                <label className={form.paymentMethod === "COD" ? "active" : ""}>
                  <input type="radio" name="payment" checked={form.paymentMethod === "COD"} onChange={() => set("paymentMethod", "COD")} />
                  <span><strong>Thanh toán khi nhận hàng (COD)</strong><small>Trả tiền mặt cho nhân viên giao hàng.</small></span>
                </label>
                <label className={form.paymentMethod === "BANK_QR" ? "active" : ""}>
                  <input type="radio" name="payment" checked={form.paymentMethod === "BANK_QR"} onChange={() => set("paymentMethod", "BANK_QR")} />
                  <span><strong>Chuyển khoản ngân hàng</strong><small>Sau khi đặt, bạn nhận thông tin chuyển khoản. Đơn chưa thanh toán đúng hạn sẽ tự hủy.</small></span>
                </label>
              </div>

              <h2>Mã giới thiệu</h2>
              {referral && (
                <p className="shop-note">Bạn đang được cộng tác viên mã <b>{referral.code}</b> giới thiệu. Đơn hàng sẽ được ghi nhận cho cộng tác viên này.</p>
              )}
              <Field label="Mã cộng tác viên (nếu có)" error={errors.referralCode} hint={referral ? "Nhập mã khác sẽ được ưu tiên hơn link đã bấm." : undefined}>
                <input value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} autoCapitalize="none" maxLength={12} />
              </Field>

              <label className="shop-check">
                <input type="checkbox" checked={form.marketingConsent} onChange={(e) => set("marketingConsent", e.target.checked)} />
                <span>Tôi đồng ý nhận tư vấn và ưu đãi từ Phúc Vị Foods qua điện thoại hoặc tin nhắn.</span>
              </label>
            </div>

            <aside className="shop-card shop-summary">
              <h2>Đơn hàng của bạn</h2>
              <ul className="shop-summary-lines">
                {cart.lines.map((l) => (
                  <li key={l.productId}>
                    <img src={l.imageUrl ?? PRODUCT_PLACEHOLDER} alt="" />
                    <span><strong>{l.name}</strong><small>Số lượng: {l.quantity}</small></span>
                    <b>{formatVnd(l.price * l.quantity)}</b>
                  </li>
                ))}
              </ul>
              <dl>
                <div><dt>Tạm tính</dt><dd>{formatVnd(subtotal)}</dd></div>
                <div><dt>Phí giao hàng (tạm tính)</dt><dd>{shipping === 0 ? "Miễn phí" : formatVnd(shipping)}</dd></div>
                <div className="total"><dt>Tổng cộng</dt><dd>{formatVnd(subtotal + shipping)}</dd></div>
              </dl>
              <p className="shop-small">Giá và phí giao hàng chính thức được tính lại khi đặt hàng và hiển thị trong đơn.</p>

              {errors.items && <p className="shop-error" role="alert">{errors.items}</p>}
              {serverMessage && (
                <div className="shop-error" role="alert">
                  <p>{serverMessage}</p>
                  {stockProblems.length > 0 && <ul>{stockProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
                </div>
              )}
              <button className="shop-btn primary" type="submit" disabled={submitting}>{submitting ? "Đang đặt hàng..." : "Đặt hàng"}</button>
              <Link className="shop-link" to="/#best-sellers">← Tiếp tục mua sắm</Link>
            </aside>
          </form>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
