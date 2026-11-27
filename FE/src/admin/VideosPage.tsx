import { useState } from "react";
import { youtubeId, youtubeThumb } from "../lib/video";
import type { AdminVideo } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, Pager, useAction, useList } from "./ui";

function VideoForm({ video, onClose, onSaved }: { video?: AdminVideo; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState({ title: video?.title ?? "", videoUrl: video?.videoUrl ?? "", sortOrder: String(video?.sortOrder ?? 0), isActive: video?.isActive ?? true });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const id = youtubeId(f.videoUrl);
  return (
    <FormModal title={video ? "Sửa video" : "Thêm video"} wide onClose={onClose}
      onSubmit={async () => {
        const body = { title: f.title.trim(), videoUrl: f.videoUrl.trim(), sortOrder: Number(f.sortOrder || 0), isActive: f.isActive };
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
          <Field label="Link YouTube *" error={err.videoUrl}>
            <input value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/..." maxLength={300} />
          </Field>
          {id ? <img className="ad-video-preview" src={youtubeThumb(id)} alt="Ảnh bìa video" /> : f.videoUrl.trim() && <p className="ad-muted">Chưa nhận ra link YouTube này.</p>}
          <label className="ad-check"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang bật (hiện ở trang chủ)</label>
        </>
      )}
    </FormModal>
  );
}

/** Quản lý khung video ở trang chủ (link YouTube, tối đa 6 video hiện cho khách). */
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
      <p className="ad-muted">Dán link YouTube; khách bấm vào ảnh bìa để xem ngay trên trang chủ. Video đầu tiên (thứ tự nhỏ nhất) hiện lớn, các video còn lại là hàng ảnh nhỏ để đổi. Chưa có video nào đang bật thì mục này ẩn khỏi trang chủ.</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && items.length === 0} />
      {items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th></th><th>Tiêu đề</th><th>Link</th><th className="num">Thứ tự</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {items.map((v) => {
                const id = youtubeId(v.videoUrl);
                return (
                  <tr key={v.id}>
                    <td>{id && <img className="ad-video-thumb" src={youtubeThumb(id)} alt="" />}</td>
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
