import { useEffect, useRef, useState } from "react";
import { describeError } from "../lib/api";
import { ACCEPTED_TYPES, fileProblem, prepareImage } from "../lib/imageUpload";
import { useAdmin } from "./AdminContext";
import { Field } from "./ui";

/** Ảnh sản phẩm: chọn tệp từ máy (tự thu nhỏ và nén rồi tải lên), hoặc dán đường dẫn ảnh. Có xem trước. */
export function ImageField({ value, onChange, error, label = "Ảnh sản phẩm", maxSide, hint }: { value: string; onChange: (url: string) => void; error?: string; label?: string; maxSide?: number; hint?: string }) {
  const { adm } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [asLink, setAsLink] = useState(false);
  useEffect(() => setBroken(false), [value]);

  async function pick(file: File | undefined) {
    if (!file) return;
    const bad = fileProblem(file);
    if (bad) { setProblem(bad); return; }
    setBusy(true); setProblem(null);
    try {
      const blob = await prepareImage(file, maxSide);
      const r = await adm<{ url: string }>("/products/images", { method: "POST", body: blob, timeoutMs: 60_000 });
      onChange(r.data.url);
    } catch (e) {
      setProblem(e instanceof Error && !("status" in e) ? e.message : describeError(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = ""; // cho phép chọn lại đúng tệp đó
    }
  }

  const has = value.trim() !== "";
  return (
    <div className="ad-image-field">
      <span className="ad-image-label">{label}</span>
      <div className="ad-image-body">
        <div className="ad-image-box">
          {has && !broken
            ? <img src={value} alt="Ảnh sản phẩm" onError={() => setBroken(true)} />
            : <span>{busy ? "Đang tải..." : broken ? "Không tải được ảnh" : "Chưa có ảnh"}</span>}
        </div>
        <div className="ad-image-actions">
          <input ref={input} type="file" accept={ACCEPTED_TYPES.join(",") + ",image/*"} hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <div className="ad-row-actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="ad-btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Đang tải lên..." : has ? "Đổi ảnh" : "Chọn ảnh từ máy"}</button>
            {has && <button type="button" className="ad-btn" disabled={busy} onClick={() => onChange("")}>Gỡ ảnh</button>}
          </div>
          <small className="ad-muted">{hint ?? "PNG, JPEG hoặc WebP. Ảnh lớn được tự thu nhỏ trước khi tải lên."}</small>
          <button type="button" className="ad-link" onClick={() => setAsLink((v) => !v)}>{asLink ? "Ẩn ô đường dẫn" : "Hoặc dán đường dẫn ảnh"}</button>
          {asLink && (
            <Field label="Đường dẫn ảnh" error={error}>
              <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://..." />
            </Field>
          )}
        </div>
      </div>
      {(problem || (error && !asLink)) && <p className="ad-error" role="alert">{problem ?? error}</p>}
    </div>
  );
}
