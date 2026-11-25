import { useState } from "react";
import { Link } from "react-router";
import "../home.css";

type HomeIconName =
  | "menu"
  | "close"
  | "search"
  | "user"
  | "cart"
  | "chevron"
  | "arrow"
  | "heart"
  | "star"
  | "leaf"
  | "shield"
  | "truck"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "instagram"
  | "phone"
  | "mail"
  | "pin";

const homeIconPaths: Record<HomeIconName, React.ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
  ),
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  leaf: (
    <>
      <path d="M20 4C10 4 5 9 5 17c8 0 13-5 15-13Z" />
      <path d="M4 20c3-5 7-8 12-11" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
      <circle cx="7" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
    </>
  ),
  facebook: <path d="M14 8h3V4h-3a5 5 0 0 0-5 5v3H6v4h3v6h4v-6h3l1-4h-4V9c0-.6.4-1 1-1Z" />,
  tiktok: (
    <>
      <path d="M14 4v11.5a4.5 4.5 0 1 1-4-4.5" />
      <path d="M14 4c.6 3 2.3 4.5 5 5" />
    </>
  ),
  youtube: (
    <>
      <path d="M22 12s0-5-1-6c-1-1-9-1-9-1s-8 0-9 1-1 6-1 6 0 5 1 6 9 1 9 1 8 0 9-1 1-6 1-6Z" />
      <path d="m10 9 5 3-5 3Z" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" />
    </>
  ),
  phone: (
    <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-1.5 2c-3.5-1.5-6-4-7.5-7.5L9 8 7 3Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2" />
    </>
  ),
};

function HomeIcon({ name, size = 20 }: { name: HomeIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {homeIconPaths[name]}
    </svg>
  );
}

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

const categories = [
  {
    name: "Đặc sản Việt",
    count: "18 sản phẩm",
    image:
      "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=88",
  },
  {
    name: "Đồ ăn chế biến",
    count: "16 sản phẩm",
    image:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=88",
  },
  {
    name: "Hạt & đồ ăn vặt",
    count: "24 sản phẩm",
    image:
      "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=900&q=88",
  },
  {
    name: "Quà tặng",
    count: "12 bộ quà",
    image:
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=900&q=88",
  },
];

const bestSellers = [
  {
    name: "Lạp xưởng tươi cao cấp",
    price: "189.000₫",
    oldPrice: "220.000₫",
    badge: "-14%",
    image:
      "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=800&q=88",
  },
  {
    name: "Khô gà lá chanh thượng hạng",
    price: "145.000₫",
    oldPrice: "",
    badge: "Bán chạy",
    image:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=88",
  },
  {
    name: "Hạt sen sấy giòn nguyên vị",
    price: "125.000₫",
    oldPrice: "150.000₫",
    badge: "-17%",
    image:
      "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=88",
  },
  {
    name: "Set quà Phúc Lộc Viên Mãn",
    price: "759.000₫",
    oldPrice: "850.000₫",
    badge: "Mới",
    image:
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=88",
  },
];

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

function HomeHeader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="home-topbar">
        <span>Miễn phí giao hàng cho đơn từ 500.000₫</span>
        <span>Hotline: 1900 6868</span>
      </div>
      <header className="home-header">
        <Link className="home-logo" to="/">
          <img src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
        </Link>
        <nav className={open ? "open" : ""}>
          <button className="home-nav-close" onClick={() => setOpen(false)} aria-label="Đóng menu">
            <HomeIcon name="close" />
          </button>
          <a href="#categories" onClick={() => setOpen(false)}>
            Danh mục
          </a>
          <a href="#best-sellers" onClick={() => setOpen(false)}>
            Sản phẩm
          </a>
          <a href="#brand-story" onClick={() => setOpen(false)}>
            Về Phúc Vị
          </a>
          <a href="#news" onClick={() => setOpen(false)}>
            Tin tức
          </a>
          <Link className="partner-nav-link" to="/ctv" onClick={() => setOpen(false)}>
            Cộng tác viên
          </Link>
        </nav>
        <div className="home-header-actions">
          <button aria-label="Tìm kiếm">
            <HomeIcon name="search" size={18} />
          </button>
          <button className="home-account" aria-label="Tài khoản">
            <HomeIcon name="user" size={18} />
          </button>
          <button className="home-cart" aria-label="Giỏ hàng">
            <HomeIcon name="cart" size={18} />
            <span>2</span>
          </button>
          <Link className="home-ctv-button" to="/ctv">
            Đăng ký CTV
          </Link>
          <button className="home-menu-button" onClick={() => setOpen(true)} aria-label="Mở menu">
            <HomeIcon name="menu" />
          </button>
        </div>
        {open && (
          <button
            className="home-nav-overlay"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
          />
        )}
      </header>
    </>
  );
}

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

function CategorySection() {
  return (
    <section className="home-section" id="categories">
      <HomeSectionHeading
        label="Chọn món bạn yêu thích"
        title="Khám phá danh mục"
        description="Từ đặc sản thân quen đến những bộ quà tinh tế, Phúc Vị mang vị ngon Việt đến gần bạn hơn."
      />
      <div className="home-category-grid">
        {categories.map((category) => (
          <a href="#best-sellers" className="home-category-card" key={category.name}>
            <img src={category.image} alt={category.name} />
            <div />
            <span>
              <small>{category.count}</small>
              <strong>{category.name}</strong>
              <b>
                Xem sản phẩm <HomeIcon name="arrow" size={14} />
              </b>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function BestSellers() {
  return (
    <section className="home-products-wrap" id="best-sellers">
      <div className="home-section">
        <HomeSectionHeading
          label="Được khách hàng yêu thích"
          title="Sản phẩm bán chạy"
          description="Những hương vị được lựa chọn nhiều nhất tại Phúc Vị Foods."
        />
        <div className="home-product-grid">
          {bestSellers.map((product) => (
            <article className="home-product-card" key={product.name}>
              <div className="home-product-image">
                <img src={product.image} alt={product.name} />
                <span>{product.badge}</span>
                <button aria-label="Thêm vào yêu thích">
                  <HomeIcon name="heart" size={17} />
                </button>
              </div>
              <div className="home-product-info">
                <div className="home-rating">
                  <span>★★★★★</span>
                  <small>4.9</small>
                </div>
                <h3>{product.name}</h3>
                <div className="home-price">
                  <strong>{product.price}</strong>
                  {product.oldPrice && <del>{product.oldPrice}</del>}
                </div>
                <button>
                  Thêm vào giỏ <HomeIcon name="cart" size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <a className="home-more-link" href="#best-sellers">
          Xem tất cả sản phẩm <HomeIcon name="arrow" size={16} />
        </a>
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

function HomeFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer-main">
        <div className="home-footer-brand">
          <img src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
          <p>Gìn giữ hương vị Việt, trao gửi niềm vui trong từng sản phẩm.</p>
          <div>
            <a href="#facebook" aria-label="Facebook">
              <HomeIcon name="facebook" size={16} />
            </a>
            <a href="#instagram" aria-label="Instagram">
              <HomeIcon name="instagram" size={16} />
            </a>
            <a href="#tiktok" aria-label="TikTok">
              <HomeIcon name="tiktok" size={16} />
            </a>
            <a href="#youtube" aria-label="YouTube">
              <HomeIcon name="youtube" size={16} />
            </a>
          </div>
        </div>
        <div className="home-footer-column">
          <strong>Khám phá</strong>
          <a href="#categories">Danh mục sản phẩm</a>
          <a href="#best-sellers">Sản phẩm bán chạy</a>
          <a href="#brand-story">Câu chuyện Phúc Vị</a>
          <a href="#news">Tin tức & Blog</a>
        </div>
        <div className="home-footer-column">
          <strong>Hỗ trợ khách hàng</strong>
          <a href="#shipping">Chính sách giao hàng</a>
          <a href="#returns">Chính sách đổi trả</a>
          <a href="#payment">Hướng dẫn thanh toán</a>
          <Link to="/ctv">Chương trình CTV</Link>
        </div>
        <div className="home-footer-column home-contact">
          <strong>Liên hệ</strong>
          <p>
            <HomeIcon name="pin" size={16} />
            128 Nguyễn Văn Linh, Quận 7, TP.HCM
          </p>
          <p>
            <HomeIcon name="phone" size={16} />
            1900 6868
          </p>
          <p>
            <HomeIcon name="mail" size={16} />
            hello@phucvifoods.vn
          </p>
        </div>
      </div>
      <div className="home-footer-bottom">
        <span>© 2025 Phúc Vị Foods. All rights reserved.</span>
        <span>Hương vị của hạnh phúc</span>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <div className="home-page">
      <HomeHeader />
      <main>
        <HomeHero />
        <CategorySection />
        <BestSellers />
        <BrandStory />
        <PartnerCTA />
        <NewsSection />
      </main>
      <HomeFooter />
    </div>
  );
}
