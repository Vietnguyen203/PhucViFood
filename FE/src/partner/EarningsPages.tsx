import { useState } from "react";
import { formatVnd } from "../lib/money";
import { ADJUSTMENT_STATUS_LABEL, COMMISSION_STATUS_LABEL, ORDER_STATUS_LABEL, type AdminAdjustment, type AdminCommission, type AdminPayout, type OrderStatus } from "../lib/admin/types";
import type { PartnerOrder } from "../lib/partner";
import { useAdmin } from "../admin/AdminContext";
import { Badge, ErrorBox, Field, FilterBar, Loading, Modal, Pager, fmtBps, fmtDateTime, useList, useListFilters } from "../admin/ui";

const commissionTone = (s: string) => (s === "PAID" ? "green" : s === "CONFIRMED" ? "blue" : s === "CANCELLED" ? "red" : "amber") as "green" | "blue" | "red" | "amber";

export function CommissionsPage() {
  const fl = useListFilters({ q: "", status: "" });
  const list = useList<AdminCommission>("/me/commissions", { page: fl.page, pageSize: fl.pageSize, sort: "-createdAt", q: fl.applied.q, filters: { status: fl.applied.status } });
  return (
    <>
      <div className="ad-head"><h1>Hoa hồng</h1></div>
      <p className="ad-muted">Hoa hồng tạm tính chuyển sang "Đã xác nhận" khi đơn được giao và qua thời gian giữ; Phúc Vị chi trả theo đợt.</p>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Mã đơn"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="PV-..." /></Field>
        <Field label="Trạng thái">
          <select value={fl.filters.status} onChange={(e) => fl.applyNow({ status: e.target.value })}>
            <option value="">Tất cả</option>{Object.entries(COMMISSION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Mã đơn</th><th className="num">Giá trị tính</th><th className="num">Tỷ lệ</th><th className="num">Hoa hồng</th><th>Trạng thái</th><th>Tạo lúc</th></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.orderCode}</b>{c.channelCode && <div className="ad-muted">kênh {c.channelCode}</div>}</td>
                  <td className="num">{formatVnd(c.baseAmount)}</td><td className="num">{fmtBps(c.rateBps)}</td><td className="num"><b>{formatVnd(c.amount)}</b></td>
                  <td><Badge tone={commissionTone(c.status)}>{COMMISSION_STATUS_LABEL[c.status] ?? c.status}</Badge>{c.adjustment && <div><Badge tone="red">Khoản trừ {formatVnd(c.adjustment.amount)}</Badge></div>}{c.cancelReason && <div className="ad-muted">{c.cancelReason}</div>}</td>
                  <td>{fmtDateTime(c.createdAt)}</td>
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

export function PayoutsPage() {
  const { adm } = useAdmin();
  const [page, setPage] = useState(1);
  const [apage, setApage] = useState(1);
  const payouts = useList<AdminPayout>("/me/payouts", { page, pageSize: 10, sort: "-paidAt" });
  const adjustments = useList<AdminAdjustment>("/me/adjustments", { page: apage, pageSize: 10, sort: "-createdAt" });
  const [detail, setDetail] = useState<AdminPayout | null>(null);
  const [full, setFull] = useState<AdminPayout | null>(null);
  async function open(p: AdminPayout) { setDetail(p); setFull(null); try { setFull((await adm<AdminPayout>(`/me/payouts/${p.id}`)).data); } catch { setFull(p); } }

  return (
    <>
      <div className="ad-head"><h1>Chi trả và khoản trừ</h1></div>
      <h2>Các đợt đã chi</h2>
      <ErrorBox error={payouts.error} onRetry={payouts.reload} />
      <Loading loading={payouts.loading && !payouts.data} empty={!payouts.loading && !payouts.error && payouts.data?.items.length === 0} />
      {payouts.data && payouts.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Thời điểm</th><th className="num">Thực nhận</th><th className="num">Đã trừ</th><th>Mã giao dịch</th><th></th></tr></thead>
            <tbody>
              {payouts.data.items.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.paidAt)}</td><td className="num"><b>{formatVnd(p.totalAmount)}</b></td>
                  <td className="num">{p.adjustmentAmount > 0 ? <Badge tone="red">−{formatVnd(p.adjustmentAmount)}</Badge> : "—"}</td>
                  <td>{p.paymentReference ?? "—"}</td><td className="actions"><button className="ad-btn small" onClick={() => void open(p)}>Chi tiết</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={payouts.data?.meta} onPage={setPage} />

      <h2>Khoản trừ</h2>
      <p className="ad-muted">Phát sinh khi đơn bị hoàn sau khi hoa hồng đã chi; khoản chờ sẽ được trừ vào đợt chi tiếp theo.</p>
      <ErrorBox error={adjustments.error} onRetry={adjustments.reload} />
      <Loading loading={adjustments.loading && !adjustments.data} empty={!adjustments.loading && !adjustments.error && adjustments.data?.items.length === 0} />
      {adjustments.data && adjustments.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Đơn</th><th className="num">Số tiền</th><th>Lý do</th><th>Trạng thái</th><th>Tạo lúc</th></tr></thead>
            <tbody>
              {adjustments.data.items.map((a) => (
                <tr key={a.id}><td><b>{a.orderCode}</b></td><td className="num">{formatVnd(a.amount)}</td><td>{a.reason}</td><td><Badge tone={a.status === "PENDING" ? "amber" : a.status === "APPLIED" ? "gray" : "blue"}>{ADJUSTMENT_STATUS_LABEL[a.status]}</Badge></td><td>{fmtDateTime(a.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={adjustments.data?.meta} onPage={setApage} />

      {detail && (
        <Modal title="Chi tiết đợt chi" wide onClose={() => setDetail(null)}>
          <dl className="ad-dl"><dt>Thực nhận</dt><dd><b>{formatVnd(detail.totalAmount)}</b></dd><dt>Mã giao dịch</dt><dd>{detail.paymentReference ?? "—"}</dd><dt>Ghi chú</dt><dd>{detail.note ?? "—"}</dd></dl>
          {!full ? <Loading loading /> : (
            <>
              <h2>Hoa hồng trong đợt</h2><ul>{(full.commissions ?? []).map((c) => <li key={c.id}>{c.orderCode}: {formatVnd(c.amount)}</li>)}</ul>
              {(full.adjustments ?? []).length > 0 && <><h2>Khoản trừ đã áp dụng</h2><ul>{full.adjustments!.map((a) => <li key={a.id}>{a.orderCode}: −{formatVnd(a.amount)}</li>)}</ul></>}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

export function OrdersPage() {
  const fl = useListFilters({ q: "", status: "" });
  const list = useList<PartnerOrder>("/me/orders", { page: fl.page, pageSize: fl.pageSize, sort: "-placedAt", q: fl.applied.q, filters: { status: fl.applied.status } });
  return (
    <>
      <div className="ad-head"><h1>Đơn hàng từ link của bạn</h1></div>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Mã đơn"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="PV-..." /></Field>
        <Field label="Trạng thái">
          <select value={fl.filters.status} onChange={(e) => fl.applyNow({ status: e.target.value })}>
            <option value="">Tất cả</option>{Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Mã đơn</th><th>Khách</th><th>Kênh</th><th className="num">Giá trị</th><th>Trạng thái</th><th>Đặt lúc</th></tr></thead>
            <tbody>
              {list.data.items.map((o) => (
                <tr key={o.id}>
                  <td><b>{o.code}</b></td><td>{o.customer}</td><td>{o.channelCode ?? "—"}{o.isSelfPurchase && <div><Badge tone="amber">Tự mua</Badge></div>}</td>
                  <td className="num">{formatVnd(o.subtotalAmount)}</td><td><Badge>{ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}</Badge></td><td>{fmtDateTime(o.placedAt)}</td>
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
