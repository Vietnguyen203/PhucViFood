import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PRODUCT_PLACEHOLDER } from "../components/CartDrawer";
import { ProductCard } from "../components/ProductCard";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { ApiError, describeError } from "../lib/api";
import { fetchProductBySlug, fetchRelated } from "../lib/catalog";
import { formatDiscount, formatVnd } from "../lib/money";
import { safeStorage } from "../lib/storage";
import { trackEvent } from "../lib/tracking";
import { useAsync } from "../lib/useAsync";
import "../home.css";

const store = safeStorage();
const MAX_QTY = 99;

export default function ProductPage() {
  const { slug = "" } = useParams();
  const { add } = useCart();
  const wish = useWishlist();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const product = useAsync((signal) => fetchProductBySlug(slug, signal), [slug]);
  const p = product.data;
  const related = useAsync(async (signal) => (p ? fetchRelated(p, 4, signal) : []), [p?.id]);

  // Đổi sản phẩm thì về số lượng 1 và lên đầu trang.
  useEffect(() => { setQty(1); window.scrollTo({ top: 0 }); }, [slug]);

  // Ghi nhận lượt xem cho CTV (nếu khách vào qua link CTV): một lần mỗi sản phẩm mỗi lần mở trang.
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (!p || viewed.current === p.id) return;
    viewed.current = p.id;
    trackEvent(store, "PRODUCT_VIEW", p.id);
  }, [p]);

  const notFound = product.error instanceof ApiError && product.error.status === 404;
  const discounted = p && p.originalPrice !== null && p.originalPrice > p.price;

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        {product.loading && !p && <p className="home-loading">Đang tải sản phẩm...</p>}

        {notFound && (
          <div className="shop-card shop-empty-page">
            <h1 className="shop-title">Không tìm thấy sản phẩm</h1>
            <p>Sản phẩm không tồn tại hoặc đã ngừng bán.</p>
            <Link className="shop-btn primary" to="/#best-sellers">Xem sản phẩm khác</Link>
          </div>
        )}
        {!!product.error && !notFound && (
          <div className="shop-error" role="alert">
            <p>{describeError(product.error)}</p>
            <button className="shop-btn" onClick={product.reload}>Thử lại</button>
          </div>
        )}

        {p && (
          <>
            <nav className="shop-crumbs" aria-label="Đường dẫn">
              <Link to="/">Trang chủ</Link> / {p.category ? <Link to={`/danh-muc/${p.category.slug}`}>{p.category.name}</Link> : <span>Sản phẩm</span>} / <span>{p.name}</span>
            </nav>
            <div className="shop-detail">
              <div className="shop-detail-image">
                <img src={p.imageUrl ?? PRODUCT_PLACEHOLDER} alt={p.name} />
                {p.inStock && p.discountPercent > 0 && <span>{formatDiscount(p.discountPercent)}</span>}
              </div>
              <div className="shop-detail-info">
                {p.category && <small>{p.category.name}</small>}
                <h1>{p.name}</h1>
                {p.unit && <p className="shop-muted">Quy cách: {p.unit}</p>}
                <div className="home-price shop-detail-price">
                  <strong>{formatVnd(p.price)}</strong>
                  {discounted && <del>{formatVnd(p.originalPrice as number)}</del>}
                </div>
                <p className={p.inStock ? "shop-stock ok" : "shop-stock out"}>{p.inStock ? "Còn hàng" : "Hết hàng"}</p>

                {p.inStock && (
                  <div className="shop-buy">
                    <div className="shop-qty" role="group" aria-label="Số lượng">
                      <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Giảm">−</button>
                      <input
                        inputMode="numeric" aria-label="Số lượng" value={qty}
                        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); setQty(Number.isFinite(n) ? Math.min(MAX_QTY, Math.max(1, n)) : 1); }}
                      />
                      <button type="button" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} disabled={qty >= MAX_QTY} aria-label="Tăng">+</button>
                    </div>
                    <button className="shop-btn primary" onClick={() => add(p, qty)}>Thêm vào giỏ</button>
                    <button className="shop-btn" onClick={() => { add(p, qty); navigate("/thanh-toan"); }}>Mua ngay</button>
                  </div>
                )}
                <button className={`shop-wish${wish.has(p.id) ? " liked" : ""}`} aria-pressed={wish.has(p.id)} onClick={() => wish.toggle({ productId: p.id, slug: p.slug })}>
                  {wish.has(p.id) ? "♥ Đã lưu yêu thích" : "♡ Lưu vào yêu thích"}
                </button>

                {p.description && <section className="shop-desc"><h2>Mô tả</h2><p>{p.description}</p></section>}
                <p className="shop-small">Giá và phí giao hàng chính thức được tính lại khi đặt hàng. Số lượng còn lại được kiểm tra lúc đặt.</p>
              </div>
            </div>

            {related.data && related.data.length > 0 && (
              <section className="shop-related">
                <h2>Sản phẩm cùng danh mục</h2>
                <div className="home-product-grid">{related.data.map((r) => <ProductCard product={r} key={r.id} />)}</div>
              </section>
            )}
          </>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
