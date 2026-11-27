import { useState } from "react";
import { formatVnd } from "../lib/money";
import { dayEnd, dayStart } from "../lib/admin/query";
import { COMMISSION_STATUS_LABEL, type AdminCommission } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { useAffiliateNames } from "./AffiliatesPage";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FilterBar, Loading, Pager, SortHeader, fmtBps, fmtDateTime, useAction, useList, useListFilters } from "./ui";

const tone = (s: string) => (s === "PAID" ? "green" : s === "CONFIRMED" ? "blue" : s === "CANCELLED" ? "red" : "amber") as "green" | "blue" | "red" | "amber";

export default function CommissionsPage() {
  const { adm } = useAdmin();
  const names = useAffiliateNames();
  const fl = useListFilters({ q: "", status: "", affiliateId: "", from: "", to: "" });
  const a = fl.applied;
  const list = useList<AdminCommission>("/commissions", {
    page: fl.page, pageSize: fl.pageSize, sort: fl.sort ?? "-createdAt", q: a.q,
    filters: { status: a.status, affiliateId: a.affiliateId, createdAt: { gte: dayStart(a.from), lte: dayEnd(a.to) } },
  });
  const act = useAction(list.reload);
  const [confirm, setConfirm] = useState<AdminCommission | null>(null);

  return (
    <>
      <div className="ad-head"><h1>Hoa hồng</h1></div>
      <p className="ad-muted">Hoa hồng tạm tính tự chuyển sang "Đã xác nhận" sau thời gian giữ; admin có thể xác nhận sớm. Chi trả theo đợt ở mục "Đợt chi trả".</p>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Mã đơn"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="PV-..." /></Field>
        <Field label="Trạng thái">
          <select value={fl.filters.status} onChange={(e) => fl.applyNow({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(COMMISSION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Cộng tác viên">
          <select value={fl.filters.affiliateId} onChange={(e) => fl.applyNow({ affiliateId: e.target.value })}>
            <option value="">Tất cả</option>
            {names.items.map((x) => <option key={x.id} value={x.id}>{x.fullName} ({x.referralCode})</option>)}
          </select>
        </Field>
        <Field label="Từ ngày"><input type="date" value={fl.filters.from} onChange={(e) => fl.setField("from", e.target.value)} /></Field>
        <Field label="Đến ngày"><input type="date" value={fl.filters.to} onChange={(e) => fl.setField("to", e.target.value)} /></Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><SortHeader label="Mã đơn" field="orderCode" sort={fl.sort} onSort={fl.toggleSort} /><th>CTV</th><th className="num">Giá trị tính</th><th className="num">Tỷ lệ</th><SortHeader label="Hoa hồng" field="amount" sort={fl.sort} onSort={fl.toggleSort} /><th>Trạng thái</th><SortHeader label="Tạo lúc" field="createdAt" sort={fl.sort} onSort={fl.toggleSort} /><th></th></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.orderCode}</b>{c.channelCode && <div className="ad-muted">kênh {c.channelCode}</div>}</td>
                  <td>{names.nameOf(c.affiliateId)}</td>
                  <td className="num">{formatVnd(c.baseAmount)}</td>
                  <td className="num">{fmtBps(c.rateBps)}</td>
                  <td className="num"><b>{formatVnd(c.amount)}</b></td>
                  <td><Badge tone={tone(c.status)}>{COMMISSION_STATUS_LABEL[c.status] ?? c.status}</Badge>{c.adjustment && <div><Badge tone="red">Khoản trừ {formatVnd(c.adjustment.amount)}</Badge></div>}{c.cancelReason && <div className="ad-muted">{c.cancelReason}</div>}</td>
                  <td>{fmtDateTime(c.createdAt)}</td>
                  <td className="actions">{c.status === "ESTIMATED" && <div className="ad-row-actions"><IconButton icon="check" label="Xác nhận hoa hồng" tone="primary" disabled={act.busy} onClick={() => setConfirm(c)} /></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={fl.setPage} />
      {confirm && (
        <ConfirmModal title="Xác nhận hoa hồng" confirmLabel="Xác nhận" onClose={() => setConfirm(null)}
          message={<>Xác nhận sớm hoa hồng <b>{formatVnd(confirm.amount)}</b> của đơn <b>{confirm.orderCode}</b> để đưa vào đợt chi trả?</>}
          onConfirm={async () => { await adm(`/commissions/${confirm.id}/confirm`, { method: "PATCH" }); list.reload(); }} />
      )}
    </>
  );
}
