import { useEffect, useState } from "react";
import { formatVnd } from "../lib/money";
import { STOCK_REASON_LABEL, type AdminCategory, type AdminProduct, type StockMovement } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FilterBar, FormModal, Loading, Modal, Pager, SortHeader, fmtDateTime, useAction, useList, useListFilters } from "./ui";

/** Xem trước ảnh theo đường dẫn đang nhập; link hỏng thì báo ngay để người nhập biết trước khi lưu. */
function ImagePreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return failed
    ? <p className="ad-error" role="alert">Không tải được ảnh từ đường dẫn này.</p>
    : <img className="ad-preview" src={url} alt="Xem trước ảnh sản phẩm" onError={() => setFailed(true)} />;
}

const EMPTY = { categoryId: "", name: "", sku: "", unit: "", price: "", originalPrice: "", imageUrl: "", description: "", stockQuantity: "0", isVisible: true };
type Form = typeof EMPTY;

function toForm(p: AdminProduct): Form {
  return { categoryId: p.categoryId, name: p.name, sku: p.sku ?? "", unit: p.unit ?? "", price: String(p.price), originalPrice: p.originalPrice ? String(p.originalPrice) : "", imageUrl: p.imageUrl ?? "", description: p.description ?? "", stockQuantity: String(p.stockQuantity), isVisible: p.isVisible };
}

/** Số nguyên không âm từ ô nhập; rỗng → undefined, không hợp lệ → NaN (để backend báo lỗi rõ ràng thay vì gửi sai). */
const intOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[.,\s]/g, "")));

function ProductForm({ product, categories, onClose, onSaved }: { product?: AdminProduct; categories: AdminCategory[]; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState<Form>(product ? toForm(product) : { ...EMPTY, categoryId: categories[0]?.id ?? "" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <FormModal title={product ? "Sửa sản phẩm" : "Thêm sản phẩm"} wide onClose={onClose}
      onSubmit={async () => {
        const body: Record<string, unknown> = {
          categoryId: f.categoryId, name: f.name.trim(), price: intOrUndef(f.price), isVisible: f.isVisible,
          sku: f.sku.trim() || undefined, unit: f.unit.trim() || undefined, description: f.description.trim() || undefined,
          originalPrice: intOrUndef(f.originalPrice), imageUrl: f.imageUrl.trim() || undefined,
        };
        if (!product) body.stockQuantity = intOrUndef(f.stockQuantity) ?? 0;
        // Sửa: để trống giá gốc nghĩa là bỏ giá gốc (gửi null); tạo mới thì bỏ qua trường.
        if (product && body.originalPrice === undefined) body.originalPrice = null;
        if (product) await adm(`/products/${product.id}`, { method: "PATCH", body });
        else await adm("/products", { method: "POST", body });
        notify(product ? "Đã lưu sản phẩm" : "Đã thêm sản phẩm");
        onSaved();
      }}>
      {(err) => (
        <>
          <div className="ad-grid2">
            <Field label="Tên sản phẩm *" error={err.name}><input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={200} autoFocus /></Field>
            <Field label="Danh mục *" error={err.categoryId}>
              <select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="" disabled>Chọn danh mục</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Giá bán (VND) *" error={err.price}><input value={f.price} onChange={(e) => set("price", e.target.value)} inputMode="numeric" /></Field>
            <Field label="Giá gốc (VND)" error={err.originalPrice} hint="Để trống nếu không giảm giá."><input value={f.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} inputMode="numeric" /></Field>
            <Field label="SKU" error={err.sku}><input value={f.sku} onChange={(e) => set("sku", e.target.value)} maxLength={50} /></Field>
            <Field label="Đơn vị" error={err.unit}><input value={f.unit} onChange={(e) => set("unit", e.target.value)} maxLength={50} placeholder="kg, gói, hộp..." /></Field>
            {!product && <Field label="Tồn kho ban đầu" error={err.stockQuantity}><input value={f.stockQuantity} onChange={(e) => set("stockQuantity", e.target.value)} inputMode="numeric" /></Field>}
            <Field label="Ảnh (đường dẫn)" error={err.imageUrl} hint="Dán link ảnh (http hoặc https). Hệ thống chưa hỗ trợ tải ảnh từ máy lên; hãy dùng link từ nơi lưu ảnh của bạn.">
              <input value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://..." />
            </Field>
            {/^https?:\/\//i.test(f.imageUrl.trim()) && <ImagePreview url={f.imageUrl.trim()} />}
          </div>
          <Field label="Mô tả" error={err.description}><textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} /></Field>
          <label className="ad-check"><input type="checkbox" checked={f.isVisible} onChange={(e) => set("isVisible", e.target.checked)} /> Hiển thị cho khách</label>
          {product && <p className="ad-muted">Tồn kho hiện tại: <b>{product.stockQuantity}</b>. Muốn đổi, dùng "Điều chỉnh kho" để có ghi chú trong sổ kho.</p>}
        </>
      )}
    </FormModal>
  );
}

function StockAdjustModal({ product, onClose, onSaved }: { product: AdminProduct; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  return (
    <FormModal title={`Điều chỉnh kho: ${product.name}`} onClose={onClose}
      onSubmit={async () => {
        await adm(`/products/${product.id}/stock-adjustments`, { method: "POST", body: { delta: Number(delta), note: note.trim() } });
        notify("Đã điều chỉnh tồn kho");
        onSaved();
      }}>
      {(err) => (
        <>
          <p>Tồn kho hiện tại: <b>{product.stockQuantity}</b></p>
          <Field label="Số lượng thay đổi *" error={err.delta} hint="Số dương để nhập thêm, số âm để trừ (vd -5). Không được làm tồn kho âm."><input value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="numeric" autoFocus /></Field>
          {delta !== "" && Number.isInteger(Number(delta)) && <p className="ad-info">Tồn kho sau điều chỉnh: <b>{product.stockQuantity + Number(delta)}</b></p>}
          <Field label="Lý do *" error={err.note}><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="Nhập hàng, kiểm kê, hàng hỏng..." /></Field>
        </>
      )}
    </FormModal>
  );
}

function MovementsModal({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const list = useList<StockMovement>(`/products/${product.id}/stock-movements`, { page, pageSize: 15, sort: "-createdAt" });
  return (
    <Modal title={`Sổ kho: ${product.name}`} wide onClose={onClose}>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Thời điểm</th><th>Lý do</th><th className="num">Thay đổi</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {list.data.items.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDateTime(m.createdAt)}</td>
                  <td>{STOCK_REASON_LABEL[m.reason] ?? m.reason}</td>
                  <td className="num"><b style={{ color: m.delta < 0 ? "#c0392b" : "#1d6a23" }}>{m.delta > 0 ? `+${m.delta}` : m.delta}</b></td>
                  <td>{m.note ?? (m.orderId ? "Theo đơn hàng" : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </Modal>
  );
}

export default function ProductsPage() {
  const { adm } = useAdmin();
  const fl = useListFilters({ q: "", categoryId: "", isVisible: "", lowStock: "" });
  const cats = useList<AdminCategory>("/categories", { pageSize: 100, sort: "sortOrder" });
  const categories = cats.data?.items ?? [];
  const list = useList<AdminProduct>("/products", {
    page: fl.page, pageSize: fl.pageSize, sort: fl.sort ?? "-createdAt", q: fl.applied.q,
    filters: { categoryId: fl.applied.categoryId, isVisible: fl.applied.isVisible, stockQuantity: fl.applied.lowStock ? { lte: fl.applied.lowStock } : undefined },
  });
  const act = useAction(list.reload);
  const [edit, setEdit] = useState<AdminProduct | "new" | null>(null);
  const [adjust, setAdjust] = useState<AdminProduct | null>(null);
  const [moves, setMoves] = useState<AdminProduct | null>(null);
  const [del, setDel] = useState<AdminProduct | null>(null);

  return (
    <>
      <div className="ad-head">
        <h1>Sản phẩm và tồn kho</h1>
        <button className="ad-btn primary" disabled={categories.length === 0} onClick={() => setEdit("new")}>+ Thêm sản phẩm</button>
      </div>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Tìm kiếm"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="Tên, SKU..." /></Field>
        <Field label="Danh mục">
          <select value={fl.filters.categoryId} onChange={(e) => fl.applyNow({ categoryId: e.target.value })}>
            <option value="">Tất cả</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Hiển thị">
          <select value={fl.filters.isVisible} onChange={(e) => fl.applyNow({ isVisible: e.target.value })}>
            <option value="">Tất cả</option><option value="true">Đang hiện</option><option value="false">Đang ẩn</option>
          </select>
        </Field>
        <Field label="Tồn kho tối đa"><input value={fl.filters.lowStock} onChange={(e) => fl.setField("lowStock", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Hàng sắp hết, vd 10" title="Chỉ hiện sản phẩm có tồn kho không quá số này" /></Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th></th><SortHeader label="Sản phẩm" field="name" sort={fl.sort} onSort={fl.toggleSort} /><th>Danh mục</th>
                <SortHeader label="Giá" field="price" sort={fl.sort} onSort={fl.toggleSort} /><SortHeader label="Tồn kho" field="stockQuantity" sort={fl.sort} onSort={fl.toggleSort} /><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((p) => (
                <tr key={p.id}>
                  <td>{p.imageUrl ? <img className="ad-thumb" src={p.imageUrl} alt="" /> : <div className="ad-thumb" />}</td>
                  <td><b>{p.name}</b><div className="ad-muted">{p.sku ?? "—"} · {p.unit ?? "—"}</div></td>
                  <td>{p.category?.name ?? "—"}</td>
                  <td>{formatVnd(p.price)}{p.originalPrice ? <div className="ad-muted"><s>{formatVnd(p.originalPrice)}</s> −{p.discountPercent}%</div> : null}</td>
                  <td><Badge tone={p.stockQuantity === 0 ? "red" : p.stockQuantity <= 10 ? "amber" : "green"}>{p.stockQuantity}</Badge></td>
                  <td>{p.isVisible ? <Badge tone="green">Đang hiện</Badge> : <Badge>Đang ẩn</Badge>}</td>
                  <td className="actions">
                    <div className="ad-row-actions">
                      <IconButton icon="edit" label="Sửa sản phẩm" onClick={() => setEdit(p)} />
                      <IconButton icon="stock" label="Điều chỉnh kho" onClick={() => setAdjust(p)} />
                      <IconButton icon="ledger" label="Sổ kho" onClick={() => setMoves(p)} />
                      <IconButton icon={p.isVisible ? "eyeOff" : "eye"} label={p.isVisible ? "Ẩn sản phẩm" : "Hiện sản phẩm"} disabled={act.busy} onClick={() => void act.run(() => adm(`/products/${p.id}`, { method: "PATCH", body: { isVisible: !p.isVisible } }), p.isVisible ? "Đã ẩn sản phẩm" : "Đã hiện sản phẩm")} />
                      <IconButton icon="trash" label="Xóa sản phẩm" tone="danger" onClick={() => setDel(p)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={fl.setPage} />

      {edit && <ProductForm product={edit === "new" ? undefined : edit} categories={categories} onClose={() => setEdit(null)} onSaved={list.reload} />}
      {adjust && <StockAdjustModal product={adjust} onClose={() => setAdjust(null)} onSaved={list.reload} />}
      {moves && <MovementsModal product={moves} onClose={() => setMoves(null)} />}
      {del && (
        <ConfirmModal title="Xóa sản phẩm" danger confirmLabel="Xóa" onClose={() => setDel(null)}
          message={<>Xóa <b>{del.name}</b>? Sản phẩm biến mất khỏi cửa hàng; đơn cũ vẫn giữ nguyên tên và giá lúc đặt. Nếu chỉ muốn tạm ngừng bán, hãy dùng "Ẩn".</>}
          onConfirm={async () => { await adm(`/products/${del.id}`, { method: "DELETE" }); list.reload(); }} />
      )}
    </>
  );
}
