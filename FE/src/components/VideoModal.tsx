import { useEffect, useRef } from "react";
import type { VideoSource } from "../lib/video";
import { VideoPlayer } from "./VideoPlayer";

/** Hộp phát video ngay trên trang: Esc, bấm nền tối hoặc nút đóng để tắt; trả tiêu điểm về nút đã mở. */
export function VideoModal({ source, title, onClose }: { source: Extract<VideoSource, { kind: "iframe" | "file" }>; title: string; onClose: () => void }) {
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
        <VideoPlayer source={source} title={title} />
      </div>
    </div>
  );
}
