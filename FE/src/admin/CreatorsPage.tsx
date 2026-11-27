import { useState } from "react";
import { CREATOR_KIND_OPTIONS, type AdminCreator, type CreatorKind } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { ImageField } from "./ImageField";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, Pager, useAction, useList } from "./ui";

function CreatorForm({ creator, onClose, onSaved }: { creator?: AdminCreator; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState({
    name: creator?.name ?? "", kind: (creator?.kind ?? "KOC") as CreatorKind, headline: creator?.headline ?? "", imageUrl: creator?.imageUrl ?? "",
    linkUrl: creator?.linkUrl ?? "", sortOrder: String(creator?.sortOrder ?? 0), isActive: creator?.isActive ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <FormModal title={creator ? "Sửa KOL/KOC" : "Thêm KOL/KOC"} wide onClose={onClose}
      onSubmit={async () => {
        const body = {
          name: f.name.trim(), kind: f.kind, headline: f.headline.trim() || null, imageUrl: f.imageUrl.trim(),
          linkUrl: f.linkUrl.trim() || null, sortOrder: Number(f.sortOrder || 0), isActive: f.isActive,
        };
        if (creator) await adm(`/creators/${creator.id}`, { method: "PATCH", body });
        else await adm("/creators", { method: "POST", body });
        notify("Đã lưu");
        onSaved();
      }}>
      {(err) => (
        <>
          <div className="ad-grid2 ad-form-balanced">
            <Field label="Tên hiển thị *" error={err.name}><input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={60} autoFocus /></Field>
            <Field label="Loại *" error={err.kind}>
              <select value={f.kind} onChange={(e) => set("kind", e.target.value as CreatorKind)}>
                {(Object.keys(CREATOR_KIND_OPTIONS) as CreatorKind[]).map((k) => <option key={k} value={k}>{CREATOR_KIND_OPTIONS[k]}</option>)}
              </select>
            </Field>
            <Field label="Câu giới thiệu / cảm nhận" error={err.headline}><input value={f.headline} onChange={(e) => set("headline", e.target.value)} maxLength={160} placeholder="Ngắn gọn, tối đa 160 ký tự" /></Field>
            <Field label="Thứ tự (nhỏ hiện trước)" error={err.sortOrder}><input value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} inputMode="numeric" /></Field>
            <Field label="Bấm vào đi đâu" error={err.linkUrl}><input value={f.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="Link video (phát ngay trên trang), trang cá nhân hoặc /san-pham/..." maxLength={300} /></Field>
          </div>
          <ImageField label="Ảnh chân dung *" value={f.imageUrl} onChange={(v) => set("imageUrl", v)} error={err.imageUrl} maxSide={1200} aspect="3:4" hint="Nên dùng ảnh dọc tỷ lệ 3:4 (vd 600×800), gương mặt ở giữa. Ảnh khác tỷ lệ sẽ bị cắt cho vừa thẻ." />
          <label className="ad-check"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang bật (hiện ở trang chủ)</label>
        </>
      )}
    </FormModal>
  );
}

/** Quản lý mục KOL & KOC ở trang chủ: hàng thẻ chân dung dọc (tối đa 12 thẻ hiện cho khách, 6 thẻ mỗi hàng trên màn rộng). */
export default function CreatorsPage() {
  const { adm } = useAdmin();
  const [page, setPage] = useState(1);
  const list = useList<AdminCreator>("/creators", { page, pageSize: 20, sort: "sortOrder" });
  const [edit, setEdit] = useState<AdminCreator | "new" | null>(null);
  const [del, setDel] = useState<AdminCreator | null>(null);
  const act = useAction(list.reload);
  const items = list.data?.items ?? [];

  return (
    <>
      <div className="ad-head">
        <h1>KOL / KOC</h1>
        <button className="ad-btn primary" onClick={() => setEdit("new")}>+ Thêm KOL/KOC</button>
      </div>
      <p className="ad-muted">KOL là người có tầm ảnh hưởng, KOC là khách hàng thật chia sẻ trải nghiệm. Mỗi người là một thẻ chân dung ở trang chủ; bấm vào thẻ sẽ tới link đã cài. Chưa có thẻ nào đang bật thì mục này ẩn khỏi trang chủ.</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && items.length === 0} />
      {items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th></th><th>Tên</th><th>Loại</th><th>Giới thiệu</th><th>Đích bấm</th><th className="num">Thứ tự</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td><img className="ad-creator-thumb" src={c.imageUrl} alt="" /></td>
                  <td><b>{c.name}</b></td>
                  <td><Badge tone={c.kind === "KOL" ? "amber" : "blue"}>{c.kind}</Badge></td>
                  <td className="ad-muted">{c.headline ?? "—"}</td>
                  <td className="ad-muted">{c.linkUrl ?? "Chỉ để xem"}</td>
                  <td className="num">{c.sortOrder}</td>
                  <td>{c.isActive ? <Badge tone="green">Đang hiện</Badge> : <Badge>Đã tắt</Badge>}</td>
                  <td className="actions">
                    <div className="ad-row-actions">
                      <IconButton icon="edit" label="Sửa" onClick={() => setEdit(c)} />
                      <IconButton icon={c.isActive ? "eyeOff" : "eye"} label={c.isActive ? "Tắt" : "Bật"} disabled={act.busy} onClick={() => void act.run(() => adm(`/creators/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } }), c.isActive ? "Đã tắt" : "Đã bật")} />
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
      {edit && <CreatorForm creator={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSaved={list.reload} />}
      {del && (
        <ConfirmModal title={`Xóa: ${del.name}`} danger confirmLabel="Xóa" onClose={() => setDel(null)}
          message="Thẻ bị xóa hẳn khỏi trang chủ. Nếu chỉ muốn tạm ẩn, hãy dùng nút Tắt."
          onConfirm={async () => { await adm(`/creators/${del.id}`, { method: "DELETE" }); list.reload(); }} />
      )}
    </>
  );
}
