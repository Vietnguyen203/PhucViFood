import { useState } from "react";
import { useCart } from "../context/CartContext";

type IconName =
  | "menu"
  | "close"
  | "user"
  | "cart"
  | "arrow"
  | "check"
  | "link"
  | "share"
  | "copy"
  | "gift"
  | "wallet"
  | "spark"
  | "play"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "zalo"
  | "clicks"
  | "orders"
  | "money"
  | "chevron"
  | "star"
  | "shield"
  | "clock"
  | "help";

const iconPaths: Record<IconName, React.ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
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
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  link: (
    <>
      <path d="M10.5 13.5a4 4 0 0 0 5.7.1l2.4-2.4a4 4 0 0 0-5.7-5.7l-1.4 1.4" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7-.1l-2.4 2.4a4 4 0 0 0 5.7 5.7l1.4-1.4" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M12 9v12M3 13h18M12 9H7.5a2.5 2.5 0 1 1 2.2-3.7L12 9Zm0 0h4.5a2.5 2.5 0 1 0-2.2-3.7L12 9Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
      <path d="M15 11h7v5h-7a2.5 2.5 0 0 1 0-5Z" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
    </>
  ),
  play: <path d="m9 7 8 5-8 5V7Z" />,
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
  zalo: <path d="M5 5h14v14H5zM8 9h4l-4 6h4m2-6v6m0-3h3" />,
  clicks: (
    <>
      <path d="m5 3 13 9-6 1 3 6-3 2-3-6-4 4V3Z" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3h12l2 5-2 4H6L4 8l2-5Z" />
      <path d="M6 12v9h12v-9M9 16h6" />
    </>
  ),
  money: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 8.5c-.7-.8-1.6-1.2-3-1.2-1.7 0-3 .9-3 2.2 0 3.5 6 1.2 6 4.8 0 1.4-1.3 2.4-3.2 2.4-1.4 0-2.5-.5-3.2-1.4M12 5.5v13" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.3 1-1.3 1.9M12 17h.01" />
    </>
  ),
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
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
      {iconPaths[name]}
    </svg>
  );
}

const products = [
  {
    name: "Lạp xưởng tươi cao cấp",
    price: "189.000₫",
    commission: "28.350₫",
    rate: "15%",
    image:
      "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=800&q=88",
    sold: "1,2k đã bán",
  },
  {
    name: "Khô gà lá chanh thượng hạng",
    price: "145.000₫",
    commission: "18.850₫",
    rate: "13%",
    image:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=88",
    sold: "936 đã bán",
  },
  {
    name: "Hạt sen sấy giòn nguyên vị",
    price: "125.000₫",
    commission: "15.000₫",
    rate: "12%",
    image:
      "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=88",
    sold: "824 đã bán",
  },
  {
    name: "Set quà Phúc Lộc Viên Mãn",
    price: "759.000₫",
    commission: "91.080₫",
    rate: "12%",
    image:
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=88",
    sold: "512 đã bán",
  },
];

const videos = [
  {
    platform: "TikTok",
    icon: "tiktok" as IconName,
    title: "Mở hộp set quà Phúc Lộc",
    views: "128K lượt xem",
    image:
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=700&q=88",
    product: "Set quà Phúc Lộc",
    commission: "91.080₫",
  },
  {
    platform: "Facebook",
    icon: "facebook" as IconName,
    title: "Lạp xưởng chiên nước siêu ngon",
    views: "86K lượt xem",
    image:
      "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=700&q=88",
    product: "Lạp xưởng tươi",
    commission: "28.350₫",
  },
  {
    platform: "YouTube",
    icon: "youtube" as IconName,
    title: "Thử vị khô gà lá chanh",
    views: "64K lượt xem",
    image:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=88",
    product: "Khô gà lá chanh",
    commission: "18.850₫",
  },
];

const testimonials = [
  {
    name: "Linh Nguyễn",
    role: "CTV từ tháng 8/2024",
    earning: "4.200.000₫",
    quote:
      "Mình chỉ chia sẻ món ngon vào group bạn bè. Không cần ôm hàng mà mỗi tuần vẫn có thêm thu nhập.",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=85",
  },
  {
    name: "Minh Anh",
    role: "Food creator",
    earning: "8.650.000₫",
    quote:
      "Link sản phẩm dễ tạo, dashboard rất rõ. Video nào lên xu hướng là mình theo dõi đơn được ngay.",
    image:
      "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=300&q=85",
  },
  {
    name: "Hoàng Nam",
    role: "CTV từ tháng 1/2025",
    earning: "3.780.000₫",
    quote: "Phúc Vị có sẵn nội dung và ảnh đẹp nên mình bắt đầu rất nhanh. Tiền về đều mỗi tuần.",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=85",
  },
];

const faqs = [
  {
    question: "Làm sao để nhận hoa hồng?",
    answer:
      "Sau khi đăng ký, bạn lấy link giới thiệu riêng của từng sản phẩm và chia sẻ lên Facebook, Zalo, TikTok hoặc website. Khi khách mua hàng thành công qua link, hoa hồng sẽ tự động ghi nhận vào tài khoản của bạn.",
  },
  {
    question: "Bao lâu mình được thanh toán?",
    answer:
      "Phúc Vị đối soát và thanh toán hoa hồng vào thứ Sáu hằng tuần. Bạn có thể yêu cầu rút tiền khi số dư khả dụng đạt từ 200.000₫.",
  },
  {
    question: "Tham gia có mất phí không?",
    answer:
      "Hoàn toàn miễn phí. Bạn không cần nhập hàng, không cần đặt cọc và không có chỉ tiêu doanh số bắt buộc.",
  },
  {
    question: "Mình có cần tự giao hàng cho khách?",
    answer:
      "Không. Phúc Vị xử lý toàn bộ khâu đóng gói, giao hàng và chăm sóc sau bán. Bạn chỉ cần tập trung chia sẻ sản phẩm phù hợp.",
  },
];

function Header() {
  const [open, setOpen] = useState(false);
  const { count, openCart } = useCart();
  return (
    <header className="site-header">
      <a href="#home" className="logo-link">
        <img src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
      </a>
      <nav className={open ? "open" : ""}>
        <button className="nav-close" onClick={() => setOpen(false)} aria-label="Đóng menu">
          <Icon name="close" />
        </button>
        <a href="#products" onClick={() => setOpen(false)}>
          Sản phẩm
        </a>
        <a href="#steps" onClick={() => setOpen(false)}>
          Cách hoạt động
        </a>
        <a href="#tiers" onClick={() => setOpen(false)}>
          Hoa hồng
        </a>
        <a href="#videos" onClick={() => setOpen(false)}>
          Video
        </a>
        <a href="#faq" onClick={() => setOpen(false)}>
          Hỏi đáp
        </a>
      </nav>
      <div className="header-actions">
        <button className="cart-icon" onClick={openCart} aria-label={`Giỏ hàng, ${count} sản phẩm`}>
          <Icon name="cart" size={19} />
          {count > 0 && <span>{count > 99 ? "99+" : count}</span>}
        </button>
        <a className="login-link" href="#login">
          Đăng nhập
        </a>
        <a className="header-signup" href="#signup">
          Đăng ký CTV
        </a>
        <button className="menu-button" onClick={() => setOpen(true)} aria-label="Mở menu">
          <Icon name="menu" />
        </button>
      </div>
      {open && (
        <button className="nav-overlay" onClick={() => setOpen(false)} aria-label="Đóng menu" />
      )}
    </header>
  );
}

function PhoneMockup() {
  return (
    <div className="phone-wrap">
      <div className="hero-bubble bubble-one">
        <Icon name="wallet" size={17} />
        <span>
          +91.080₫<small>Hoa hồng mới</small>
        </span>
      </div>
      <div className="hero-bubble bubble-two">
        <Icon name="orders" size={17} />
        <span>
          12 đơn<small>Hôm nay</small>
        </span>
      </div>
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-head">
          <img src="/images/phuc-vi-logo-official-transparent.png" alt="" />
          <span>Xin chào, Linh</span>
          <div className="mini-avatar">LN</div>
        </div>
        <div className="earning-card">
          <span>Hoa hồng tháng này</span>
          <strong>4.286.500₫</strong>
          <small>
            <b>+24%</b> so với tháng trước
          </small>
        </div>
        <div className="phone-stats">
          <div>
            <Icon name="clicks" size={16} />
            <strong>2.840</strong>
            <span>Lượt nhấp</span>
          </div>
          <div>
            <Icon name="orders" size={16} />
            <strong>184</strong>
            <span>Đơn hàng</span>
          </div>
        </div>
        <div className="mini-chart">
          <span>Thu nhập 7 ngày</span>
          <svg viewBox="0 0 240 70" preserveAspectRatio="none">
            <defs>
              <linearGradient id="phoneFill" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#E3B04B" stopOpacity=".35" />
                <stop offset="1" stopColor="#E3B04B" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 62C18 57 25 44 42 49s28 7 42-7 24-20 38-10 24 12 39-5 28-12 38-19 25 8 41-5V70H0Z"
              fill="url(#phoneFill)"
            />
            <path
              d="M0 62C18 57 25 44 42 49s28 7 42-7 24-20 38-10 24 12 39-5 28-12 38-19 25 8 41-5"
              fill="none"
              stroke="#D9A441"
              strokeWidth="3"
            />
          </svg>
        </div>
        <button className="phone-button">Rút hoa hồng</button>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero" id="home">
      <div className="hero-shape shape-one" />
      <div className="hero-shape shape-two" />
      <div className="hero-inner">
        <div className="hero-copy">
          <div className="friendly-pill">
            <Icon name="spark" size={15} /> Cộng đồng hơn 8.000 đối tác
          </div>
          <h1>
            Chia sẻ món ngon,
            <br />
            <span>nhận hoa hồng mỗi đơn</span>
          </h1>
          <p>
            Không cần nhập hàng, không lo vận chuyển. Chọn sản phẩm bạn yêu thích, chia sẻ link và
            nhận thu nhập khi có đơn thành công.
          </p>
          <div className="hero-actions">
            <a className="button primary-button" href="#signup">
              Đăng ký làm cộng tác viên <Icon name="arrow" size={18} />
            </a>
            <a className="button secondary-button" href="#products">
              Xem sản phẩm
            </a>
          </div>
          <div className="hero-stats">
            <div>
              <strong>15%</strong>
              <span>Hoa hồng đến</span>
            </div>
            <div>
              <strong>Mỗi tuần</strong>
              <span>Rút tiền nhanh</span>
            </div>
            <div>
              <strong>0₫</strong>
              <span>Miễn phí tham gia</span>
            </div>
          </div>
        </div>
        <PhoneMockup />
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function Steps() {
  const steps = [
    {
      icon: "user" as IconName,
      title: "Đăng ký miễn phí",
      text: "Tạo tài khoản trong 1 phút. Không cần vốn, không cần nhập hàng.",
    },
    {
      icon: "link" as IconName,
      title: "Lấy link giới thiệu",
      text: "Chọn món ngon phù hợp và tạo link riêng của bạn chỉ với một chạm.",
    },
    {
      icon: "wallet" as IconName,
      title: "Chia sẻ và nhận tiền",
      text: "Đăng lên mạng xã hội. Có đơn thành công là có hoa hồng.",
    },
  ];
  return (
    <section className="section steps-section" id="steps">
      <SectionHeading
        eyebrow="Dễ như chia sẻ một món ngon"
        title="Bắt đầu kiếm tiền trong 3 bước"
        description="Phúc Vị lo sản phẩm, giao hàng và chăm sóc khách. Bạn chỉ cần kết nối món ngon với đúng người."
      />
      <div className="steps-grid">
        {steps.map((step, index) => (
          <article className="step-card" key={step.title}>
            <span className="step-number">0{index + 1}</span>
            <div className="step-icon">
              <Icon name={step.icon} size={27} />
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            {index < 2 && (
              <div className="step-arrow">
                <Icon name="arrow" />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ShareButtons() {
  return (
    <div className="share-buttons">
      <button title="Facebook">
        <Icon name="facebook" size={15} />
      </button>
      <button title="Zalo">
        <Icon name="zalo" size={15} />
      </button>
      <button title="TikTok">
        <Icon name="tiktok" size={15} />
      </button>
    </div>
  );
}

function ProductCard({ product }: { product: (typeof products)[number] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(
      `https://phucvifoods.vn/p/${product.name.toLowerCase().replaceAll(" ", "-")}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <article className="product-card">
      <div className="product-image">
        <img src={product.image} alt={product.name} />
        <span>{product.rate} hoa hồng</span>
      </div>
      <div className="product-content">
        <div className="product-meta">
          <span>
            <b>★</b> 4.9
          </span>
          <span>{product.sold}</span>
        </div>
        <h3>{product.name}</h3>
        <strong className="price">{product.price}</strong>
        <div className="commission-badge">
          <span>
            <Icon name="gift" size={18} /> Hoa hồng dự kiến
          </span>
          <strong>{product.commission}</strong>
        </div>
        <div className="product-actions">
          <button className={copied ? "copied" : ""} onClick={copy}>
            <Icon name={copied ? "check" : "copy"} size={16} />
            {copied ? "Đã sao chép" : "Sao chép link giới thiệu"}
          </button>
          <ShareButtons />
        </div>
      </div>
    </article>
  );
}

function Products() {
  return (
    <section className="products-section" id="products">
      <div className="section">
        <SectionHeading
          eyebrow="Chọn sản phẩm, chia sẻ ngay"
          title="Món ngon dễ bán, hoa hồng rõ ràng"
          description="Mỗi sản phẩm đều có nội dung và hình ảnh sẵn để bạn bắt đầu chia sẻ nhanh hơn."
        />
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard product={product} key={product.name} />
          ))}
        </div>
        <a className="inline-link" href="#products">
          Xem tất cả sản phẩm <Icon name="arrow" size={17} />
        </a>
      </div>
    </section>
  );
}

function Videos() {
  return (
    <section className="section video-section" id="videos">
      <SectionHeading
        eyebrow="Nội dung đã có sẵn"
        title="Video được chia sẻ nhiều"
        description="Lấy cảm hứng từ những video đang tạo ra nhiều lượt xem và đơn hàng cho cộng đồng."
      />
      <div className="video-grid">
        {videos.map((video) => (
          <article className="video-card" key={video.title}>
            <div className="video-cover">
              <img src={video.image} alt={video.title} />
              <span className="platform-badge">
                <Icon name={video.icon} size={14} />
                {video.platform}
              </span>
              <button aria-label={`Phát ${video.title}`}>
                <Icon name="play" size={25} />
              </button>
              <div className="video-overlay">
                <strong>{video.title}</strong>
                <span>{video.views}</span>
              </div>
            </div>
            <div className="linked-product">
              <div>
                <span>Sản phẩm liên kết</span>
                <strong>{video.product}</strong>
              </div>
              <div>
                <span>Hoa hồng</span>
                <strong>{video.commission}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DashboardPreview() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="dashboard-section">
      <div className="dashboard-intro">
        <span>Minh bạch từng đơn hàng</span>
        <h2>
          Theo dõi thu nhập
          <br />
          ngay trên điện thoại
        </h2>
        <p>
          Biết chính xác bao nhiêu người đã nhấp link, đơn nào thành công và hoa hồng sắp nhận. Mọi
          con số đều được cập nhật rõ ràng.
        </p>
        <ul>
          <li>
            <Icon name="check" size={16} /> Báo cáo theo thời gian thực
          </li>
          <li>
            <Icon name="check" size={16} /> Đối soát minh bạch mỗi tuần
          </li>
          <li>
            <Icon name="check" size={16} /> Tạo link giới thiệu trong vài giây
          </li>
        </ul>
        <a className="button primary-button" href="#signup">
          Trở thành đối tác <Icon name="arrow" size={17} />
        </a>
      </div>
      <div className="dashboard-card">
        <div className="dash-head">
          <div>
            <span>Tổng quan thu nhập</span>
            <strong>Tháng 5, 2025</strong>
          </div>
          <div className="dash-avatar">LN</div>
        </div>
        <div className="dash-stats">
          <div>
            <span className="dash-icon red">
              <Icon name="clicks" size={18} />
            </span>
            <p>Lượt nhấp</p>
            <strong>12.840</strong>
            <small>+18,4%</small>
          </div>
          <div>
            <span className="dash-icon gold">
              <Icon name="orders" size={18} />
            </span>
            <p>Đơn hàng</p>
            <strong>486</strong>
            <small>+12,7%</small>
          </div>
          <div className="featured">
            <span className="dash-icon cream">
              <Icon name="money" size={18} />
            </span>
            <p>Hoa hồng tháng này</p>
            <strong>8.650.000₫</strong>
            <small>+24,2%</small>
          </div>
        </div>
        <div className="chart-head">
          <strong>Hoa hồng theo ngày</strong>
          <span>+1.720.000₫ tuần này</span>
        </div>
        <div className="dashboard-chart">
          <div className="chart-lines">
            <i />
            <i />
            <i />
            <i />
          </div>
          <svg viewBox="0 0 600 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#9B1C22" stopOpacity=".18" />
                <stop offset="1" stopColor="#9B1C22" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 139C35 130 49 106 86 115s52 8 80-16 50-3 81-19 50-43 83-25 49 25 83 1 55-19 82-31 63 3 105-20V160H0Z"
              fill="url(#dashFill)"
            />
            <path
              d="M0 139C35 130 49 106 86 115s52 8 80-16 50-3 81-19 50-43 83-25 49 25 83 1 55-19 82-31 63 3 105-20"
              fill="none"
              stroke="#9B1C22"
              strokeWidth="3"
            />
          </svg>
          <div>
            <span>01/05</span>
            <span>08/05</span>
            <span>15/05</span>
            <span>22/05</span>
            <span>29/05</span>
          </div>
        </div>
        <div className="referral-box">
          <span>
            <Icon name="link" size={17} /> Link giới thiệu của bạn
          </span>
          <div>
            <code>phucvi.vn/ref/linhnguyen</code>
            <button
              className={copied ? "copied" : ""}
              onClick={() => {
                navigator.clipboard?.writeText("https://phucvi.vn/ref/linhnguyen");
                setCopied(true);
              }}
            >
              {copied ? "Đã chép" : "Sao chép"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tiers() {
  const tiers = [
    {
      name: "Mới bắt đầu",
      rate: "8%",
      requirement: "Dưới 20 đơn / tháng",
      benefits: ["Tài khoản miễn phí", "Kho nội dung có sẵn", "Hỗ trợ từ cộng đồng"],
      color: "starter",
    },
    {
      name: "Tích cực",
      rate: "12%",
      requirement: "Từ 20 đơn / tháng",
      benefits: ["Tất cả quyền lợi cơ bản", "Ưu tiên chiến dịch hot", "Thưởng thêm theo mốc"],
      color: "active",
      popular: true,
    },
    {
      name: "Đại sứ",
      rate: "15%",
      requirement: "Từ 80 đơn / tháng",
      benefits: ["Mức hoa hồng cao nhất", "Sản phẩm dùng thử", "Quản lý hỗ trợ riêng"],
      color: "ambassador",
    },
  ];
  return (
    <section className="tiers-section" id="tiers">
      <div className="section">
        <SectionHeading
          eyebrow="Càng chia sẻ, càng nhận nhiều"
          title="Cấp bậc hoa hồng dành cho bạn"
          description="Tự động nâng hạng theo hiệu quả mỗi tháng. Không áp lực doanh số, không phí duy trì."
        />
        <div className="tier-grid">
          {tiers.map((tier) => (
            <article className={`tier-card ${tier.color}`} key={tier.name}>
              {tier.popular && <span className="popular-label">Được chọn nhiều nhất</span>}
              <div className="tier-icon">
                <Icon
                  name={
                    tier.color === "starter" ? "spark" : tier.color === "active" ? "star" : "shield"
                  }
                  size={25}
                />
              </div>
              <h3>{tier.name}</h3>
              <div className="tier-rate">
                <strong>{tier.rate}</strong>
                <span>
                  hoa hồng
                  <br />
                  mỗi đơn
                </span>
              </div>
              <p>{tier.requirement}</p>
              <ul>
                {tier.benefits.map((benefit) => (
                  <li key={benefit}>
                    <Icon name="check" size={15} />
                    {benefit}
                  </li>
                ))}
              </ul>
              <a href="#signup">
                Bắt đầu ngay <Icon name="arrow" size={16} />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="section testimonials-section">
      <SectionHeading
        eyebrow="Cộng đồng Phúc Vị"
        title="Thu nhập thật từ những chia sẻ thật"
        description="Mỗi đối tác có một cách riêng để biến sự yêu thích món ngon thành nguồn thu nhập linh hoạt."
      />
      <div className="testimonial-grid">
        {testimonials.map((item) => (
          <article className="testimonial-card" key={item.name}>
            <div className="quote-mark">“</div>
            <p>{item.quote}</p>
            <div className="testimonial-earning">
              <span>Tháng này nhận</span>
              <strong>{item.earning}</strong>
            </div>
            <div className="person">
              <img src={item.image} alt={item.name} />
              <div>
                <strong>{item.name}</strong>
                <span>{item.role}</span>
              </div>
              <div className="stars">★★★★★</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section className="faq-section" id="faq">
      <div className="faq-intro">
        <span>Bạn đang thắc mắc?</span>
        <h2>
          Mọi điều cần biết
          <br />
          trước khi bắt đầu
        </h2>
        <p>Nếu vẫn còn câu hỏi, đội ngũ Phúc Vị luôn sẵn sàng hỗ trợ bạn.</p>
        <a href="#support">
          <Icon name="help" size={18} /> Nhắn đội ngũ hỗ trợ
        </a>
      </div>
      <div className="faq-list">
        {faqs.map((faq, index) => (
          <article className={open === index ? "open" : ""} key={faq.question}>
            <button onClick={() => setOpen(open === index ? -1 : index)}>
              <span>{faq.question}</span>
              <Icon name="chevron" />
            </button>
            <div className="faq-answer">
              <p>{faq.answer}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="final-cta" id="signup">
      <div className="cta-orb orb-one" />
      <div className="cta-orb orb-two" />
      <img src="/images/phuc-vi-logo-official-transparent.png" alt="" />
      <div>
        <span>Bắt đầu hoàn toàn miễn phí</span>
        <h2>Sẵn sàng kiếm tiền cùng Phúc Vị?</h2>
        <p>Tạo tài khoản trong 1 phút và chia sẻ sản phẩm đầu tiên ngay hôm nay.</p>
      </div>
      <a className="button gold-button" href="#register">
        Đăng ký làm cộng tác viên <Icon name="arrow" size={18} />
      </a>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="footer-main">
        <div className="footer-brand">
          <img src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
          <p>Chia sẻ món ngon Việt, tạo thêm thu nhập theo cách của bạn.</p>
          <div className="footer-socials">
            <a href="#facebook">
              <Icon name="facebook" size={17} />
            </a>
            <a href="#tiktok">
              <Icon name="tiktok" size={17} />
            </a>
            <a href="#youtube">
              <Icon name="youtube" size={17} />
            </a>
            <a href="#zalo">
              <Icon name="zalo" size={17} />
            </a>
          </div>
        </div>
        <div className="footer-column">
          <strong>Dành cho đối tác</strong>
          <a href="#steps">Cách hoạt động</a>
          <a href="#tiers">Chính sách hoa hồng</a>
          <a href="#videos">Kho nội dung</a>
          <a href="#signup">Đăng ký CTV</a>
        </div>
        <div className="footer-column">
          <strong>Hỗ trợ</strong>
          <a href="#guide">Hướng dẫn CTV</a>
          <a href="#faq">Câu hỏi thường gặp</a>
          <a href="#terms">Điều khoản đối tác</a>
          <a href="#support">Liên hệ hỗ trợ</a>
        </div>
        <div className="footer-column contact">
          <strong>Đồng hành cùng bạn</strong>
          <p>
            Hotline: <b>1900 6868</b>
          </p>
          <p>Email: partner@phucvifoods.vn</p>
          <small>Thứ 2 – Thứ 7, 8:00 – 18:00</small>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2025 Phúc Vị Foods. All rights reserved.</span>
        <span>Chính sách bảo mật · Điều khoản sử dụng</span>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Steps />
        <Products />
        <Videos />
        <DashboardPreview />
        <Tiers />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
