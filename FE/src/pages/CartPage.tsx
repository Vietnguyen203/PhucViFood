import { Link, useNavigate } from "react-router";
import { PRODUCT_PLACEHOLDER } from "../components/CartDrawer";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { useCart } from "../context/CartContext";
import { estimateShipping, MAX_QUANTITY, SHIPPING_ESTIMATE } from "../lib/cart";
import { formatVnd } from "../lib/money";
import "../home.css";

/** Trang giỏ hàng đầy đủ: xem, đổi số lượng, xóa rồi sang thanh toán. Cùng dữ liệu với ngăn kéo giỏ hàng. */
export default function CartPage() {
  const { cart, count, subtotal, setQty, remove, clear } = useCart();
  const navigate = useNavigate();
  const shipping = estimateShipping(subtotal);
  const remaining = SHIPPING_ESTIMATE.freeThreshold - subtotal;

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <h1 className="shop-title">Giỏ hàng{count > 0 ? ` (${count})` : ""}</h1>

        {cart.lines.length === 0 ? (
          <div className="shop-card shop-empty-page">
            <p>Giỏ hàng của bạn đang trống.</p>
            <Link className="shop-btn primary" to="/#best-sellers">Tiếp tục mua sắm</Link>
          </div>
        ) : (
          <div className="shop-cart-layout">
            <ul className="shop-cart-lines shop-card">
              {cart.lines.map((l) => (
                <li key={l.productId}>
                  <Link to={`/san-pham/${l.slug}`}><img src={l.imageUrl ?? PRODUCT_PLACEHOLDER} alt="" /></Link>
                  <div className="shop-cart-info">
                    <Link className="shop-card-link" to={`/san-pham/${l.slug}`}><strong>{l.name}</strong></Link>
                    {l.unit && <small>{l.unit}</small>}
                    <span>{formatVnd(l.price)}</span>
                    <div className="shop-qty" role="group" aria-label={`Số lượng ${l.name}`}>
                      <button onClick={() => setQty(l.productId, l.quantity - 1)} aria-label="Giảm số lượng">−</button>
                      <b>{l.quantity}</b>
                      <button onClick={() => setQty(l.productId, l.quantity + 1)} disabled={l.quantity >= MAX_QUANTITY} aria-label="Tăng số lượng">+</button>
                    </div>
                  </div>
                  <div className="shop-line-end">
                    <strong>{formatVnd(l.price * l.quantity)}</strong>
                    <button onClick={() => remove(l.productId)} aria-label={`Xóa ${l.name}`}>Xóa</button>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="shop-card shop-cart-summary">
              <h2>Tóm tắt đơn hàng</h2>
              <dl>
                <div><dt>Tạm tính</dt><dd>{formatVnd(subtotal)}</dd></div>
                <div><dt>Phí giao hàng (tạm tính)</dt><dd>{shipping === 0 ? "Miễn phí" : formatVnd(shipping)}</dd></div>
                <div className="total"><dt>Tổng cộng</dt><dd>{formatVnd(subtotal + shipping)}</dd></div>
              </dl>
              {remaining > 0 && <p className="shop-hint">Mua thêm {formatVnd(remaining)} để được miễn phí giao hàng.</p>}
              <button className="shop-btn primary" onClick={() => navigate("/thanh-toan")}>Tiến hành thanh toán</button>
              <Link className="shop-btn" to="/#best-sellers">Tiếp tục mua sắm</Link>
              <button className="shop-link-btn" onClick={clear}>Xóa toàn bộ giỏ hàng</button>
            </aside>
          </div>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
