import { useState } from "react";
import { resolveVideo, videoThumb } from "../lib/video";
import type { AdminVideo } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { ImageField } from "./ImageField";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, Pager, useAction, useList } from "./ui";

function VideoForm({ video, onClose, onSaved }: { video?: AdminVideo; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState({ title: video?.title ?? "", videoUrl: video?.videoUrl ?? "", thumbnailUrl: video?.thumbnailUrl ?? "", sortOrder: String(video?.sortOrder ?? 0), isActive: video?.isActive ?? true });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const src = resolveVideo(f.videoUrl);
  const thumb = videoThumb(f.videoUrl, f.thumbnailUrl.trim());
  return (
    <FormModal title={video ? "Sửa video" : "Thêm video"} wide onClose={onClose}
      onSubmit={async () => {
        const body = { title: f.title.trim(), videoUrl: f.videoUrl.trim(), thumbnailUrl: f.thumbnailUrl.trim() || null, sortOrder: Number(f.sortOrder || 0), isActive: f.isActive };
        if (video) await adm(`/videos/${video.id}`, { method: "PATCH", body });
        else await adm("/videos", { method: "POST", body });
        notify("Đã lưu");
        onSaved();
      }}>
      {(err) => (
        <>
          <div className="ad-grid2 ad-form-balanced">
            <Field label="Tiêu đề *" error={err.title}><input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={100} autoFocus /></Field>
            <Field label="Thứ tự (nhỏ hiện trước)" error={err.sortOrder}><input value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} inputMode="numeric" /></Field>
          </div>
          <Field label="Link video *" error={err.videoUrl}>
            <input value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="Link YouTube, Vimeo, TikTok, Facebook hoặc tệp .mp4" maxLength={500} />
          </Field>
          <p className="ad-muted">
            {!f.videoUrl.trim() ? "Dán link video bất kỳ. YouTube, Vimeo, TikTok, Facebook và tệp .mp4/.webm phát ngay trên trang chủ."
              : !src ? "Link chưa hợp lệ (cần bắt đầu bằng http:// hoặc https://)."
              : src.kind === "link" ? "Link này không nhúng được: khách bấm sẽ mở ở tab mới."
              : src.kind === "file" ? "Tệp video: phát ngay trên trang chủ. Nên đặt thêm ảnh bìa bên dưới."
              : `Nhận ra ${src.provider === "youtube" ? "YouTube" : src.provider === "vimeo" ? "Vimeo" : src.provider === "tiktok" ? "TikTok" : "Facebook"}: phát ngay trên trang chủ.${src.provider === "youtube" ? "" : " Nên đặt thêm ảnh bìa bên dưới."}`}
          </p>
          <ImageField label="Ảnh bìa (tùy chọn)" value={f.thumbnailUrl} onChange={(v) => set("thumbnailUrl", v)} error={err.thumbnailUrl} maxSide={1280} aspect="16:9" hint="YouTube tự có ảnh bìa; video khác nên có ảnh bìa tỷ lệ 16:9." />
          {!f.thumbnailUrl.trim() && thumb && <img className="ad-video-preview" src={thumb} alt="Ảnh bìa video" />}
          <label className="ad-check"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang bật (hiện ở trang chủ)</label>
        </>
      )}
    </FormModal>
  );
}

/** Quản lý khung video ở trang chủ (link video bất kỳ, tối đa 6 video hiện cho khách). */
export default function VideosPage() {
  const { adm } = useAdmin();
  const [page, setPage] = useState(1);
  const list = useList<AdminVideo>("/videos", { page, pageSize: 20, sort: "sortOrder" });
  const [edit, setEdit] = useState<AdminVideo | "new" | null>(null);
  const [del, setDel] = useState<AdminVideo | null>(null);
  const act = useAction(list.reload);
  const items = list.data?.items ?? [];

  return (
    <>
      <div className="ad-head">
        <h1>Video trang chủ</h1>
        <button className="ad-btn primary" onClick={() => setEdit("new")}>+ Thêm video</button>
      </div>
      <p className="ad-muted">Dán link video (YouTube, Vimeo, TikTok, Facebook hoặc tệp .mp4); khách bấm vào ảnh bìa để xem ngay trên trang chủ. Video đầu tiên (thứ tự nhỏ nhất) hiện lớn, các video còn lại là hàng ảnh nhỏ để đổi. Chưa có video nào đang bật thì mục này ẩn khỏi trang chủ.</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && items.length === 0} />
      {items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th></th><th>Tiêu đề</th><th>Link</th><th className="num">Thứ tự</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {items.map((v) => {
                const t = videoThumb(v.videoUrl, v.thumbnailUrl);
                return (
                  <tr key={v.id}>
                    <td>{t && <img className="ad-video-thumb" src={t} alt="" />}</td>
                    <td><b>{v.title}</b></td>
                    <td className="ad-muted">{v.videoUrl}</td>
                    <td className="num">{v.sortOrder}</td>
                    <td>{v.isActive ? <Badge tone="green">Đang hiện</Badge> : <Badge>Đã tắt</Badge>}</td>
                    <td className="actions">
                      <div className="ad-row-actions">
                        <IconButton icon="edit" label="Sửa" onClick={() => setEdit(v)} />
                        <IconButton icon={v.isActive ? "eyeOff" : "eye"} label={v.isActive ? "Tắt" : "Bật"} disabled={act.busy} onClick={() => void act.run(() => adm(`/videos/${v.id}`, { method: "PATCH", body: { isActive: !v.isActive } }), v.isActive ? "Đã tắt" : "Đã bật")} />
                        <IconButton icon="trash" label="Xóa" tone="danger" onClick={() => setDel(v)} />
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
      {edit && <VideoForm video={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSaved={list.reload} />}
      {del && (
        <ConfirmModal title={`Xóa: ${del.title}`} danger confirmLabel="Xóa" onClose={() => setDel(null)}
          message="Video bị xóa hẳn khỏi trang chủ. Nếu chỉ muốn tạm ẩn, hãy dùng nút Tắt."
          onConfirm={async () => { await adm(`/videos/${del.id}`, { method: "DELETE" }); list.reload(); }} />
      )}
    </>
  );
}
