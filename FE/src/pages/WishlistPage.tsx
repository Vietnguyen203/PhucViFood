import { Link } from "react-router";
import { ProductCard } from "../components/ProductCard";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { useWishlist } from "../context/WishlistContext";
import { ApiError } from "../lib/api";
import { fetchProductBySlug } from "../lib/catalog";
import type { Product } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import "../home.css";

/** Sản phẩm đã lưu yêu thích. Tên, giá, tồn kho lấy mới từ catalog; sản phẩm đã ngừng bán (404) bị bỏ khỏi danh sách. */
export default function WishlistPage() {
  const { items, remove } = useWishlist();
  const key = items.map((i) => i.slug).join(",");
  const { data, loading } = useAsync(
    async (signal) => {
      const results = await Promise.allSettled(items.map((i) => fetchProductBySlug(i.slug, signal)));
      const found: Product[] = [];
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") found.push(r.value);
        else if (r.reason instanceof ApiError && r.reason.status === 404) remove(items[idx].productId);
      });
      return found;
    },
    [key],
  );

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <h1 className="shop-title">Sản phẩm yêu thích{items.length > 0 ? ` (${items.length})` : ""}</h1>
        {items.length === 0 ? (
          <div className="shop-card shop-empty-page">
            <p>Bạn chưa lưu sản phẩm nào. Bấm biểu tượng trái tim trên sản phẩm để lưu lại xem sau.</p>
            <Link className="shop-btn primary" to="/#best-sellers">Xem sản phẩm</Link>
          </div>
        ) : (
          <>
            {loading && !data && <p className="home-loading">Đang tải...</p>}
            {data && <div className="home-product-grid">{data.map((p) => <ProductCard product={p} key={p.id} />)}</div>}
            <p className="shop-muted">Danh sách lưu trên thiết bị này.</p>
          </>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
