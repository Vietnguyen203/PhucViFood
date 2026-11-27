import { useState } from "react";
import { formatVnd } from "../lib/money";
import { useAsync } from "../lib/useAsync";
import { bankConfigured, SETTING_LABEL, type ShopSetting } from "../lib/admin/dashboard";
import { useAdmin } from "./AdminContext";
import { IconButton } from "./icons";
import { ErrorBox, Field, FormModal, Loading, fmtBps, fmtDateTime } from "./ui";

type Source = "order" | "affiliate";
type Row = ShopSetting & { source: Source };

const show = (s: Row): string => {
  if (s.value === null) return s.kind === "text" ? "Chưa cấu hình" : "Mặc định";
  const unit = SETTING_LABEL[s.key]?.unit;
  if (unit === "%" && typeof s.value === "number") return fmtBps(s.value);
  if (unit === "vnd" && typeof s.value === "number") return formatVnd(s.value);
  if (unit && typeof s.value === "number") return `${s.value} ${unit}`;
  return String(s.value);
};

function EditModal({ s, onClose, onSaved }: { s: Row; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const meta = SETTING_LABEL[s.key];
  const isText = s.kind === "text";
  const isPercent = meta?.unit === "%";
  const [value, setValue] = useState(s.value === null ? "" : String(isPercent ? Number(s.value) / 100 : s.value));
  return (
    <FormModal title={meta?.label ?? s.key} onClose={onClose}
      onSubmit={async () => {
        const body = { value: isText ? value : isPercent ? Math.round(Number(value.replace(",", ".")) * 100) : Number(value.replace(/[.,\s]/g, "")) };
        await adm(`/${s.source === "order" ? "order-settings" : "affiliate-settings"}/${encodeURIComponent(s.key)}`, { method: "PATCH", body });
        notify("Đã lưu cấu hình");
        onSaved();
      }}>
      {(err) => (
        <>
          {meta?.hint && <p className="ad-muted">{meta.hint}</p>}
          <Field label={`Giá trị${meta?.unit === "vnd" ? " (VND)" : meta?.unit ? ` (${meta.unit})` : ""}`} error={err.value}>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode={isText ? undefined : isPercent ? "decimal" : "numeric"} autoFocus />
          </Field>
        </>
      )}
    </FormModal>
  );
}

/** Cấu hình bán hàng (phí ship, giữ hàng, tài khoản nhận tiền) và chương trình CTV (hạn cookie). */
export default function ShopSettingsPage() {
  const { adm } = useAdmin();
  const state = useAsync(async (signal) => {
    const [o, a] = await Promise.all([adm<ShopSetting[]>("/order-settings", { signal }), adm<ShopSetting[]>("/affiliate-settings", { signal })]);
    return [...o.data.map((s) => ({ ...s, source: "order" as const })), ...a.data.map((s) => ({ ...s, source: "affiliate" as const }))] satisfies Row[];
  }, []);
  const [edit, setEdit] = useState<Row | null>(null);
  const rows = state.data ?? [];
  const group = (title: string, keys: (r: Row) => boolean) => {
    const list = rows.filter(keys);
    return list.length === 0 ? null : (
      <>
        <h2>{title}</h2>
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Cấu hình</th><th>Giá trị</th><th>Cập nhật</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.key}>
                  <td><b>{SETTING_LABEL[r.key]?.label ?? r.key}</b>{SETTING_LABEL[r.key]?.hint && <div className="ad-muted">{SETTING_LABEL[r.key].hint}</div>}</td>
                  <td>{r.value === null ? <span className="ad-muted">{show(r)}</span> : <b>{show(r)}</b>}</td>
                  <td>{fmtDateTime(r.updatedAt)}</td>
                  <td className="actions"><div className="ad-row-actions"><IconButton icon="edit" label="Sửa" onClick={() => setEdit(r)} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="ad-head"><h1>Cấu hình bán hàng</h1></div>
      <ErrorBox error={state.error} onRetry={state.reload} />
      <Loading loading={state.loading && !state.data} />
      {state.data && !bankConfigured(rows) && (
        <div className="ad-error" role="alert">Chưa cấu hình đủ tài khoản nhận tiền: khách chọn chuyển khoản sẽ không thấy hướng dẫn thanh toán. Điền đủ ngân hàng, số tài khoản và chủ tài khoản bên dưới.</div>
      )}
      {group("Giao hàng", (r) => r.key.startsWith("shipping."))}
      {group("Thanh toán chuyển khoản", (r) => r.key.startsWith("payment."))}
      {group("Chương trình cộng tác viên", (r) => r.source === "affiliate")}
      <p className="ad-muted">Thay đổi áp dụng cho đơn đặt sau đó; đơn đã đặt giữ phí ship và hạn thanh toán đã chốt. Ngưỡng phân loại khách hàng ở mục "Cài đặt và nhật ký xuất".</p>
      {edit && <EditModal s={edit} onClose={() => setEdit(null)} onSaved={state.reload} />}
    </>
  );
}
