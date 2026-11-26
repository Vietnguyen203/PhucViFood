import { useState } from "react";
import { formatVnd } from "../lib/money";
import { ADJUSTMENT_STATUS_LABEL, type AdminAdjustment } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { useAffiliateNames } from "./AffiliatesPage";
import { Badge, ConfirmModal, ErrorBox, Field, FilterBar, Loading, Pager, fmtDateTime, useList, useListFilters } from "./ui";

const tone = (s: string) => (s === "PENDING" ? "amber" : s === "APPLIED" ? "gray" : "blue") as "amber" | "gray" | "blue";

export default function AdjustmentsPage() {
  const { adm } = useAdmin();
  const names = useAffiliateNames();
  const fl = useListFilters({ q: "", status: "", affiliateId: "" });
  const list = useList<AdminAdjustment>("/adjustments", { page: fl.page, pageSize: fl.pageSize, sort: "-createdAt", q: fl.applied.q, filters: { status: fl.applied.status, affiliateId: fl.applied.affiliateId } });
  const [waive, setWaive] = useState<AdminAdjustment | null>(null);

  return (
    <>
      <div className="ad-head"><h1>Khoản trừ hoa hồng</h1></div>
      <p className="ad-muted">Phát sinh khi đơn bị hoàn SAU KHI hoa hồng đã chi trả. Khoản trừ chờ sẽ tự trừ vào đợt chi kế tiếp; admin có thể miễn trừ.</p>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Mã đơn"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} /></Field>
        <Field label="Trạng thái">
          <select value={fl.filters.status} onChange={(e) => fl.applyNow({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(ADJUSTMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Cộng tác viên">
          <select value={fl.filters.affiliateId} onChange={(e) => fl.applyNow({ affiliateId: e.target.value })}>
            <option value="">Tất cả</option>
            {names.items.map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}
          </select>
        </Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Đơn</th><th>CTV</th><th className="num">Số tiền trừ</th><th>Lý do</th><th>Trạng thái</th><th>Tạo lúc</th><th></th></tr></thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.orderCode}</b></td><td>{names.nameOf(a.affiliateId)}</td><td className="num">{formatVnd(a.amount)}</td><td>{a.reason}</td>
                  <td><Badge tone={tone(a.status)}>{ADJUSTMENT_STATUS_LABEL[a.status]}</Badge>{a.waiveReason && <div className="ad-muted">{a.waiveReason}</div>}</td>
                  <td>{fmtDateTime(a.createdAt)}</td>
                  <td className="actions">{a.status === "PENDING" && <button className="ad-btn small" onClick={() => setWaive(a)}>Miễn trừ</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={fl.setPage} />
      {waive && (
        <ConfirmModal title="Miễn khoản trừ" confirmLabel="Miễn trừ" onClose={() => setWaive(null)}
          message={<>Miễn khoản trừ <b>{formatVnd(waive.amount)}</b> của đơn <b>{waive.orderCode}</b>? CTV sẽ không bị trừ khoản này nữa.</>}
          reason={{ label: "Lý do", required: true }}
          onConfirm={async (reason) => { await adm(`/adjustments/${waive.id}/waive`, { method: "POST", body: { reason } }); list.reload(); }} />
      )}
    </>
  );
}
