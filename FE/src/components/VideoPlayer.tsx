import type { VideoSource } from "../lib/video";

/** Khung phát một video đã nhận biết (khung nhúng hoặc tệp), tự phát khi hiện ra. Video dọc (TikTok, Reels) dùng khung đứng. */
export function VideoPlayer({ source, title }: { source: Extract<VideoSource, { kind: "iframe" | "file" }>; title: string }) {
  const portrait = source.kind === "iframe" && source.portrait;
  return (
    <div className={`video-frame${portrait ? " portrait" : ""}`}>
      {source.kind === "iframe" ? (
        <iframe src={source.src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <video src={source.src} title={title} controls autoPlay playsInline preload="metadata" />
      )}
    </div>
  );
}
