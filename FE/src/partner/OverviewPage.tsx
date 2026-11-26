import { useState } from "react";
import { Link } from "react-router";
import { formatVnd } from "../lib/money";
import { useAsync } from "../lib/useAsync";
import { COMMISSION_STATUS_LABEL } from "../lib/admin/types";
import { EVENT_LABEL, type CommissionSummary, type PartnerStats } from "../lib/partner";
import { useAdmin } from "../admin/AdminContext";
import { ErrorBox, Loading, fmtBps } from "../admin/ui";
import { usePartner } from "./partnerContext";

const RANGES = [{ days: 7, label: "7 ngày" }, { days: 30, label: "30 ngày" }, { days: 90, label: "90 ngày" }];

export default function OverviewPage() {
  const { profile } = usePartner();
  const { adm } = useAdmin();
  const [days, setDays] = useState(30);
  const summary = useAsync(async (signal) => (await adm<CommissionSummary>("/me/commissions/summary", { signal })).data, []);
  const stats = useAsync(async (signal) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    return (await adm<PartnerStats>(`/me/stats?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { signal })).data;
  }, [days]);

  const s = summary.data;
  const ev = (type: string) => stats.data?.events.filter((e) => e.type === type).reduce((n, e) => n + e.count, 0) ?? 0;

  return (
    <>
      <div className="ad-head"><h1>Xin chào, {profile.fullName}</h1><span className="ad-muted">Mã giới thiệu: <b>{profile.referralCode}</b> · Hoa hồng {profile.commissionRateBps != null ? fmtBps(profile.commissionRateBps) : "mặc định"}</span></div>

      <h2>Hoa hồng</h2>
      <ErrorBox error={summary.error} onRetry={summary.reload} />
      <Loading loading={summary.loading && !s} />
      {s && (
        <div className="ad-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <div className="ad-card"><div className="ad-muted">Có thể nhận đợt tới</div><h1 style={{ margin: "4px 0" }}>{formatVnd(s.payable)}</h1><small className="ad-muted">Hoa hồng đã xác nhận, chờ chi trả</small></div>
          {(["ESTIMATED", "PAID"] as const).map((k) => (
            <div className="ad-card" key={k}><div className="ad-muted">{COMMISSION_STATUS_LABEL[k]}</div><h1 style={{ margin: "4px 0" }}>{formatVnd(s.byStatus[k]?.amount ?? 0)}</h1><small className="ad-muted">{s.byStatus[k]?.count ?? 0} đơn</small></div>
          ))}
          {s.pendingAdjustments.count > 0 && (
            <div className="ad-card"><div className="ad-muted">Khoản trừ chờ</div><h1 style={{ margin: "4px 0", color: "#c0392b" }}>−{formatVnd(s.pendingAdjustments.amount)}</h1><small className="ad-muted">Đơn hoàn sau khi đã chi, trừ vào đợt tới. <Link className="ad-link" to="/ctv/tai-khoan/chi-tra">Xem</Link></small></div>
          )}
        </div>
      )}

      <div className="ad-head" style={{ marginTop: 20 }}>
        <h2 style={{ margin: 0 }}>Lượt truy cập link</h2>
        <div className="ad-row-actions">{RANGES.map((r) => <button key={r.days} className={`ad-btn small${days === r.days ? " primary" : ""}`} onClick={() => setDays(r.days)}>{r.label}</button>)}</div>
      </div>
      <ErrorBox error={stats.error} onRetry={stats.reload} />
      <Loading loading={stats.loading && !stats.data} />
      {stats.data && (
        <>
          <div className="ad-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div className="ad-card"><div className="ad-muted">Lượt bấm</div><h1 style={{ margin: "4px 0" }}>{stats.data.clicks.total}</h1></div>
            <div className="ad-card"><div className="ad-muted">Người truy cập</div><h1 style={{ margin: "4px 0" }}>{stats.data.clicks.uniqueVisitors}</h1></div>
            <div className="ad-card"><div className="ad-muted">{EVENT_LABEL.ADD_TO_CART}</div><h1 style={{ margin: "4px 0" }}>{ev("ADD_TO_CART")}</h1></div>
            <div className="ad-card"><div className="ad-muted">{EVENT_LABEL.CHECKOUT_START}</div><h1 style={{ margin: "4px 0" }}>{ev("CHECKOUT_START")}</h1></div>
          </div>
          {stats.data.clicks.byChannel.length > 0 && (
            <div className="ad-table-wrap" style={{ marginTop: 12 }}>
              <table className="ad-table">
                <thead><tr><th>Kênh</th><th className="num">Lượt bấm</th><th className="num">Người truy cập</th></tr></thead>
                <tbody>{stats.data.clicks.byChannel.map((c) => <tr key={c.channelCode ?? "-"}><td>{c.channelCode ?? "Không rõ"}</td><td className="num">{c.clicks}</td><td className="num">{c.visitors}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {stats.data.clicks.total === 0 && <p className="ad-muted">Chưa có lượt bấm trong khoảng này. Chia sẻ <Link className="ad-link" to="/ctv/tai-khoan/link">link giới thiệu</Link> để bắt đầu.</p>}
        </>
      )}
    </>
  );
}
