import { Link } from "react-router";
import { formatVnd } from "../lib/money";
import { dayEnd, dayStart } from "../lib/admin/query";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, type AdminOrder, type OrderStatus, type PaymentStatus } from "../lib/admin/types";
import { Badge, ErrorBox, Field, FilterBar, Loading, Pager, SortHeader, fmtDateTime, useList, useListFilters } from "./ui";

export const statusTone = (s: OrderStatus) => (s === "COMPLETED" || s === "DELIVERED" ? "green" : s === "CANCELLED" || s === "RETURNED" ? "red" : s === "PLACED" ? "amber" : "blue") as "green" | "red" | "amber" | "blue";
export const paymentTone = (s: PaymentStatus) => (s === "PAID" ? "green" : s === "REFUNDED" ? "gray" : s === "UNPAID" ? "amber" : "blue") as "green" | "gray" | "amber" | "blue";

export default function OrdersPage() {
  const fl = useListFilters({ q: "", status: "", paymentStatus: "", paymentMethod: "", from: "", to: "" });
  const a = fl.applied;
  const list = useList<AdminOrder>("/orders", {
    page: fl.page, pageSize: fl.pageSize, sort: fl.sort ?? "-placedAt", q: a.q,
    filters: { status: a.status, paymentStatus: a.paymentStatus, paymentMethod: a.paymentMethod, placedAt: { gte: dayStart(a.from), lte: dayEnd(a.to) } },
  });

  return (
    <>
      <div className="ad-head"><h1>Đơn hàng</h1></div>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Tìm kiếm"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="Mã đơn, tên, SĐT..." /></Field>
        <Field label="Trạng thái">
          <select value={fl.filters.status} onChange={(e) => fl.applyNow({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Thanh toán">
          <select value={fl.filters.paymentStatus} onChange={(e) => fl.applyNow({ paymentStatus: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Hình thức">
          <select value={fl.filters.paymentMethod} onChange={(e) => fl.applyNow({ paymentMethod: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
            <thead>
              <tr>
                <th>Mã đơn</th><SortHeader label="Đặt lúc" field="placedAt" sort={fl.sort} onSort={fl.toggleSort} /><th>Khách nhận</th>
                <SortHeader label="Tổng tiền" field="totalAmount" sort={fl.sort} onSort={fl.toggleSort} /><th>Trạng thái</th><th>Thanh toán</th><th>CTV</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((o) => (
                <tr key={o.id}>
                  <td><Link className="ad-link" to={`/admin/orders/${o.id}`}><b>{o.code}</b></Link></td>
                  <td>{fmtDateTime(o.placedAt)}</td>
                  <td>{o.shipping.name}<div className="ad-muted">{o.shipping.phone}</div></td>
                  <td className="num">{formatVnd(o.totalAmount)}</td>
                  <td><Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                  <td>{PAYMENT_METHOD_LABEL[o.paymentMethod]}<div><Badge tone={paymentTone(o.paymentStatus)}>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</Badge></div></td>
                  <td>{o.attribution.referralCodeUsed ?? (o.attribution.affiliateId ? "Có" : "—")}{o.attribution.isSelfPurchase && <div><Badge tone="amber">Tự mua</Badge></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={fl.setPage} />
    </>
  );
}
