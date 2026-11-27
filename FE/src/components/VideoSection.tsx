import { useState } from "react";
import { fetchVideos, resolveVideo, videoThumb, type PublicVideo } from "../lib/video";
import { useAsync } from "../lib/useAsync";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Khung video rộng ở trang chủ (YouTube, Vimeo, TikTok, Facebook, tệp .mp4...): video đang chọn hiện ảnh bìa, bấm mới tải và phát (nhẹ trang);
 * link lạ không nhúng được thì bấm mở ở tab mới. Nhiều video thì có hàng ảnh nhỏ để đổi. Chưa có video nào thì ẩn cả mục.
 */
export function VideoSection() {
  const { data } = useAsync((signal) => fetchVideos(signal), []);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const items = (data ?? []).filter((v) => resolveVideo(v.videoUrl));
  if (items.length === 0) return null;
  const cur: PublicVideo = items[Math.min(selected, items.length - 1)];
  const source = resolveVideo(cur.videoUrl)!;
  const thumb = videoThumb(cur.videoUrl, cur.thumbnailUrl);
  const poster = (
    <>
      {thumb && <img src={thumb} alt="" loading="lazy" />}
      <span className="home-video-play" aria-hidden="true">▶</span>
    </>
  );
  return (
    <section className="home-section home-videos" id="video" aria-labelledby="video-title">
      <div className="home-section-heading">
        <h2 id="video-title">Phúc Vị qua từng thước phim</h2>
      </div>
      <div className="home-video-main">
        {source.kind !== "link" && playing === cur.id ? (
          <VideoPlayer source={source} title={cur.title} />
        ) : (
          <div className="video-frame">
            {source.kind === "link" ? (
              <a className="home-video-poster" href={source.href} target="_blank" rel="noopener noreferrer" aria-label={`Mở video: ${cur.title}`}>{poster}</a>
            ) : (
              <button className="home-video-poster" onClick={() => setPlaying(cur.id)} aria-label={`Phát video: ${cur.title}`}>{poster}</button>
            )}
          </div>
        )}
      </div>
      {items.length > 1 && (
        <ul className="home-video-list">
          {items.map((v, i) => {
            const t = videoThumb(v.videoUrl, v.thumbnailUrl);
            return (
              <li key={v.id}>
                <button className={i === selected ? "active" : ""} onClick={() => { setSelected(i); setPlaying(null); }} aria-label={`Chọn video: ${v.title}`} aria-pressed={i === selected}>
                  {t ? <img src={t} alt="" loading="lazy" /> : <span className="home-video-nothumb" aria-hidden="true">▶</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
