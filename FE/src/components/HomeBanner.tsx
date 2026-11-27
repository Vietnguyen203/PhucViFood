import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { bannerTarget, DEFAULT_MAIN_BANNERS, fetchBanners, MAX_SIDE_BANNERS, type PublicBanner } from "../lib/banner";
import { useAsync } from "../lib/useAsync";
import { HomeIcon } from "./Icon";

/** Ảnh banner bấm được: trang trong cửa hàng, link ngoài (mở tab mới) hoặc chỉ là ảnh. */
function BannerLink({ banner, children, className }: { banner: PublicBanner; children: ReactNode; className?: string }) {
  const t = bannerTarget(banner.linkUrl);
  if (t.kind === "internal") return <Link className={className} to={t.to} aria-label={banner.title}>{children}</Link>;
  if (t.kind === "external") return <a className={className} href={t.href} target="_blank" rel="noopener noreferrer" aria-label={banner.title}>{children}</a>;
  return <div className={className} role="img" aria-label={banner.title}>{children}</div>;
}

const AUTO_MS = 5000;

/** Khung lớn: các ảnh chính trượt tự động (dừng khi rê chuột), có mũi tên và chấm chọn khi có nhiều ảnh. */
function MainBanner({ banners }: { banners: PublicBanner[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;
  useEffect(() => { if (active >= count) setActive(0); }, [count, active]);
  useEffect(() => {
    if (count < 2 || paused) return;
    const t = window.setInterval(() => setActive((i) => (i + 1) % count), AUTO_MS);
    return () => window.clearInterval(t);
  }, [count, paused]);
  const current = banners[Math.min(active, count - 1)];
  return (
    <div className="home-banner-main" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <BannerLink banner={current} className="home-banner-link">
        <img key={current.id} src={current.imageUrl} alt={current.title} />
      </BannerLink>
      {count > 1 && (
        <div className="home-banner-controls">
          <button onClick={() => setActive((active - 1 + count) % count)} aria-label="Ảnh trước"><HomeIcon name="chevron" /></button>
          <div>
            {banners.map((b, i) => <button key={b.id} className={active === i ? "active" : ""} onClick={() => setActive(i)} aria-label={`Xem ảnh ${i + 1}`} aria-current={active === i} />)}
          </div>
          <button onClick={() => setActive((active + 1) % count)} aria-label="Ảnh sau"><HomeIcon name="chevron" /></button>
        </div>
      )}
    </div>
  );
}

/**
 * Banner đầu trang chủ chỉ có ảnh: khung lớn bên trái (nhiều ảnh trượt) và các ô khuyến mãi bên phải, bấm vào ra trang đích.
 * Nội dung do admin cài đặt; chưa có thì dùng ảnh mặc định (bấm ra khu sản phẩm), bên phải để trống.
 */
export function HomeBanner() {
  const { data, loading } = useAsync((signal) => fetchBanners(signal), []);
  if (loading && !data) return <section className="home-banner"><div className="home-banner-main home-banner-skeleton" aria-hidden="true" /></section>;
  const main = data && data.main.length > 0 ? data.main : DEFAULT_MAIN_BANNERS;
  const side = (data?.side ?? []).slice(0, MAX_SIDE_BANNERS);
  return (
    <section className={`home-banner${side.length === 0 ? " no-side" : ""}`} aria-label="Banner nổi bật">
      <MainBanner banners={main} />
      {side.length > 0 && (
        <div className={`home-banner-side count-${side.length}`}>
          {side.map((b) => (
            <BannerLink key={b.id} banner={b} className="home-banner-tile"><img src={b.imageUrl} alt={b.title} /></BannerLink>
          ))}
        </div>
      )}
    </section>
  );
}
