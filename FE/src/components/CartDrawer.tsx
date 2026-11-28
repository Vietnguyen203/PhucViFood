import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useCart } from "../context/CartContext";
import { estimateShipping, MAX_QUANTITY, SHIPPING_ESTIMATE } from "../lib/cart";
import { formatVnd } from "../lib/money";
import { HomeIcon } from "./Icon";

export const PRODUCT_PLACEHOLDER = "/images/phuc-vi-symbol.jpg";

/** Ngăn kéo giỏ hàng bên phải: xem, đổi số lượng, xóa, rồi sang trang thanh toán. */
export function CartDrawer() {
  const { cart, count, subtotal, setQty, remove, isOpen, closeCart } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeCart(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeCart]);

  if (!isOpen) return null;
  const shipping = estimateShipping(subtotal);
  const remaining = SHIPPING_ESTIMATE.freeThreshold - subtotal;

  return (
    <div className="shop-scope">
      <button className="shop-overlay" aria-label="Đóng giỏ hàng" onClick={closeCart} />
      <aside className="shop-drawer" role="dialog" aria-modal="true" aria-label="Giỏ hàng">
        <header>
          <strong>Giỏ hàng ({count})</strong>
          <button onClick={closeCart} aria-label="Đóng giỏ hàng"><HomeIcon name="close" size={20} /></button>
        </header>

        {cart.lines.length === 0 ? (
          <div className="shop-empty">
            <HomeIcon name="cart" size={40} />
            <p>Giỏ hàng của bạn đang trống.</p>
            <button className="shop-btn" onClick={() => { closeCart(); navigate("/#best-sellers"); }}>Tiếp tục mua sắm</button>
          </div>
        ) : (
          <>
            <ul className="shop-lines">
              {cart.lines.map((l) => (
                <li key={l.productId}>
                  <img src={l.imageUrl ?? PRODUCT_PLACEHOLDER} alt="" />
                  <div>
                    <strong>{l.name}</strong>
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
            <footer>
              <dl>
                <div><dt>Tạm tính</dt><dd>{formatVnd(subtotal)}</dd></div>
                <div><dt>Phí giao hàng (tạm tính)</dt><dd>{shipping === 0 ? "Miễn phí" : formatVnd(shipping)}</dd></div>
                <div className="total"><dt>Tổng cộng</dt><dd>{formatVnd(subtotal + shipping)}</dd></div>
              </dl>
              {remaining > 0 && <p className="shop-hint">Mua thêm {formatVnd(remaining)} để được miễn phí giao hàng.</p>}
              <button className="shop-btn primary" onClick={() => { closeCart(); navigate("/checkout"); }}>Tiến hành thanh toán</button>
              <button className="shop-link-btn" onClick={() => { closeCart(); navigate("/cart"); }}>Xem giỏ hàng đầy đủ</button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
