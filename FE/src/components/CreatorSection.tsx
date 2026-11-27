import { useState } from "react";
import { CREATOR_KIND_LABEL, fetchCreators } from "../lib/creator";
import { youtubeId } from "../lib/video";
import { useAsync } from "../lib/useAsync";
import { TargetLink } from "./TargetLink";
import { VideoModal } from "./VideoModal";

/**
 * Mục KOL & KOC ở trang chủ: hàng thẻ chân dung dọc (người có tầm ảnh hưởng và khách thật chia sẻ trải nghiệm), bấm vào ra trang đích.
 * Nội dung do admin cài; chưa có thẻ nào (hoặc lỗi tải) thì ẩn cả mục để trang chủ không có khung trống.
 */
export function CreatorSection() {
  const { data } = useAsync((signal) => fetchCreators(signal), []);
  const [video, setVideo] = useState<{ id: string; title: string } | null>(null);
  if (!data || data.length === 0) return null;
  return (
    <section className="home-section home-creators" id="kol-koc" aria-labelledby="kol-koc-title">
      <div className="home-section-heading">
        <span>KOL &amp; KOC</span>
        <h2 id="kol-koc-title">Người thật, trải nghiệm thật</h2>
        <p>Những gương mặt và khách hàng đã thử và chia sẻ cảm nhận về đặc sản Phúc Vị.</p>
      </div>
      <ul className="home-creator-row">
        {data.map((c) => {
          const label = `${c.name}${c.headline ? `: ${c.headline}` : ""}`;
          const vid = youtubeId(c.linkUrl);
          const inner = (
            <>
              <img src={c.imageUrl} alt="" loading="lazy" />
              <span className={`home-creator-kind ${c.kind}`}>{CREATOR_KIND_LABEL[c.kind]}</span>
              {vid && <span className="home-creator-play" aria-hidden="true">▶</span>}
              <span className="home-creator-info">
                <strong>{c.name}</strong>
                {c.headline && <small>{c.headline}</small>}
              </span>
            </>
          );
          return (
            <li key={c.id}>
              {vid ? (
                <button type="button" className="home-creator-card" aria-label={`Xem video: ${label}`} onClick={() => setVideo({ id: vid, title: label })}>{inner}</button>
              ) : (
                <TargetLink to={c.linkUrl} label={label} className="home-creator-card">{inner}</TargetLink>
              )}
            </li>
          );
        })}
      </ul>
      {video && <VideoModal videoId={video.id} title={video.title} onClose={() => setVideo(null)} />}
    </section>
  );
}
