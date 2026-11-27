import { useState } from "react";
import { formatVnd } from "../lib/money";
import { useAsync } from "../lib/useAsync";
import { chartBars } from "../lib/admin/dashboard";
import { affiliatesCsv, dailyCsv, PRESETS, presetRange, productsCsv, rangeError, type CommissionReport, type DateRange, type SalesReport } from "../lib/admin/report";
import { COMMISSION_STATUS_LABEL, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, type CommissionStatus, type OrderStatus } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { ErrorBox, Field, Loading } from "./ui";

const COMMISSION_ORDER: CommissionStatus[] = ["ESTIMATED", "CONFIRMED", "PAID", "CANCELLED"];
const STATUS_ORDER: OrderStatus[] = ["PLACED", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED", "RETURNED"];

/** Tải một chuỗi CSV về máy. */
function saveCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="ad-card ad-stat">
      <div className="ad-muted">{label}</div>
      <div className="ad-stat-value">{value}</div>
      {sub && <small className="ad-muted">{sub}</small>}
    </div>
  );
}

/** Báo cáo bán hàng theo khoảng ngày tùy chọn (giờ Việt Nam), kèm xuất CSV. */
export default function ReportPage() {
  const { adm } = useAdmin();
  const [draft, setDraft] = useState<DateRange>(() => presetRange("last30"));
  const [applied, setApplied] = useState<DateRange>(draft);
  const error = rangeError(draft);

  const report = useAsync(async (signal) => (await adm<SalesReport>(`/orders/report?from=${applied.from}&to=${applied.to}`, { signal })).data, [applied.from, applied.to]);
  const commission = useAsync(async (signal) => (await adm<CommissionReport>(`/commissions/report?from=${applied.from}&to=${applied.to}`, { signal })).data, [applied.from, applied.to]);
  const r = report.data;
  const cr = commission.data;
  const bars = r ? chartBars(r.daily) : [];
  const step = Math.max(1, Math.ceil(bars.length / 14)); // nhiều ngày thì chỉ ghi nhãn thưa
  const apply = (range: DateRange) => { setDraft(range); if (!rangeError(range)) setApplied(range); };
  const shareOfAffiliate = r && r.totals.revenue > 0 ? Math.round((r.totals.viaAffiliate.revenue / r.totals.revenue) * 100) : 0;

  return (
    <>
      <div className="ad-head"><h1>Báo cáo</h1></div>
      <form className="ad-filters" onSubmit={(e) => { e.preventDefault(); apply(draft); }}>
        <Field label="Từ ngày"><input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
        <Field label="Đến ngày"><input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
        <div className="ad-filter-actions" style={{ marginLeft: 0 }}>
          <button className="ad-btn primary" type="submit" disabled={!!error}>Xem báo cáo</button>
        </div>
        <div className="ad-presets">
          {PRESETS.map((p) => <button key={p.key} type="button" className="ad-btn small" onClick={() => apply(presetRange(p.key))}>{p.label}</button>)}
        </div>
      </form>
      {error && <p className="ad-error" role="alert">{error}</p>}
      <p className="ad-muted">Tính trên đơn hợp lệ (không gồm đơn hủy, hoàn trả), theo ngày đặt, giờ Việt Nam.</p>

      <ErrorBox error={report.error} onRetry={report.reload} />
      <Loading loading={report.loading && !r} />
      {r && (
        <>
          <div className="ad-cols ad-stat-grid">
            <Stat label="Doanh thu" value={formatVnd(r.totals.revenue)} sub={`${r.range.days} ngày: ${r.range.from} → ${r.range.to}`} />
            <Stat label="Số đơn" value={r.totals.orders} />
            <Stat label="Giá trị đơn trung bình" value={formatVnd(r.totals.averageOrderValue)} />
            <Stat label="Đơn qua cộng tác viên" value={r.totals.viaAffiliate.orders} sub={`${formatVnd(r.totals.viaAffiliate.revenue)} (${shareOfAffiliate}% doanh thu)`} />
          </div>

          <div className="ad-card" style={{ marginTop: 14 }}>
            <div className="ad-head" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>Doanh thu theo ngày</h2>
              <button className="ad-btn small" onClick={() => saveCsv(`bao-cao-${r.range.from}_${r.range.to}.csv`, dailyCsv(r))}>Xuất CSV</button>
            </div>
            <div className="ad-chart" role="img" aria-label="Biểu đồ doanh thu theo ngày">
              {bars.map((b, i) => (
                <div className="ad-bar" key={b.date} title={`${b.label}: ${formatVnd(b.revenue)} · ${b.orders} đơn`}>
                  <div className="ad-bar-fill" style={{ height: `${b.heightPct}%` }} />
                  <span style={i % step === 0 ? undefined : { visibility: "hidden" }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ad-cols" style={{ marginTop: 14 }}>
            <div>
              <h2>Đơn theo trạng thái</h2>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Trạng thái</th><th className="num">Số đơn</th></tr></thead>
                  <tbody>{STATUS_ORDER.map((s) => <tr key={s}><td>{ORDER_STATUS_LABEL[s]}</td><td className="num">{r.byStatus[s] ?? 0}</td></tr>)}</tbody>
                </table>
              </div>
              <p className="ad-muted">Gồm cả đơn hủy và hoàn trả đặt trong khoảng ngày.</p>
              <h2>Theo hình thức thanh toán</h2>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Hình thức</th><th className="num">Số đơn</th><th className="num">Doanh thu</th></tr></thead>
                  <tbody>
                    {r.byPayment.length === 0 && <tr><td colSpan={3} className="ad-muted">Chưa có đơn hợp lệ.</td></tr>}
                    {r.byPayment.map((m) => <tr key={m.method}><td>{PAYMENT_METHOD_LABEL[m.method] ?? m.method}</td><td className="num">{m.orders}</td><td className="num">{formatVnd(m.revenue)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="ad-head" style={{ marginBottom: 0 }}>
                <h2>Sản phẩm bán chạy</h2>
                {r.topProducts.length > 0 && <button className="ad-btn small" onClick={() => saveCsv(`san-pham-${r.range.from}_${r.range.to}.csv`, productsCsv(r))}>Xuất CSV</button>}
              </div>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Sản phẩm</th><th className="num">Số lượng</th><th className="num">Doanh thu</th></tr></thead>
                  <tbody>
                    {r.topProducts.length === 0 && <tr><td colSpan={3} className="ad-muted">Chưa có đơn hợp lệ.</td></tr>}
                    {r.topProducts.map((p) => <tr key={p.productId}><td>{p.name}</td><td className="num">{p.quantity}</td><td className="num">{formatVnd(p.revenue)}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p className="ad-muted">Tối đa 10 sản phẩm, xếp theo doanh thu.</p>
            </div>
          </div>
        </>
      )}

      <h2>Hoa hồng và chi trả</h2>
      <p className="ad-muted">Hoa hồng tính theo ngày phát sinh (chia theo trạng thái hiện tại); chi trả tính theo ngày chi.</p>
      <ErrorBox error={commission.error} onRetry={commission.reload} />
      <Loading loading={commission.loading && !cr} />
      {cr && (
        <>
          <div className="ad-cols ad-stat-grid">
            <Stat label="Hoa hồng phát sinh" value={formatVnd(cr.commissions.amount)} sub={`${cr.commissions.count} khoản (không gồm đã hủy)`} />
            <Stat label="Đã chi trả" value={formatVnd(cr.payouts.paidAmount)} sub={`${cr.payouts.count} đợt${cr.payouts.adjustmentAmount > 0 ? `, đã trừ ${formatVnd(cr.payouts.adjustmentAmount)}` : ""}`} />
            <Stat label="CTV mới đăng ký" value={cr.affiliates.registered} sub={`${cr.affiliates.approved} CTV được duyệt`} />
          </div>
          <div className="ad-cols" style={{ marginTop: 14 }}>
            <div>
              <h2>Hoa hồng theo trạng thái</h2>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Trạng thái</th><th className="num">Số khoản</th><th className="num">Số tiền</th></tr></thead>
                  <tbody>{COMMISSION_ORDER.map((k) => <tr key={k}><td>{COMMISSION_STATUS_LABEL[k] ?? k}</td><td className="num">{cr.commissions.byStatus[k]?.count ?? 0}</td><td className="num">{formatVnd(cr.commissions.byStatus[k]?.amount ?? 0)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="ad-head" style={{ marginBottom: 0 }}>
                <h2>CTV có hoa hồng cao nhất</h2>
                {cr.topAffiliates.length > 0 && <button className="ad-btn small" onClick={() => saveCsv(`ctv-${cr.range.from}_${cr.range.to}.csv`, affiliatesCsv(cr))}>Xuất CSV</button>}
              </div>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Cộng tác viên</th><th className="num">Số khoản</th><th className="num">Hoa hồng</th></tr></thead>
                  <tbody>
                    {cr.topAffiliates.length === 0 && <tr><td colSpan={3} className="ad-muted">Chưa có hoa hồng trong khoảng này.</td></tr>}
                    {cr.topAffiliates.map((a) => <tr key={a.affiliateId}><td><b>{a.fullName ?? a.affiliateId.slice(0, 8)}</b><div className="ad-muted">{a.referralCode ?? ""}</div></td><td className="num">{a.commissions}</td><td className="num">{formatVnd(a.amount)}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p className="ad-muted">Tối đa 10 CTV, xếp theo hoa hồng.</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
