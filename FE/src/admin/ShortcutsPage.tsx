import { useState } from "react";
import type { AdminShortcut } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { ImageField } from "./ImageField";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, Pager, useAction, useList } from "./ui";

function ShortcutForm({ shortcut, onClose, onSaved }: { shortcut?: AdminShortcut; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState({ title: shortcut?.title ?? "", imageUrl: shortcut?.imageUrl ?? "", linkUrl: shortcut?.linkUrl ?? "", sortOrder: String(shortcut?.sortOrder ?? 0), isActive: shortcut?.isActive ?? true });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <FormModal title={shortcut ? "Sửa ô tròn" : "Thêm ô tròn"} wide onClose={onClose}
      onSubmit={async () => {
        const body = { title: f.title.trim(), imageUrl: f.imageUrl.trim(), linkUrl: f.linkUrl.trim() || null, sortOrder: Number(f.sortOrder || 0), isActive: f.isActive };
        if (shortcut) await adm(`/shortcuts/${shortcut.id}`, { method: "PATCH", body });
        else await adm("/shortcuts", { method: "POST", body });
        notify("Đã lưu");
        onSaved();
      }}>
      {(err) => (
        <>
          <div className="ad-grid2 ad-form-balanced">
            <Field label="Tên hiển thị *" error={err.title}><input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={40} autoFocus placeholder="Ngắn gọn, vd Công thức, Mẹo vặt" /></Field>
            <Field label="Thứ tự (nhỏ hiện trước)" error={err.sortOrder}><input value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} inputMode="numeric" /></Field>
          </div>
          <Field label="Bấm vào đi đâu" error={err.linkUrl} hint="Đường dẫn trang trong cửa hàng (vd /tin-tuc, /danh-muc/kho-ca) hoặc link http(s) tới bài viết. Bỏ trống thì ô chỉ để xem.">
            <input value={f.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} maxLength={300} placeholder="/tin-tuc/ten-bai-viet" />
          </Field>
          <ImageField label="Ảnh biểu tượng *" value={f.imageUrl} onChange={(v) => set("imageUrl", v)} error={err.imageUrl} maxSide={400} aspect="1:1" hint="Hiện trong vòng tròn; dùng ảnh vuông, biểu tượng ở giữa." />
          <label className="ad-check"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang bật (hiện ở trang chủ)</label>
        </>
      )}
    </FormModal>
  );
}

/** Quản lý hàng ô tròn lối tắt dưới banner trang chủ (tối đa 10 ô hiện cho khách). */
export default function ShortcutsPage() {
  const { adm } = useAdmin();
  const [page, setPage] = useState(1);
  const list = useList<AdminShortcut>("/shortcuts", { page, pageSize: 20, sort: "sortOrder" });
  const [edit, setEdit] = useState<AdminShortcut | "new" | null>(null);
  const [del, setDel] = useState<AdminShortcut | null>(null);
  const act = useAction(list.reload);
  const items = list.data?.items ?? [];

  return (
    <>
      <div className="ad-head">
        <h1>Ô tròn trang chủ</h1>
        <button className="ad-btn primary" onClick={() => setEdit("new")}>+ Thêm ô tròn</button>
      </div>
      <p className="ad-muted">Hàng vòng tròn dưới banner trang chủ: mỗi ô là một ảnh biểu tượng kèm tên, bấm vào đi tới trang đích bạn đặt (ví dụ một bài viết). Chưa có ô nào đang bật thì cả hàng ẩn khỏi trang chủ.</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && items.length === 0} />
      {items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th></th><th>Tên</th><th>Đích bấm</th><th className="num">Thứ tự</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td><img className="ad-cat-thumb" src={c.imageUrl} alt="" /></td>
                  <td><b>{c.title}</b></td>
                  <td className="ad-muted">{c.linkUrl ?? "Chỉ để xem"}</td>
                  <td className="num">{c.sortOrder}</td>
                  <td>{c.isActive ? <Badge tone="green">Đang hiện</Badge> : <Badge>Đã tắt</Badge>}</td>
                  <td className="actions">
                    <div className="ad-row-actions">
                      <IconButton icon="edit" label="Sửa" onClick={() => setEdit(c)} />
                      <IconButton icon={c.isActive ? "eyeOff" : "eye"} label={c.isActive ? "Tắt" : "Bật"} disabled={act.busy} onClick={() => void act.run(() => adm(`/shortcuts/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } }), c.isActive ? "Đã tắt" : "Đã bật")} />
                      <IconButton icon="trash" label="Xóa" tone="danger" onClick={() => setDel(c)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      {edit && <ShortcutForm shortcut={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSaved={list.reload} />}
      {del && (
        <ConfirmModal title={`Xóa: ${del.title}`} danger confirmLabel="Xóa" onClose={() => setDel(null)}
          message="Ô bị xóa hẳn khỏi trang chủ. Nếu chỉ muốn tạm ẩn, hãy dùng nút Tắt."
          onConfirm={async () => { await adm(`/shortcuts/${del.id}`, { method: "DELETE" }); list.reload(); }} />
      )}
    </>
  );
}
