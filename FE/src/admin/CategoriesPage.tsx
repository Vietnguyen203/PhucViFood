import { useState } from "react";
import type { AdminCategory } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, Pager, useAction, useList } from "./ui";

function CategoryForm({ category, onClose, onSaved }: { category?: AdminCategory; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  return (
    <FormModal title={category ? "Sửa danh mục" : "Thêm danh mục"} onClose={onClose}
      onSubmit={async () => {
        const body = { name: name.trim(), slug: slug.trim() || undefined, sortOrder: Number(sortOrder || 0), isActive };
        if (category) await adm(`/categories/${category.id}`, { method: "PATCH", body });
        else await adm("/categories", { method: "POST", body });
        notify("Đã lưu danh mục");
        onSaved();
      }}>
      {(err) => (
        <>
          <Field label="Tên danh mục *" error={err.name}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus /></Field>
          <Field label="Đường dẫn (slug)" error={err.slug} hint="Để trống để tự sinh từ tên."><input value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
          <Field label="Thứ tự hiển thị" error={err.sortOrder} hint="Số nhỏ hiện trước."><input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" /></Field>
          <label className="ad-check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Đang hoạt động (hiện trên cửa hàng)</label>
        </>
      )}
    </FormModal>
  );
}

export default function CategoriesPage() {
  const { adm } = useAdmin();
  const [page, setPage] = useState(1);
  const list = useList<AdminCategory>("/categories", { page, pageSize: 20, sort: "sortOrder" });
  const act = useAction(list.reload);
  const [edit, setEdit] = useState<AdminCategory | "new" | null>(null);
  const [del, setDel] = useState<AdminCategory | null>(null);

  return (
    <>
      <div className="ad-head"><h1>Danh mục</h1><button className="ad-btn primary" onClick={() => setEdit("new")}>+ Thêm danh mục</button></div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Tên</th><th>Slug</th><th className="num">Thứ tự</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td><td className="ad-muted">{c.slug}</td><td className="num">{c.sortOrder}</td>
                  <td>{c.isActive ? <Badge tone="green">Hoạt động</Badge> : <Badge>Đã ẩn</Badge>}</td>
                  <td className="actions">
                    <div className="ad-row-actions">
                      <button className="ad-btn small" onClick={() => setEdit(c)}>Sửa</button>
                      <button className="ad-btn small" disabled={act.busy} onClick={() => void act.run(() => adm(`/categories/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } }), c.isActive ? "Đã ẩn danh mục" : "Đã hiện danh mục")}>{c.isActive ? "Ẩn" : "Hiện"}</button>
                      <button className="ad-btn small danger" onClick={() => setDel(c)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      {edit && <CategoryForm category={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSaved={list.reload} />}
      {del && (
        <ConfirmModal title="Xóa danh mục" danger confirmLabel="Xóa" onClose={() => setDel(null)}
          message={<>Xóa danh mục <b>{del.name}</b>? Danh mục còn sản phẩm sẽ không xóa được.</>}
          onConfirm={async () => { await adm(`/categories/${del.id}`, { method: "DELETE" }); list.reload(); }} />
      )}
    </>
  );
}
