import { CREATOR_KIND_LABEL, fetchCreators } from "../lib/creator";
import { useAsync } from "../lib/useAsync";
import { TargetLink } from "./TargetLink";

/**
 * Mục KOL & KOC ở trang chủ: hàng thẻ chân dung dọc (người có tầm ảnh hưởng và khách thật chia sẻ trải nghiệm), bấm vào ra trang đích.
 * Nội dung do admin cài; chưa có thẻ nào (hoặc lỗi tải) thì ẩn cả mục để trang chủ không có khung trống.
 */
export function CreatorSection() {
  const { data } = useAsync((signal) => fetchCreators(signal), []);
  if (!data || data.length === 0) return null;
  return (
    <section className="home-section home-creators" id="kol-koc" aria-labelledby="kol-koc-title">
      <div className="home-section-heading">
        <span>KOL &amp; KOC</span>
        <h2 id="kol-koc-title">Người thật, trải nghiệm thật</h2>
        <p>Những gương mặt và khách hàng đã thử và chia sẻ cảm nhận về đặc sản Phúc Vị.</p>
      </div>
      <ul className="home-creator-row">
        {data.map((c) => (
          <li key={c.id}>
            <TargetLink to={c.linkUrl} label={`${c.name}${c.headline ? `: ${c.headline}` : ""}`} className="home-creator-card">
              <img src={c.imageUrl} alt="" loading="lazy" />
              <span className={`home-creator-kind ${c.kind}`}>{CREATOR_KIND_LABEL[c.kind]}</span>
              <span className="home-creator-info">
                <strong>{c.name}</strong>
                {c.headline && <small>{c.headline}</small>}
              </span>
            </TargetLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
