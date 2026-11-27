import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ASPECT_OPTIONS, aspectRatio, cropRect, frameSize, initialView, MAX_ZOOM, MIN_ZOOM, outputSize, panView, rotatedSize, type AspectKey, type View } from "../lib/imageEdit";
import { MAX_SIDE } from "../lib/imageUpload";

const BOX_H = 320;

/** Vẽ ảnh đã xoay `turns` lần 90° lên một canvas riêng để cắt và xem trước. */
function rotatedCanvas(bitmap: ImageBitmap, turns: number): HTMLCanvasElement {
  const t = ((turns % 4) + 4) % 4;
  const { width, height } = rotatedSize(bitmap.width, bitmap.height, t);
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d")!;
  if (t === 1) { ctx.translate(width, 0); ctx.rotate(Math.PI / 2); }
  else if (t === 2) { ctx.translate(width, height); ctx.rotate(Math.PI); }
  else if (t === 3) { ctx.translate(0, height); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(bitmap, 0, 0);
  return c;
}

/**
 * Trình chỉnh ảnh trước khi tải lên: chọn tỷ lệ khung, kéo để căn, phóng to bằng thanh trượt hoặc lăn chuột, xoay 90°.
 * "Áp dụng" trả về tệp đã cắt; "Dùng nguyên ảnh" (khi cho phép) tải ảnh gốc không chỉnh.
 */
export function ImageEditor({ file, aspect = "original", maxSide = MAX_SIDE, allowSkip, onApply, onSkip, onCancel }: {
  file: File; aspect?: AspectKey; maxSide?: number; allowSkip?: boolean;
  onApply: (edited: File) => void; onSkip: () => void; onCancel: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [turns, setTurns] = useState(0);
  const [aspectKey, setAspectKey] = useState<AspectKey>(aspect);
  const [view, setView] = useState<View>({ zoom: 1, cx: 0, cy: 0 });
  const [boxW] = useState(() => Math.max(240, Math.min(520, window.innerWidth - 72)));
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let made: ImageBitmap | null = null;
    createImageBitmap(file, { imageOrientation: "from-image" }).then((b) => { made = b; if (alive) setBitmap(b); else b.close(); }).catch(() => alive && setLoadError("Không đọc được ảnh này, vui lòng chọn ảnh khác."));
    return () => { alive = false; made?.close(); };
  }, [file]);

  // Esc chỉ đóng trình chỉnh ảnh, không đóng luôn biểu mẫu bên dưới (bắt ở pha capture rồi chặn).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onCancel(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const source = useMemo(() => (bitmap ? rotatedCanvas(bitmap, turns) : null), [bitmap, turns]);
  const W = source?.width ?? 1;
  const H = source?.height ?? 1;
  const ratio = aspectRatio(aspectKey, W, H);
  const frame = frameSize(ratio, boxW, BOX_H);
  const rect = cropRect(W, H, ratio, view);

  // Đổi ảnh gốc, xoay hoặc đổi tỷ lệ thì đưa khung về giữa.
  useEffect(() => { if (source) setView(initialView(source.width, source.height)); }, [source, aspectKey]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !source) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(frame.width * dpr); c.height = Math.round(frame.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  });

  function onDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) / frame.width;
    const dy = (e.clientY - drag.current.y) / frame.height;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => panView(W, H, ratio, v, dx, dy));
  }
  const zoomBy = (delta: number) => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom + delta)) }));

  async function apply() {
    if (!source) return;
    const size = outputSize(rect, maxSide);
    const out = document.createElement("canvas");
    out.width = size.width; out.height = size.height;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size.width, size.height);
    let blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/webp", 0.92));
    if (!blob || blob.type !== "image/webp") { // trình duyệt không xuất được WebP: JPEG nền trắng
      ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size.width, size.height);
      blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/jpeg", 0.9));
    }
    if (!blob) { setLoadError("Không xuất được ảnh, vui lòng thử lại."); return; }
    onApply(new File([blob], blob.type === "image/webp" ? "anh.webp" : "anh.jpg", { type: blob.type }));
  }

  return createPortal(
    <div className="ad-overlay ad-editor-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ad-modal ad-editor" role="dialog" aria-modal="true" aria-label="Chỉnh ảnh">
        <header><h2>Chỉnh ảnh</h2><button type="button" className="ad-x" aria-label="Đóng" onClick={onCancel}>×</button></header>
        <div className="ad-modal-body">
          {loadError ? <p className="ad-error" role="alert">{loadError}</p> : !source ? <p className="ad-muted">Đang mở ảnh...</p> : (
            <>
              <div className="ad-editor-aspects" role="group" aria-label="Tỷ lệ khung">
                {ASPECT_OPTIONS.map((o) => (
                  <button key={o.key} type="button" className={aspectKey === o.key ? "active" : ""} aria-pressed={aspectKey === o.key} onClick={() => setAspectKey(o.key)}>{o.label}</button>
                ))}
              </div>
              <div className="ad-editor-stage" style={{ height: BOX_H }}>
                <div className="ad-editor-frame" style={{ width: frame.width, height: frame.height }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
                  onWheel={(e) => zoomBy(e.deltaY < 0 ? 0.1 : -0.1)}>
                  <canvas ref={canvas} style={{ width: frame.width, height: frame.height }} aria-label="Xem trước ảnh, kéo để căn chỉnh" />
                  <i aria-hidden="true" />
                </div>
              </div>
              <p className="ad-muted ad-editor-tip">Kéo ảnh để căn, lăn chuột hoặc dùng thanh trượt để phóng to.</p>
              <div className="ad-editor-tools">
                <button type="button" className="ad-btn" onClick={() => setTurns((t) => t - 1)} aria-label="Xoay trái 90 độ">↺ Xoay trái</button>
                <button type="button" className="ad-btn" onClick={() => setTurns((t) => t + 1)} aria-label="Xoay phải 90 độ">↻ Xoay phải</button>
                <label className="ad-editor-zoom">
                  <span>Thu phóng</span>
                  <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={view.zoom} onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))} aria-label="Phóng to" />
                </label>
                <button type="button" className="ad-btn" onClick={() => { setTurns(0); setAspectKey(aspect); setView(initialView(bitmap!.width, bitmap!.height)); }}>Đặt lại</button>
              </div>
            </>
          )}
          <div className="ad-form-actions">
            <button type="button" className="ad-btn" onClick={onCancel}>Hủy</button>
            {allowSkip && <button type="button" className="ad-btn" onClick={onSkip}>Dùng nguyên ảnh</button>}
            <button type="button" className="ad-btn primary" onClick={() => void apply()} disabled={!source}>Áp dụng</button>
          </div>
        </div>
      </div>
    </div>,
    document.querySelector(".ad-shell") ?? document.body, // biến màu của trang quản trị nằm ở .ad-shell
  );
}
