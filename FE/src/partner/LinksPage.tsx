import { useState } from "react";
import { shareUrl, type PartnerLink } from "../lib/partner";
import { useAsync } from "../lib/useAsync";
import { useAdmin } from "../admin/AdminContext";
import { Badge, ErrorBox, Field, FormModal, Loading, fmtDate } from "../admin/ui";

const SUGGEST = [["facebook", "Facebook"], ["tiktok", "TikTok"], ["zalo", "Zalo"], ["youtube", "YouTube"]];

function LinkForm({ link, onClose, onSaved }: { link?: PartnerLink; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [channel, setChannel] = useState(link?.channelCode ?? "");
  const [label, setLabel] = useState(link?.label ?? "");
  return (
    <FormModal title={link ? "Sửa link" : "Tạo link theo kênh"} onClose={onClose}
      onSubmit={async () => {
        if (link) await adm(`/me/links/${link.id}`, { method: "PATCH", body: { label: label.trim() } });
        else await adm("/me/links", { method: "POST", body: { channelCode: channel.trim().toLowerCase(), label: label.trim() } });
        notify("Đã lưu link");
        onSaved();
      }}>
      {(err) => (
        <>
          {!link && (
            <Field label="Kênh *" error={err.channelCode} hint="Chữ thường, số, _ hoặc -. Mỗi kênh một link.">
              <input value={channel} onChange={(e) => setChannel(e.target.value)} maxLength={30} list="channel-suggest" autoFocus />
              <datalist id="channel-suggest">{SUGGEST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</datalist>
            </Field>
          )}
          <Field label="Tên gợi nhớ *" error={err.label}><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} placeholder="vd: Fanpage Facebook" /></Field>
        </>
      )}
    </FormModal>
  );
}

export default function LinksPage() {
  const { adm, notify } = useAdmin();
  const state = useAsync(async (signal) => (await adm<PartnerLink[]>("/me/links", { signal })).data, []);
  const [edit, setEdit] = useState<PartnerLink | "new" | null>(null);

  async function copy(l: PartnerLink) {
    const url = shareUrl(window.location.origin, l.path);
    try { await navigator.clipboard.writeText(url); notify("Đã sao chép link"); } catch { notify(url, "ok"); }
  }
  async function toggle(l: PartnerLink) {
    try { await adm(`/me/links/${l.id}`, { method: "PATCH", body: { isActive: !l.isActive } }); notify(l.isActive ? "Đã tắt link" : "Đã bật link"); state.reload(); } catch (e) { notify(e instanceof Error ? e.message : "Có lỗi xảy ra", "error"); }
  }

  const links = state.data ?? [];
  return (
    <>
      <div className="ad-head"><h1>Link giới thiệu</h1><button className="ad-btn primary" onClick={() => setEdit("new")}>+ Tạo link</button></div>
      <p className="ad-muted">Mỗi kênh một link để biết đơn đến từ đâu. Khách bấm link rồi đặt hàng trong thời hạn lưu mã thì đơn được tính hoa hồng cho bạn.</p>
      <ErrorBox error={state.error} onRetry={state.reload} />
      <Loading loading={state.loading && !state.data} empty={!state.loading && !state.error && links.length === 0} />
      {links.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Kênh</th><th>Link chia sẻ</th><th>Trạng thái</th><th>Tạo</th><th></th></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.channelCode}</b><div className="ad-muted">{l.label}</div></td>
                  <td style={{ wordBreak: "break-all" }}>{shareUrl(window.location.origin, l.path)}</td>
                  <td>{l.isActive ? <Badge tone="green">Đang bật</Badge> : <Badge>Đã tắt</Badge>}</td>
                  <td>{fmtDate(l.createdAt)}</td>
                  <td className="actions"><div className="ad-row-actions"><button className="ad-btn small primary" onClick={() => void copy(l)}>Sao chép</button><button className="ad-btn small" onClick={() => setEdit(l)}>Sửa</button><button className="ad-btn small" onClick={() => void toggle(l)}>{l.isActive ? "Tắt" : "Bật"}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <LinkForm link={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSaved={state.reload} />}
    </>
  );
}
