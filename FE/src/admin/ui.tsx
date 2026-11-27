import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, describeError, type PageMeta } from "../lib/api";
import { buildQuery, type ListQuery } from "../lib/admin/query";
import { useAsync } from "../lib/useAsync";
import { useAdmin } from "./AdminContext";
import { AdIcon } from "./icons";

export const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour12: false }) : "—");
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "—");
export const fmtBps = (bps: number) => `${(bps / 100).toLocaleString("vi-VN")}%`;

/** Danh sách phân trang từ một endpoint quản trị; đổi query thì tự tải lại, hủy yêu cầu cũ. */
export function useList<T>(path: string, query: ListQuery) {
  const { adm } = useAdmin();
  const qs = buildQuery(query);
  const state = useAsync(async (signal) => {
    const r = await adm<T[]>(`${path}${qs}`, { signal });
    return { items: r.data, meta: r.meta?.pagination as PageMeta | undefined };
  }, [path, qs]);
  return state;
}

/** Trạng thái bộ lọc + trang cho một màn danh sách. Đổi bộ lọc thì về trang 1. */
export function useListFilters<F extends Record<string, string>>(initial: F, pageSize = 20) {
  const [filters, setFilters] = useState<F>(initial);
  const [applied, setApplied] = useState<F>(initial);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<string | undefined>(undefined);
  return {
    filters, setFilters, applied, page, setPage, sort, pageSize,
    setField: <K extends keyof F>(k: K, v: F[K]) => setFilters((f) => ({ ...f, [k]: v })),
    apply: () => { setApplied(filters); setPage(1); },
    // Ô chọn (select) áp dụng ngay, ô gõ chữ đợi nhấn Enter / nút Lọc.
    applyNow: (patch: Partial<F>) => { const next = { ...filters, ...patch }; setFilters(next); setApplied(next); setPage(1); },
    reset: () => { setFilters(initial); setApplied(initial); setPage(1); },
    toggleSort: (field: string) => { setSort((s) => (s === field ? `-${field}` : s === `-${field}` ? undefined : field)); setPage(1); },
  };
}

export function Pager({ meta, onPage }: { meta?: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.totalPages <= 1) return meta ? <p className="ad-count">{meta.total} kết quả</p> : null;
  return (
    <div className="ad-pager">
      <span>{meta.total} kết quả · trang {meta.page}/{meta.totalPages}</span>
      <div>
        <button className="ad-btn" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>← Trước</button>
        <button className="ad-btn" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Sau →</button>
      </div>
    </div>
  );
}

export function SortHeader({ label, field, sort, onSort }: { label: string; field: string; sort?: string; onSort: (f: string) => void }) {
  const dir = sort === field ? " ▲" : sort === `-${field}` ? " ▼" : "";
  return <th><button className="ad-sort" onClick={() => onSort(field)}>{label}{dir}</button></th>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="ad-error" role="alert">
      {describeError(error)}
      {onRetry && <button className="ad-btn" onClick={onRetry}>Thử lại</button>}
    </div>
  );
}

export function Loading({ loading, empty }: { loading: boolean; empty?: boolean }) {
  if (loading) return <p className="ad-muted">Đang tải...</p>;
  if (empty) return <p className="ad-muted">Không có dữ liệu.</p>;
  return null;
}

export function Badge({ tone = "gray", children }: { tone?: "gray" | "green" | "red" | "amber" | "blue"; children: ReactNode }) {
  return <span className={`ad-badge ${tone}`}>{children}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ad-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`ad-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="ad-x" aria-label="Đóng" onClick={onClose}>×</button></header>
        <div className="ad-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={`ad-field${error ? " invalid" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}

/** Lỗi 400 của backend (details: [{field, messages}]) thành bản đồ trường → thông báo. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (e instanceof ApiError && Array.isArray(e.details)) {
    for (const d of e.details as Array<{ field?: string; messages?: string[] }>) if (d.field) out[d.field] = d.messages?.[0] ?? "Không hợp lệ";
  }
  return out;
}

/**
 * Hộp thoại nhập liệu: bọc form, nút Lưu/Hủy, trạng thái đang gửi và lỗi chung. `onSubmit` ném lỗi thì hiện trong hộp.
 * Trả về lỗi theo trường qua `errors` (render lại khi lỗi 400).
 */
export function FormModal({ title, submitLabel = "Lưu", danger, onClose, onSubmit, children, wide }: {
  title: string; submitLabel?: string; danger?: boolean; wide?: boolean; onClose: () => void;
  onSubmit: () => Promise<void>; children: (errors: Record<string, string>) => ReactNode;
}) {
  const { notify } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(null); setErrors({});
    try { await onSubmit(); onClose(); } catch (e) {
      const fe = fieldErrors(e);
      setErrors(fe);
      setMessage(Object.keys(fe).length > 0 ? "Vui lòng kiểm tra lại các trường được đánh dấu." : describeError(e));
      if (!(e instanceof ApiError)) notify(describeError(e), "error");
    } finally { setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit} noValidate>
        {children(errors)}
        {message && <p className="ad-error" role="alert">{message}</p>}
        <div className="ad-form-actions">
          <button type="button" className="ad-btn" onClick={onClose} disabled={busy}>Hủy</button>
          <button type="submit" className={`ad-btn ${danger ? "danger" : "primary"}`} disabled={busy}>{busy ? "Đang xử lý..." : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Xác nhận một hành động; có thể kèm ô nhập lý do. */
export function ConfirmModal({ title, message, confirmLabel, danger, reason, onClose, onConfirm }: {
  title: string; message: ReactNode; confirmLabel: string; danger?: boolean;
  reason?: { label: string; required?: boolean; min?: number };
  onClose: () => void; onConfirm: (reason: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const min = reason?.required ? reason.min ?? 3 : 0;
  const tooShort = reason?.required && text.trim().length < min;
  return (
    <FormModal title={title} submitLabel={confirmLabel} danger={danger} onClose={onClose}
      onSubmit={async () => { if (tooShort) throw new ApiError(400, "VALIDATION_FAILED", `${reason?.label} cần từ ${min} ký tự.`); await onConfirm(text.trim()); }}>
      {(errors) => (
        <>
          <div className="ad-confirm">{message}</div>
          {reason && (
            <Field label={reason.label + (reason.required ? " *" : "")} error={errors.reason}>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={255} autoFocus />
            </Field>
          )}
        </>
      )}
    </FormModal>
  );
}

export function Toasts() {
  const { toasts } = useAdmin();
  return <div className="ad-toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`ad-toast ${t.kind}`}>{t.text}</div>)}</div>;
}

/** Thanh lọc: ô tìm kiếm + các bộ lọc; Enter hoặc nút Lọc để áp dụng. */
export function FilterBar({ onApply, onReset, children }: { onApply: () => void; onReset: () => void; children: ReactNode }) {
  return (
    <form className="ad-filters" onSubmit={(e) => { e.preventDefault(); onApply(); }}>
      {children}
      <div className="ad-filter-actions">
        <button className="ad-btn primary" type="submit"><AdIcon name="search" size={16} /> Lọc</button>
        <button className="ad-icon-btn" type="button" onClick={onReset} title="Xóa bộ lọc" aria-label="Xóa bộ lọc"><AdIcon name="close" /></button>
      </div>
    </form>
  );
}

/** Chạy một hành động ghi: báo thành công/lỗi bằng toast rồi tải lại danh sách. */
export function useAction(reload?: () => void) {
  const { notify } = useAdmin();
  const [busy, setBusy] = useState(false);
  return useMemo(() => ({
    busy,
    async run(fn: () => Promise<unknown>, okText: string) {
      setBusy(true);
      try { await fn(); notify(okText); reload?.(); return true; } catch (e) { notify(describeError(e), "error"); return false; } finally { setBusy(false); }
    },
  }), [busy, notify, reload]);
}
