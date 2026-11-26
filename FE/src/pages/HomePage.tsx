import { useEffect, useState } from "react";
import { Link } from "react-router";
import { HomeIcon } from "../components/Icon";
import { ProductCard } from "../components/ProductCard";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { describeError } from "../lib/api";
import { fetchCategories, fetchProducts, type ProductPage } from "../lib/catalog";
import type { Product } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import "../home.css";

const slides = [
  {
    eyebrow: "Món ngon Việt cho mọi nhà",
    title: "Gói trọn vị ngon,\ngửi trao hạnh phúc",
    description:
      "Khám phá những đặc sản Việt được Phúc Vị tuyển chọn kỹ lưỡng, an toàn và trọn vẹn hương vị.",
    image: "/images/phuc-vi-home-hero.png",
    className: "bright",
  },
  {
    eyebrow: "Bộ quà tinh tuyển 2025",
    title: "Món quà ý nghĩa\ncho người bạn thương",
    description:
      "Trao lời chúc chân thành qua những bộ quà ẩm thực được chăm chút trong từng chi tiết.",
    image: "/images/phuc-vi-hero.png",
    className: "dark",
  },
  {
    eyebrow: "Cộng đồng Phúc Vị",
    title: "Chia sẻ món ngon,\nnhận thêm thu nhập",
    description:
      "Trở thành cộng tác viên miễn phí, giới thiệu sản phẩm bạn yêu thích và nhận hoa hồng mỗi đơn.",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1800&q=90",
    className: "warm",
  },
];

/** Ảnh minh họa cho thẻ danh mục (backend chưa có ảnh danh mục); lặp lại theo thứ tự. */
const CATEGORY_IMAGES = [
  "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=88",
  "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=88",
  "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=900&q=88",
  "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=900&q=88",
];

const PAGE_SIZE = 8;

const articles = [
  {
    category: "Chuyện ẩm thực",
    date: "18.05.2025",
    title: "Hương vị Việt trong từng bữa cơm sum vầy",
    excerpt: "Có những món ăn không chỉ ngon mà còn lưu giữ ký ức về gia đình và quê hương.",
    image:
      "https://images.unsplash.com/photo-1516211697506-8360dbcfe9a4?auto=format&fit=crop&w=1000&q=88",
  },
  {
    category: "Bí quyết vào bếp",
    date: "12.05.2025",
    title: "5 cách biến tấu lạp xưởng cho bữa cơm nhà",
    excerpt:
      "Những công thức nhanh gọn giúp món lạp xưởng quen thuộc trở nên hấp dẫn hơn mỗi ngày.",
    image:
      "https://images.unsplash.com/photo-1511910849309-0dffb8785146?auto=format&fit=crop&w=1000&q=88",
  },
  {
    category: "Cẩm nang sản phẩm",
    date: "06.05.2025",
    title: "Cách chọn đặc sản ngon để làm quà tặng",
    excerpt: "Một món quà đúng vị là cách chân thành để gửi lời cảm ơn đến người bạn trân quý.",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1000&q=88",
  },
];

function HomeHero() {
  const [active, setActive] = useState(0);
  const slide = slides[active];
  const previous = () => setActive((active - 1 + slides.length) % slides.length);
  const next = () => setActive((active + 1) % slides.length);
  return (
    <section className={`home-hero ${slide.className}`}>
      <img key={slide.image} src={slide.image} alt={slide.title.replace("\n", " ")} />
      <div className="home-hero-shade" />
      <div className="home-hero-content">
        <span>{slide.eyebrow}</span>
        <h1>
          {slide.title.split("\n").map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
        <p>{slide.description}</p>
        <div className="home-hero-actions">
          <a href="#best-sellers">
            Mua ngay <HomeIcon name="arrow" size={17} />
          </a>
          <a href="#brand-story">Khám phá Phúc Vị</a>
        </div>
      </div>
      <div className="home-slider-controls">
        <button onClick={previous} aria-label="Slide trước">
          <HomeIcon name="chevron" />
        </button>
        <div>
          {slides.map((item, index) => (
            <button
              key={item.title}
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
              aria-label={`Xem slide ${index + 1}`}
            />
          ))}
        </div>
        <button onClick={next} aria-label="Slide tiếp">
          <HomeIcon name="chevron" />
        </button>
      </div>
    </section>
  );
}

function HomeSectionHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="home-section-heading">
      <span>{label}</span>
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

function CategorySection({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const { data: categories, loading, error, reload } = useAsync((signal) => fetchCategories(signal), []);
  return (
    <section className="home-section" id="categories">
      <HomeSectionHeading
        label="Chọn món bạn yêu thích"
        title="Khám phá danh mục"
        description="Từ đặc sản thân quen đến những bộ quà tinh tế, Phúc Vị mang vị ngon Việt đến gần bạn hơn."
      />
      {error ? <LoadError error={error} onRetry={reload} /> : (
        <div className="home-category-grid">
          {loading && !categories && <p className="home-loading">Đang tải danh mục...</p>}
          {categories?.map((category, index) => (
            <a
              href="#best-sellers"
              className={`home-category-card${selected === category.id ? " selected" : ""}`}
              key={category.id}
              onClick={() => onSelect(selected === category.id ? null : category.id)}
              aria-pressed={selected === category.id}
            >
              <img src={CATEGORY_IMAGES[index % CATEGORY_IMAGES.length]} alt={category.name} />
              <div />
              <span>
                <strong>{category.name}</strong>
                <b>
                  {selected === category.id ? "Bỏ lọc" : "Xem sản phẩm"} <HomeIcon name="arrow" size={14} />
                </b>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function ProductsSection({ categoryId, onClear }: { categoryId: string | null; onClear: () => void }) {
  const [pages, setPages] = useState(1);
  // Đổi danh mục thì về trang đầu.
  useEffect(() => setPages(1), [categoryId]);
  const { data, loading, error, reload } = useAsync(
    async (signal) => {
      const items: Product[] = [];
      let last: ProductPage | undefined;
      for (let page = 1; page <= pages; page++) {
        last = await fetchProducts({ categoryId: categoryId ?? undefined, page, pageSize: PAGE_SIZE }, signal);
        items.push(...last.items);
      }
      return { items, pagination: last!.pagination };
    },
    [categoryId, pages],
  );
  const hasMore = data ? data.pagination.page < data.pagination.totalPages : false;

  return (
    <section className="home-products-wrap" id="best-sellers">
      <div className="home-section">
        <HomeSectionHeading
          label="Hương vị tuyển chọn"
          title="Sản phẩm của Phúc Vị"
          description="Những đặc sản được Phúc Vị tuyển chọn kỹ lưỡng, sẵn sàng giao đến tận nhà bạn."
        />
        {categoryId && (
          <p className="home-filter-note">Đang lọc theo danh mục. <button onClick={onClear}>Xem tất cả</button></p>
        )}
        {error ? <LoadError error={error} onRetry={reload} /> : (
          <>
            {loading && !data && <p className="home-loading">Đang tải sản phẩm...</p>}
            {data && data.items.length === 0 && <p className="home-loading">Chưa có sản phẩm nào trong mục này.</p>}
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

function BrandStory() {
  return (
    <section className="home-story" id="brand-story">
      <div className="home-story-visual">
        <img
          src="https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=1400&q=90"
          alt="Bữa cơm Việt ấm cúng"
        />
        <div>
          <strong>10+</strong>
          <span>
            Năm gìn giữ
            <br />
            vị ngon Việt
          </span>
        </div>
      </div>
      <div className="home-story-copy">
        <span>Chuyện của Phúc Vị</span>
        <h2>
          Mỗi món ngon,
          <br />
          một niềm hạnh phúc
        </h2>
        <p>
          Phúc Vị Foods bắt đầu từ mong muốn gìn giữ những hương vị Việt thân quen và đưa chúng đến
          mọi gia đình bằng sự tử tế.
        </p>
        <p>
          Chúng tôi chọn nguyên liệu rõ nguồn gốc, giữ gìn cách làm truyền thống và hoàn thiện bằng
          tiêu chuẩn hiện đại để mỗi sản phẩm luôn an toàn, thơm ngon và trọn vị.
        </p>
        <div className="home-values">
          <div>
            <HomeIcon name="leaf" />
            <span>
              <strong>Nguyên liệu chọn lọc</strong>
              <small>Tự nhiên và rõ nguồn gốc</small>
            </span>
          </div>
          <div>
            <HomeIcon name="shield" />
            <span>
              <strong>An tâm chất lượng</strong>
              <small>Kiểm soát trong từng khâu</small>
            </span>
          </div>
          <div>
            <HomeIcon name="truck" />
            <span>
              <strong>Giao hàng tận nơi</strong>
              <small>Đóng gói chu đáo toàn quốc</small>
            </span>
          </div>
        </div>
        <a href="#news">
          Tìm hiểu thêm <HomeIcon name="arrow" size={16} />
        </a>
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
        <strong>Hoa hồng đến 15%</strong>
        <small>Thanh toán mỗi tuần</small>
        <Link to="/ctv">
          Khám phá chương trình CTV <HomeIcon name="arrow" size={17} />
        </Link>
      </div>
    </section>
  );
}

function NewsSection() {
  return (
    <section className="home-section home-news" id="news">
      <HomeSectionHeading
        label="Góc nhỏ Phúc Vị"
        title="Tin tức & câu chuyện món ngon"
        description="Cùng khám phá văn hóa ẩm thực Việt và những bí quyết giữ trọn hương vị mỗi ngày."
      />
      <div className="home-article-grid">
        {articles.map((article) => (
          <article className="home-article-card" key={article.title}>
            <a href="#news" className="home-article-image">
              <img src={article.image} alt={article.title} />
              <span>Đọc bài viết</span>
            </a>
            <div className="home-article-meta">
              <span>{article.category}</span>
              <i />
              <time>{article.date}</time>
            </div>
            <h3>{article.title}</h3>
            <p>{article.excerpt}</p>
            <a href="#news">
              Xem chi tiết <HomeIcon name="arrow" size={15} />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  return (
    <div className="home-page">
      <HomeHeader />
      <main>
        <HomeHero />
        <CategorySection selected={categoryId} onSelect={setCategoryId} />
        <ProductsSection categoryId={categoryId} onClear={() => setCategoryId(null)} />
        <BrandStory />
        <PartnerCTA />
        <NewsSection />
      </main>
      <HomeFooter />
    </div>
  );
}
