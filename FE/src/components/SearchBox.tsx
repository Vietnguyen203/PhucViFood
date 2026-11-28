import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { fetchProducts, normalizeSearch } from "../lib/catalog";
import { formatVnd } from "../lib/money";
import type { Product } from "../lib/types";
import { PRODUCT_PLACEHOLDER } from "./CartDrawer";
import { HomeIcon } from "./Icon";

const MIN_CHARS = 2;
const DELAY_MS = 250;

/**
 * Ô tìm kiếm ở header kèm gợi ý sản phẩm khi gõ (tối đa 5). Mũi tên lên/xuống chọn gợi ý, Enter mở sản phẩm đang chọn
 * (không chọn thì sang trang kết quả), Esc đóng. Theo mẫu combobox/listbox của ARIA để trình đọc màn hình đọc được.
 */
export function SearchBox({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);
  const q = normalizeSearch(term);

  // Gợi ý có độ trễ; yêu cầu cũ bị hủy khi gõ tiếp để kết quả không về sai thứ tự.
  useEffect(() => {
    if (q.length < MIN_CHARS) { setItems([]); setOpen(false); return; }
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      fetchProducts({ q, pageSize: 5, sort: "name" }, ctl.signal)
        .then((r) => { setItems(r.items); setActive(-1); setOpen(true); })
        .catch(() => { /* gợi ý chỉ là phần thêm: lỗi mạng thì bỏ qua, vẫn bấm Enter để tìm */ });
    }, DELAY_MS);
    return () => { window.clearTimeout(timer); ctl.abort(); };
  }, [q]);

  // Bấm ra ngoài thì đóng danh sách gợi ý.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (path: string) => { setOpen(false); onClose(); navigate(path); };

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (open && active >= 0 && items[active]) return go(`/products/${encodeURIComponent(items[active].slug)}`);
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { if (open) setOpen(false); else onClose(); return; }
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
  }

  return (
    <form className="shop-header-search" role="search" onSubmit={onSubmit} ref={box}>
      <input
        autoFocus type="search" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={100}
        placeholder="Tìm sản phẩm..." aria-label="Tìm sản phẩm" autoComplete="off"
        role="combobox" aria-expanded={open && items.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onKeyDown={onKeyDown}
      />
      <button type="submit" aria-label="Tìm"><HomeIcon name="search" size={18} /></button>
      {open && (
        <ul className="shop-suggest" id={listId} role="listbox" aria-label="Gợi ý sản phẩm">
          {items.length === 0 && <li className="shop-suggest-empty" role="option" aria-selected="false">Không có sản phẩm khớp "{q}"</li>}
          {items.map((p, i) => (
            <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? "active" : ""}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(`/products/${encodeURIComponent(p.slug)}`); }}>
              <img src={p.imageUrl ?? PRODUCT_PLACEHOLDER} alt="" />
              <span>{p.name}</span>
              <b>{formatVnd(p.price)}</b>
            </li>
          ))}
          {items.length > 0 && (
            <li className="shop-suggest-all" role="option" aria-selected="false" onMouseDown={(e) => { e.preventDefault(); go(`/search?q=${encodeURIComponent(q)}`); }}>
              Xem tất cả kết quả cho "{q}"
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
