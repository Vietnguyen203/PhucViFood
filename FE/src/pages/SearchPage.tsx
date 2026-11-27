import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ProductCard } from "../components/ProductCard";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { describeError } from "../lib/api";
import { fetchProducts, normalizeSearch, type ProductPage, type ProductQuery } from "../lib/catalog";
import { useDocumentTitle } from "../lib/pageTitle";
import type { Product } from "../lib/types";
import { findPriceRange, PRICE_RANGES } from "../lib/priceRange";
import { useAsync } from "../lib/useAsync";
import "../home.css";

const PAGE_SIZE = 12;
const SORTS: Array<{ value: NonNullable<ProductQuery["sort"]>; label: string }> = [
  { value: "-createdAt", label: "Mới nhất" }, { value: "price", label: "Giá tăng dần" }, { value: "-price", label: "Giá giảm dần" }, { value: "name", label: "Tên A → Z" },
];

/** Kết quả tìm kiếm: /tim-kiem?q=từ khóa&sort=... Từ khóa nằm trên đường dẫn nên chia sẻ và tải lại được. */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = normalizeSearch(params.get("q"));
  useDocumentTitle(q ? `Tìm "${q}"` : "Tìm kiếm");
  const sortParam = params.get("sort");
  const sort = SORTS.some((s) => s.value === sortParam) ? (sortParam as NonNullable<ProductQuery["sort"]>) : "-createdAt";
  const range = findPriceRange(params.get("gia"));
  const priceKey = range?.key ?? "";
  const setFilter = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) merged.set(k, v); else merged.delete(k); }
    setParams(merged, { replace: true });
  };
  const [pages, setPages] = useState(1);
  const [lastKey, setLastKey] = useState(`${q}|${sort}|${priceKey}`);
  // Đổi từ khóa, cách sắp xếp hoặc khoảng giá thì về trang đầu.
  if (lastKey !== `${q}|${sort}|${priceKey}`) { setLastKey(`${q}|${sort}|${priceKey}`); setPages(1); }

  const { data, loading, error, reload } = useAsync(
    async (signal) => {
      if (!q) return null;
      const items: Product[] = [];
      let last: ProductPage | undefined;
      for (let page = 1; page <= pages; page++) {
        last = await fetchProducts({ q, sort, page, pageSize: PAGE_SIZE, minPrice: range?.min, maxPrice: range?.max }, signal);
        items.push(...last.items);
      }
      return { items, pagination: last!.pagination };
    },
    [q, sort, pages, priceKey],
  );
  const hasMore = data ? data.pagination.page < data.pagination.totalPages : false;

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <h1 className="shop-title">{q ? <>Kết quả cho "{q}"</> : "Tìm kiếm sản phẩm"}</h1>

        {!q && <p className="shop-note">Nhập từ khóa vào ô tìm kiếm trên đầu trang, ví dụ "khô cá" hoặc "trà".</p>}

        {q && (
          <div className="shop-search-bar">
            <span className="shop-muted">{data ? `${data.pagination.total} sản phẩm` : ""}</span>
            <label>Giá
              <select value={priceKey} onChange={(e) => setFilter({ gia: e.target.value })}>
                  <option value="">Tất cả</option>
                  {PRICE_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </label>
            <label>Sắp xếp
              <select value={sort} onChange={(e) => setFilter({ sort: e.target.value })}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {!!error && (
          <div className="shop-error" role="alert"><p>{describeError(error)}</p><button className="shop-btn" onClick={reload}>Thử lại</button></div>
        )}
        {q && loading && !data && <p className="home-loading">Đang tìm...</p>}
        {data && data.items.length === 0 && (
          <div className="shop-card shop-empty-page">
            <p>Không có sản phẩm nào khớp "{q}". Thử từ khóa ngắn hơn hoặc xem tất cả sản phẩm.</p>
            <Link className="shop-btn primary" to="/#best-sellers">Xem tất cả sản phẩm</Link>
          </div>
        )}
        {data && data.items.length > 0 && <div className="home-product-grid">{data.items.map((p) => <ProductCard product={p} key={p.id} />)}</div>}
        {hasMore && (
          <button className="home-more-link" onClick={() => setPages((n) => n + 1)} disabled={loading}>{loading ? "Đang tải..." : "Xem thêm sản phẩm"}</button>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
