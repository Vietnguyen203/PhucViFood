import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ProductCard } from "../components/ProductCard";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { describeError } from "../lib/api";
import { fetchCategories, fetchProducts, type ProductPage, type ProductQuery } from "../lib/catalog";
import type { Product } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import "../home.css";

const PAGE_SIZE = 12;
const SORTS: Array<{ value: NonNullable<ProductQuery["sort"]>; label: string }> = [
  { value: "-createdAt", label: "Mới nhất" }, { value: "price", label: "Giá tăng dần" }, { value: "-price", label: "Giá giảm dần" }, { value: "name", label: "Tên A → Z" },
];

/** Sản phẩm theo danh mục: /danh-muc/{slug}?sort=... Danh mục không tồn tại hoặc đã tắt thì báo không tìm thấy. */
export default function CategoryPage() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const sortParam = params.get("sort");
  const sort = SORTS.some((s) => s.value === sortParam) ? (sortParam as NonNullable<ProductQuery["sort"]>) : "-createdAt";
  const [pages, setPages] = useState(1);
  const [lastKey, setLastKey] = useState(`${slug}|${sort}`);
  if (lastKey !== `${slug}|${sort}`) { setLastKey(`${slug}|${sort}`); setPages(1); }

  const categories = useAsync((signal) => fetchCategories(signal), []);
  const category = categories.data?.find((c) => c.slug === slug);

  const { data, loading, error, reload } = useAsync(
    async (signal) => {
      if (!category) return null;
      const items: Product[] = [];
      let last: ProductPage | undefined;
      for (let page = 1; page <= pages; page++) {
        last = await fetchProducts({ categoryId: category.id, sort, page, pageSize: PAGE_SIZE }, signal);
        items.push(...last.items);
      }
      return { items, pagination: last!.pagination };
    },
    [category?.id, sort, pages],
  );
  const hasMore = data ? data.pagination.page < data.pagination.totalPages : false;
  const missing = !!categories.data && !category;

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <p className="shop-muted"><Link to="/">Trang chủ</Link> / <span>{category?.name ?? "Danh mục"}</span></p>

        {!!categories.error && (
          <div className="shop-error" role="alert"><p>{describeError(categories.error)}</p><button className="shop-btn" onClick={categories.reload}>Thử lại</button></div>
        )}
        {categories.loading && !categories.data && <p className="home-loading">Đang tải...</p>}

        {missing && (
          <div className="shop-card shop-empty-page">
            <p>Không tìm thấy danh mục này.</p>
            <Link className="shop-btn primary" to="/#categories">Xem các danh mục</Link>
          </div>
        )}

        {category && (
          <>
            <h1 className="shop-title">{category.name}</h1>
            <div className="shop-search-bar">
              <span className="shop-muted">{data ? `${data.pagination.total} sản phẩm` : ""}</span>
              <label>Sắp xếp
                <select value={sort} onChange={(e) => setParams({ sort: e.target.value }, { replace: true })}>
                  {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>
            {!!error && (
              <div className="shop-error" role="alert"><p>{describeError(error)}</p><button className="shop-btn" onClick={reload}>Thử lại</button></div>
            )}
            {loading && !data && <p className="home-loading">Đang tải sản phẩm...</p>}
            {data && data.items.length === 0 && (
              <div className="shop-card shop-empty-page">
                <p>Danh mục này chưa có sản phẩm đang bán.</p>
                <Link className="shop-btn primary" to="/#categories">Xem danh mục khác</Link>
              </div>
            )}
            {data && data.items.length > 0 && <div className="home-product-grid">{data.items.map((p) => <ProductCard product={p} key={p.id} />)}</div>}
            {hasMore && (
              <button className="home-more-link" onClick={() => setPages((n) => n + 1)} disabled={loading}>{loading ? "Đang tải..." : "Xem thêm sản phẩm"}</button>
            )}
          </>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
