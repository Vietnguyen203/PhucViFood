import { Link } from "react-router";
import { useCart } from "../context/CartContext";
import { formatDiscount, formatVnd } from "../lib/money";
import type { Product } from "../lib/types";
import { PRODUCT_PLACEHOLDER } from "./CartDrawer";
import { HomeIcon } from "./Icon";

/** Thẻ sản phẩm dùng ở trang chủ, tìm kiếm và gợi ý. Ảnh và tên dẫn tới trang chi tiết. */
export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const to = `/san-pham/${encodeURIComponent(product.slug)}`;
  return (
    <article className="home-product-card">
      <div className="home-product-image">
        <Link to={to} aria-label={product.name}>
          <img src={product.imageUrl ?? PRODUCT_PLACEHOLDER} alt={product.name} />
        </Link>
        {!product.inStock ? <span>Hết hàng</span> : product.discountPercent > 0 ? <span>{formatDiscount(product.discountPercent)}</span> : null}
        <button aria-label="Thêm vào yêu thích">
          <HomeIcon name="heart" size={17} />
        </button>
      </div>
      <div className="home-product-info">
        <h3><Link className="shop-card-link" to={to}>{product.name}</Link></h3>
        {product.unit && <small className="home-product-unit">{product.unit}</small>}
        <div className="home-price">
          <strong>{formatVnd(product.price)}</strong>
          {product.originalPrice !== null && product.originalPrice > product.price && <del>{formatVnd(product.originalPrice)}</del>}
        </div>
        <button disabled={!product.inStock} onClick={() => add(product)}>
          {product.inStock ? "Thêm vào giỏ" : "Hết hàng"} <HomeIcon name="cart" size={16} />
        </button>
      </div>
    </article>
  );
}
