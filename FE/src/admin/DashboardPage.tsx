import { Link } from "react-router";
import { formatVnd } from "../lib/money";
import { useAsync } from "../lib/useAsync";
import { chartBars, type OrderOverview } from "../lib/admin/dashboard";
import { ORDER_STATUS_LABEL, type AdminProduct, type OrderStatus } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { Badge, ErrorBox, Loading } from "./ui";

const LOW_STOCK = 10;
const PIPELINE: OrderStatus[] = ["PLACED", "CONFIRMED", "SHIPPING", "DELIVERED"];

/** Tổng số bản ghi từ meta phân trang của một danh sách (pageSize=1 để nhẹ). */
function useCount(path: string) {
  const { adm } = useAdmin();
  return useAsync(async (signal) => (await adm<unknown[]>(path, { signal })).meta?.pagination?.total ?? 0, [path]);
}

function Stat({ label, value, sub, to, tone, loading }: { label: string; value: string | number; sub?: string; to?: string; tone?: "red" | "amber"; loading?: boolean }) {
  const body = (
    <div className={`ad-card ad-stat${tone ? ` ${tone}` : ""}`}>
      <div className="ad-muted">{label}</div>
      <div className="ad-stat-value">{loading ? "…" : value}</div>
      {sub && <small className="ad-muted">{sub}</small>}
    </div>
  );
  return to ? <Link to={to} className="ad-stat-link">{body}</Link> : body;
}

export default function DashboardPage() {
  const { adm } = useAdmin();
  const overview = useAsync(async (signal) => (await adm<OrderOverview>("/orders/stats", { signal })).data, []);
  const pendingAffiliates = useCount("/affiliates?filter[status]=PENDING&pageSize=1");
  const payable = useCount("/commissions?filter[status]=CONFIRMED&pageSize=1");
  const adjustments = useCount("/adjustments?filter[status]=PENDING&pageSize=1");
  const lowStock = useAsync(async (signal) => {
    const r = await adm<AdminProduct[]>(`/products?filter[stockQuantity][lte]=${LOW_STOCK}&filter[isVisible]=true&sort=stockQuantity&pageSize=6`, { signal });
    return { items: r.data, total: r.meta?.pagination?.total ?? r.data.length };
  }, []);

  const o = overview.data;
  const bars = o ? chartBars(o.daily) : [];

  return (
    <>
      <div className="ad-head"><h1>Tổng quan</h1><button className="ad-btn" onClick={() => { overview.reload(); pendingAffiliates.reload(); payable.reload(); adjustments.reload(); lowStock.reload(); }}>Làm mới</button></div>

      <h2>Doanh thu</h2>
      <p className="ad-muted">Tính trên đơn hợp lệ (không gồm đơn hủy, hoàn trả), theo ngày đặt, giờ Việt Nam.</p>
      <ErrorBox error={overview.error} onRetry={overview.reload} />
      <Loading loading={overview.loading && !o} />
      {o && (
        <>
          <div className="ad-cols ad-stat-grid">
            <Stat label="Hôm nay" value={formatVnd(o.today.revenue)} sub={`${o.today.orders} đơn`} />
            <Stat label="7 ngày gần nhất" value={formatVnd(o.last7Days.revenue)} sub={`${o.last7Days.orders} đơn`} />
            <Stat label="30 ngày gần nhất" value={formatVnd(o.last30Days.revenue)} sub={`${o.last30Days.orders} đơn`} />
          </div>
          <div className="ad-card" style={{ marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Doanh thu 14 ngày gần nhất</h2>
            <div className="ad-chart" role="img" aria-label="Biểu đồ doanh thu 14 ngày gần nhất">
              {bars.map((b) => (
                <div className="ad-bar" key={b.date} title={`${b.label}: ${formatVnd(b.revenue)} · ${b.orders} đơn`}>
                  <div className="ad-bar-fill" style={{ height: `${b.heightPct}%` }} />
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          <h2>Đơn hàng đang xử lý</h2>
          <div className="ad-cols ad-stat-grid">
            {PIPELINE.map((s) => <Stat key={s} label={ORDER_STATUS_LABEL[s]} value={o.byStatus[s] ?? 0} to="/admin/orders" tone={s === "PLACED" && o.byStatus.PLACED > 0 ? "amber" : undefined} />)}
          </div>
        </>
      )}

      <h2>Cần xử lý</h2>
      <div className="ad-cols ad-stat-grid">
        <Stat label="Đơn chờ chuyển khoản" value={o?.awaitingPayment ?? 0} loading={!o} sub="Đang giữ hàng" to="/admin/orders" tone={o && o.awaitingPayment > 0 ? "amber" : undefined} />
        <Stat label="Đơn chờ CSKH" value={o?.cskhWaiting ?? 0} loading={!o} sub="Đã giao, chưa hoàn tất" to="/admin/care-queue" tone={o && o.cskhWaiting > 0 ? "amber" : undefined} />
        <Stat label="CTV chờ duyệt" value={pendingAffiliates.data ?? 0} loading={pendingAffiliates.loading} to="/admin/affiliates" tone={(pendingAffiliates.data ?? 0) > 0 ? "amber" : undefined} />
        <Stat label="Hoa hồng chờ chi trả" value={payable.data ?? 0} loading={payable.loading} sub="Đã xác nhận" to="/admin/payouts" />
        <Stat label="Khoản trừ chờ" value={adjustments.data ?? 0} loading={adjustments.loading} to="/admin/adjustments" />
      </div>
      <ErrorBox error={pendingAffiliates.error ?? payable.error ?? adjustments.error} />

      <div className="ad-head" style={{ marginTop: 20 }}>
        <h2 style={{ margin: 0 }}>Hàng sắp hết (còn từ {LOW_STOCK} trở xuống)</h2>
        <Link className="ad-link" to="/admin/products">Quản lý tồn kho →</Link>
      </div>
      <ErrorBox error={lowStock.error} onRetry={lowStock.reload} />
      <Loading loading={lowStock.loading && !lowStock.data} />
      {lowStock.data && (lowStock.data.items.length === 0 ? <p className="ad-muted">Không có sản phẩm nào sắp hết hàng.</p> : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th className="num">Tồn kho</th></tr></thead>
            <tbody>
              {lowStock.data.items.map((p) => (
                <tr key={p.id}><td><b>{p.name}</b><div className="ad-muted">{p.sku ?? "—"}</div></td><td>{p.category?.name ?? "—"}</td><td className="num"><Badge tone={p.stockQuantity === 0 ? "red" : "amber"}>{p.stockQuantity === 0 ? "Hết hàng" : p.stockQuantity}</Badge></td></tr>
              ))}
            </tbody>
          </table>
          {lowStock.data.total > lowStock.data.items.length && <p className="ad-muted" style={{ padding: "0 12px" }}>và {lowStock.data.total - lowStock.data.items.length} sản phẩm khác.</p>}
        </div>
      ))}
    </>
  );
}
