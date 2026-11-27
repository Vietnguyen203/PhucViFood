import { useEffect, useRef } from "react";
import { youtubeEmbed } from "../lib/video";

/** Hộp phát video YouTube ngay trên trang: Esc, bấm nền tối hoặc nút đóng để tắt; trả tiêu điểm về nút đã mở. */
export function VideoModal({ videoId, title, onClose }: { videoId: string; title: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; opener?.focus?.(); };
  }, [onClose]);
  return (
    <div className="video-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="video-modal-box">
        <button ref={closeRef} className="video-modal-close" onClick={onClose} aria-label="Đóng video">×</button>
        <div className="video-frame">
          <iframe src={youtubeEmbed(videoId)} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
        <p className="video-modal-title">{title}</p>
      </div>
    </div>
  );
}
