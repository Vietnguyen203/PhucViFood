import { useState } from "react";
import { Link } from "react-router";
import { CategoryCircles } from "../components/CategoryCircles";
import { CreatorSection } from "../components/CreatorSection";
import { HomeBanner } from "../components/HomeBanner";
import { VideoSection } from "../components/VideoSection";
import { HomeIcon } from "../components/Icon";
import { ProductCard } from "../components/ProductCard";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { describeError } from "../lib/api";
import { useDocumentTitle } from "../lib/pageTitle";
import { fetchCategories, fetchProducts, type ProductPage } from "../lib/catalog";
import type { Product } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import "../home.css";

const PAGE_SIZE = 8;

function HomeSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="home-section-heading">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="home-load-error" role="alert">
      <p>{describeError(error, "Không tải được dữ liệu.")}</p>
      <button onClick={onRetry}>Thử lại</button>
    </div>
  );
}

function ProductsSection() {
  const [pages, setPages] = useState(1);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const { data: categories } = useAsync((signal) => fetchCategories(signal), []);
  const { data, loading, error, reload } = useAsync(
    async (signal) => {
      const items: Product[] = [];
      let last: ProductPage | undefined;
      for (let page = 1; page <= pages; page++) {
        last = await fetchProducts({ page, pageSize: PAGE_SIZE, categoryId: categoryId ?? undefined }, signal);
        items.push(...last.items);
      }
      return { items, pagination: last!.pagination };
    },
    [pages, categoryId],
  );
  const hasMore = data ? data.pagination.page < data.pagination.totalPages : false;
  // Chưa có sản phẩm nào (và đang không lọc theo danh mục) thì ẩn cả mục.
  if (!error && !loading && data && data.items.length === 0 && categoryId === null) return null;
  const pick = (id: string | null) => { setCategoryId(id); setPages(1); };

  return (
    <section className="home-products-wrap" id="best-sellers">
      <div className="home-section">
        <HomeSectionHeading
          title="Sản phẩm của Phúc Vị"
          description="Những đặc sản được Phúc Vị tuyển chọn kỹ lưỡng, sẵn sàng giao đến tận nhà bạn."
        />
        {categories && categories.length > 1 && (
          <div className="home-category-tabs" role="group" aria-label="Lọc theo danh mục">
            <button className={categoryId === null ? "active" : ""} aria-pressed={categoryId === null} onClick={() => pick(null)}>Tất cả</button>
            {categories.map((c) => (
              <button key={c.id} className={categoryId === c.id ? "active" : ""} aria-pressed={categoryId === c.id} onClick={() => pick(c.id)}>{c.name}</button>
            ))}
          </div>
        )}
        {error ? <LoadError error={error} onRetry={reload} /> : (
          <>
            {loading && !data && <p className="home-loading">Đang tải sản phẩm...</p>}
            {data && data.items.length === 0 && <p className="home-loading">Chưa có sản phẩm trong danh mục này.</p>}
            <div className="home-product-grid">
              {data?.items.map((product) => <ProductCard product={product} key={product.id} />)}
            </div>
            {hasMore && (
              <button className="home-more-link" onClick={() => setPages((n) => n + 1)} disabled={loading}>
                {loading ? "Đang tải..." : "Xem thêm sản phẩm"} <HomeIcon name="arrow" size={16} />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PartnerCTA() {
  return (
    <section className="home-partner-cta">
      <div className="home-cta-pattern" />
      <div className="home-cta-logo">
        <img src="/images/phuc-vi-logo-official-transparent.png" alt="" />
      </div>
      <div>
        <span>Cùng Phúc Vị lan tỏa món ngon</span>
        <h2>
          Chia sẻ sản phẩm,
          <br />
          nhận hoa hồng mỗi đơn
        </h2>
        <p>
          Tham gia miễn phí, không cần nhập hàng. Phúc Vị lo vận chuyển, bạn linh hoạt tạo thêm thu
          nhập.
        </p>
      </div>
      <div className="home-cta-action">
        <strong>Hoa hồng cố định 10%</strong>
        <small>Thanh toán mỗi tuần</small>
        <Link to="/ctv">
          Khám phá chương trình CTV <HomeIcon name="arrow" size={17} />
        </Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  useDocumentTitle(undefined);
  return (
    <div className="home-page">
      <HomeHeader />
      <main>
        <HomeBanner />
        <CategoryCircles />
        <CreatorSection />
        <VideoSection />
        <ProductsSection />
        <PartnerCTA />
      </main>
      <HomeFooter />
    </div>
  );
}
