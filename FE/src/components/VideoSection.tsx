import { useState } from "react";
import { fetchVideos, youtubeEmbed, youtubeId, youtubeThumb, type PublicVideo } from "../lib/video";
import { useAsync } from "../lib/useAsync";

/** Khung video rộng ở trang chủ: video đang chọn hiện ảnh bìa, bấm mới tải và phát (nhẹ trang); nhiều video thì có hàng ảnh nhỏ để đổi. Chưa có video nào thì ẩn cả mục. */
export function VideoSection() {
  const { data } = useAsync((signal) => fetchVideos(signal), []);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const items = (data ?? []).filter((v) => youtubeId(v.videoUrl));
  if (items.length === 0) return null;
  const cur: PublicVideo = items[Math.min(selected, items.length - 1)];
  const id = youtubeId(cur.videoUrl)!;
  return (
    <section className="home-section home-videos" id="video" aria-labelledby="video-title">
      <div className="home-section-heading">
        <span>Video</span>
        <h2 id="video-title">Phúc Vị qua từng thước phim</h2>
      </div>
      <div className="home-video-main">
        <div className="video-frame">
          {playing === cur.id ? (
            <iframe src={youtubeEmbed(id)} title={cur.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          ) : (
            <button className="home-video-poster" onClick={() => setPlaying(cur.id)} aria-label={`Phát video: ${cur.title}`}>
              <img src={youtubeThumb(id)} alt="" loading="lazy" />
              <span className="home-video-play" aria-hidden="true">▶</span>
            </button>
          )}
        </div>
        <p className="home-video-title">{cur.title}</p>
      </div>
      {items.length > 1 && (
        <ul className="home-video-list">
          {items.map((v, i) => (
            <li key={v.id}>
              <button className={i === selected ? "active" : ""} onClick={() => { setSelected(i); setPlaying(null); }} aria-label={`Chọn video: ${v.title}`} aria-pressed={i === selected}>
                <img src={youtubeThumb(youtubeId(v.videoUrl)!)} alt="" loading="lazy" />
                <span>{v.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
