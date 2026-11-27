import { useState } from "react";
import { formatVnd } from "../lib/money";
import { useAsync } from "../lib/useAsync";
import type { CustomerSetting, ExportLog } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { IconButton } from "./icons";
import { ErrorBox, Field, FormModal, Loading, Pager, fmtDateTime, useList } from "./ui";

const LABELS: Record<string, { label: string; money?: boolean }> = {
  "segment.returning_min_orders": { label: "Khách quay lại: số đơn tối thiểu" },
  "segment.vip_min_orders": { label: "VIP: số đơn tối thiểu" },
  "segment.vip_min_spend": { label: "VIP: tổng chi tiêu tối thiểu", money: true },
  "activity.active_days": { label: "Đang hoạt động: mua trong vòng (ngày)" },
  "activity.at_risk_days": { label: "Có nguy cơ rời bỏ: quá (ngày)" },
};

function EditSetting({ s, onClose, onSaved }: { s: CustomerSetting; onClose: () => void; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [value, setValue] = useState(String(s.value));
  const meta = LABELS[s.key];
  return (
    <FormModal title={meta?.label ?? s.key} onClose={onClose}
      onSubmit={async () => { await adm(`/customer-settings/${encodeURIComponent(s.key)}`, { method: "PATCH", body: { value: Number(value) } }); notify("Đã lưu cài đặt"); onSaved(); }}>
      {(err) => (
        <>
          {s.description && <p className="ad-muted">{s.description}</p>}
          <Field label="Giá trị" error={err.value} hint="Ngưỡng mới áp dụng ngay cho phân loại khách (tính lúc xem, không lưu)."><input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" autoFocus /></Field>
        </>
      )}
    </FormModal>
  );
}

export default function SettingsPage() {
  const { adm } = useAdmin();
  const settings = useAsync(async (signal) => (await adm<CustomerSetting[]>("/customer-settings", { signal })).data, []);
  const [page, setPage] = useState(1);
  const logs = useList<ExportLog>("/customers/export-logs", { page, pageSize: 15, sort: "-createdAt" });
  const [edit, setEdit] = useState<CustomerSetting | null>(null);

  return (
    <>
      <div className="ad-head"><h1>Cài đặt và nhật ký xuất</h1></div>
      <h2>Ngưỡng phân loại khách hàng</h2>
      <ErrorBox error={settings.error} onRetry={settings.reload} />
      <Loading loading={settings.loading && !settings.data} />
      {settings.data && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Ngưỡng</th><th className="num">Giá trị</th><th>Cập nhật</th><th></th></tr></thead>
            <tbody>
              {settings.data.map((s) => (
                <tr key={s.key}>
                  <td><b>{LABELS[s.key]?.label ?? s.key}</b>{s.description && <div className="ad-muted">{s.description}</div>}</td>
                  <td className="num">{LABELS[s.key]?.money ? formatVnd(s.value) : s.value}</td>
                  <td>{fmtDateTime(s.updatedAt)}</td>
                  <td className="actions"><div className="ad-row-actions"><IconButton icon="edit" label="Sửa" onClick={() => setEdit(s)} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Nhật ký xuất dữ liệu khách hàng</h2>
      <ErrorBox error={logs.error} onRetry={logs.reload} />
      <Loading loading={logs.loading && !logs.data} empty={!logs.loading && !logs.error && logs.data?.items.length === 0} />
      {logs.data && logs.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Thời điểm</th><th className="num">Số dòng</th><th>Bộ lọc</th><th>Định dạng</th></tr></thead>
            <tbody>
              {logs.data.items.map((l) => (
                <tr key={l.id}><td>{fmtDateTime(l.createdAt)}</td><td className="num">{l.rowCount}</td><td className="ad-muted">{Object.keys(l.filters ?? {}).length ? JSON.stringify(l.filters) : "Không lọc"}</td><td>{l.format}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={logs.data?.meta} onPage={setPage} />
      {edit && <EditSetting s={edit} onClose={() => setEdit(null)} onSaved={settings.reload} />}
    </>
  );
}
