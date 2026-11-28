import { useState } from "react";
import { BANNER_SLOT_LABEL, type AdminBanner, type BannerSlot } from "../lib/admin/types";
import { BANNER_STATE_LABEL, bannerState, fromLocalInput, toLocalInput, type BannerState } from "../lib/admin/banner";
import { useAdmin } from "./AdminContext";
import { ImageField } from "./ImageField";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, Pager, fmtDateTime, useAction, useList } from "./ui";

const TONE: Record<BannerState, "green" | "gray" | "amber" | "red"> = { LIVE: "green", OFF: "gray", UPCOMING: "amber", EXPIRED: "red" };
const SLOT_HINT: Record<BannerSlot, string> = {
  MAIN: "Khung lớn: nên dùng ảnh ngang tỷ lệ khoảng 2:1 (vd 1600×800). Nhiều ảnh sẽ tự trượt.",
  SIDE: "Ô khuyến mãi bên phải: nên dùng ảnh tỷ lệ khoảng 3:2 (vd 800×530). Trang chủ hiện tối đa 2 ô.",
};
const LINK_EXAMPLES: Array<[string, string]> = [["Khu sản phẩm", "/#best-sellers"], ["Giỏ hàng", "/cart"], ["Tin tức", "/news"], ["Chương trình CTV", "/affiliate"]];

function BannerForm({ banner, onClose, onSaved }: { banner?: AdminBanner; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState({
    title: banner?.title ?? "", imageUrl: banner?.imageUrl ?? "", linkUrl: banner?.linkUrl ?? "", slot: (banner?.slot ?? "MAIN") as BannerSlot,
    sortOrder: String(banner?.sortOrder ?? 0), isActive: banner?.isActive ?? true, startsAt: toLocalInput(banner?.startsAt ?? null), endsAt: toLocalInput(banner?.endsAt ?? null),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <FormModal title={banner ? "Sửa banner" : "Thêm banner"} wide onClose={onClose}
      onSubmit={async () => {
        const body = {
          title: f.title.trim(), imageUrl: f.imageUrl.trim(), slot: f.slot, sortOrder: Number(f.sortOrder || 0), isActive: f.isActive,
          linkUrl: f.linkUrl.trim() || null, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt),
        };
        if (banner) await adm(`/banners/${banner.id}`, { method: "PATCH", body });
        else await adm("/banners", { method: "POST", body });
        notify("Đã lưu banner");
        onSaved();
      }}>
      {(err) => (
        <>
          <div className="ad-grid2 ad-form-balanced">
            <Field label="Tên gợi nhớ *" error={err.title}><input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={100} autoFocus placeholder="Dùng làm mô tả ảnh" /></Field>
            <Field label="Vị trí *" error={err.slot}>
              <select value={f.slot} onChange={(e) => set("slot", e.target.value as BannerSlot)}>
                {(Object.keys(BANNER_SLOT_LABEL) as BannerSlot[]).map((k) => <option key={k} value={k}>{BANNER_SLOT_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Bấm vào đi đâu" error={err.linkUrl}><input value={f.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="/products/ten-san-pham hoặc https://..." maxLength={300} /></Field>
            <Field label="Thứ tự (nhỏ hiện trước)" error={err.sortOrder}><input value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} inputMode="numeric" /></Field>
            <Field label="Bắt đầu hiển thị" error={err.startsAt}><input type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field>
            <Field label="Ngừng hiển thị" error={err.endsAt}><input type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></Field>
          </div>
          <p className="ad-muted" style={{ marginTop: 0 }}>
            Gợi ý đích bấm: {LINK_EXAMPLES.map(([label, link], i) => <span key={link}>{i > 0 && " · "}<button type="button" className="ad-link" onClick={() => set("linkUrl", link)}>{label}</button></span>)}. Trang sản phẩm: <code>/products/</code> kèm đường dẫn của sản phẩm; để trống thì banner chỉ là ảnh. Ô ngày giờ để trống nghĩa là không giới hạn.
          </p>
          <ImageField label="Ảnh banner *" value={f.imageUrl} onChange={(v) => set("imageUrl", v)} error={err.imageUrl} maxSide={2000} hint={SLOT_HINT[f.slot]} />
          <label className="ad-check"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang bật</label>
        </>
      )}
    </FormModal>
  );
}

/** Quản lý banner trang chủ: khung lớn bên trái và các ô khuyến mãi bên phải. Chỉ hiện ảnh; khách bấm vào thì tới trang đích. */
export default function BannersPage() {
  const { adm } = useAdmin();
  const [page, setPage] = useState(1);
  const list = useList<AdminBanner>("/banners", { page, pageSize: 20, sort: "sortOrder" });
  const [edit, setEdit] = useState<AdminBanner | "new" | null>(null);
  const [del, setDel] = useState<AdminBanner | null>(null);
  const act = useAction(list.reload);
  const items = list.data?.items ?? [];

  return (
    <>
      <div className="ad-head">
        <h1>Banner trang chủ</h1>
        <button className="ad-btn primary" onClick={() => setEdit("new")}>+ Thêm banner</button>
      </div>
      <p className="ad-muted">Banner chỉ hiện ảnh. Khung lớn bên trái trượt nhiều ảnh; các ô bên phải dành cho chương trình khuyến mãi (tối đa 2 ô). Chưa có banner nào thì trang chủ dùng ảnh mặc định.</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && items.length === 0} />
      {items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th></th><th>Tên</th><th>Vị trí</th><th>Đích bấm</th><th className="num">Thứ tự</th><th>Lịch</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {items.map((b) => {
                const state = bannerState(b);
                return (
                  <tr key={b.id}>
                    <td><img className="ad-banner-thumb" src={b.imageUrl} alt="" /></td>
                    <td><b>{b.title}</b></td>
                    <td>{b.slot === "MAIN" ? "Khung lớn" : "Ô bên phải"}</td>
                    <td className="ad-muted">{b.linkUrl ?? "Chỉ là ảnh"}</td>
                    <td className="num">{b.sortOrder}</td>
                    <td className="ad-muted">{b.startsAt || b.endsAt ? `${b.startsAt ? fmtDateTime(b.startsAt) : "…"} → ${b.endsAt ? fmtDateTime(b.endsAt) : "…"}` : "Không giới hạn"}</td>
                    <td><Badge tone={TONE[state]}>{BANNER_STATE_LABEL[state]}</Badge></td>
                    <td className="actions">
                      <div className="ad-row-actions">
                        <IconButton icon="edit" label="Sửa banner" onClick={() => setEdit(b)} />
                        <IconButton icon={b.isActive ? "eyeOff" : "eye"} label={b.isActive ? "Tắt banner" : "Bật banner"} disabled={act.busy} onClick={() => void act.run(() => adm(`/banners/${b.id}`, { method: "PATCH", body: { isActive: !b.isActive } }), b.isActive ? "Đã tắt banner" : "Đã bật banner")} />
                        <IconButton icon="trash" label="Xóa banner" tone="danger" onClick={() => setDel(b)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      {edit && <BannerForm banner={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSaved={list.reload} />}
      {del && (
        <ConfirmModal title={`Xóa banner: ${del.title}`} danger confirmLabel="Xóa" onClose={() => setDel(null)}
          message="Banner bị xóa hẳn khỏi trang chủ. Nếu chỉ muốn tạm ẩn, hãy dùng nút Tắt."
          onConfirm={async () => { await adm(`/banners/${del.id}`, { method: "DELETE" }); list.reload(); }} />
      )}
    </>
  );
}
