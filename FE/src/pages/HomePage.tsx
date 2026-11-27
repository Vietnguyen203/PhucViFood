import { useState } from "react";
import { Link } from "react-router";
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

/** Ảnh minh họa cho thẻ danh mục (backend chưa có ảnh danh mục); lặp lại theo thứ tự. */
const CATEGORY_IMAGES = [
  "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=88",
  "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=88",
  "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=900&q=88",
  "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=900&q=88",
];

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

function CategorySection() {
  const { data: categories, loading, error, reload } = useAsync((signal) => fetchCategories(signal), []);
  if (!error && !loading && categories && categories.length === 0) return null; // chưa có danh mục thì ẩn cả mục
  return (
    <section className="home-section" id="categories">
      <HomeSectionHeading
        title="Khám phá danh mục"
        description="Từ đặc sản thân quen đến những bộ quà tinh tế, Phúc Vị mang vị ngon Việt đến gần bạn hơn."
      />
      {error ? <LoadError error={error} onRetry={reload} /> : (
        <div className="home-category-grid">
          {loading && !categories && <p className="home-loading">Đang tải danh mục...</p>}
          {categories?.map((category, index) => (
            <Link className="home-category-card" to={`/danh-muc/${category.slug}`} key={category.id}>
              <img src={CATEGORY_IMAGES[index % CATEGORY_IMAGES.length]} alt={category.name} />
              <div />
              <span>
                <strong>{category.name}</strong>
                <b>
                  Xem sản phẩm <HomeIcon name="arrow" size={14} />
                </b>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ProductsSection() {
  const [pages, setPages] = useState(1);
  const { data, loading, error, reload } = useAsync(
    async (signal) => {
      const items: Product[] = [];
      let last: ProductPage | undefined;
      for (let page = 1; page <= pages; page++) {
        last = await fetchProducts({ page, pageSize: PAGE_SIZE }, signal);
        items.push(...last.items);
      }
      return { items, pagination: last!.pagination };
    },
    [pages],
  );
  const hasMore = data ? data.pagination.page < data.pagination.totalPages : false;
  if (!error && !loading && data && data.items.length === 0) return null; // chưa có sản phẩm thì ẩn cả mục

  return (
    <section className="home-products-wrap" id="best-sellers">
      <div className="home-section">
        <HomeSectionHeading
          title="Sản phẩm của Phúc Vị"
          description="Những đặc sản được Phúc Vị tuyển chọn kỹ lưỡng, sẵn sàng giao đến tận nhà bạn."
        />
        {error ? <LoadError error={error} onRetry={reload} /> : (
          <>
            {loading && !data && <p className="home-loading">Đang tải sản phẩm...</p>}
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
        <CategorySection />
        <CreatorSection />
        <VideoSection />
        <ProductsSection />
        <PartnerCTA />
      </main>
      <HomeFooter />
    </div>
  );
}
