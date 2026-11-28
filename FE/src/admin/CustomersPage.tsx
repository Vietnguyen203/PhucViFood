import { useState } from "react";
import { Link } from "react-router";
import { API_BASE, describeError } from "../lib/api";
import { formatVnd } from "../lib/money";
import { parseFileName } from "../lib/admin/download";
import { dayEnd, dayStart, buildQuery, type ListQuery } from "../lib/admin/query";
import { ACTIVITY_LABEL, TIER_LABEL, type AdminCustomer } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { Badge, ErrorBox, Field, FilterBar, Loading, Pager, SortHeader, fmtDate, fmtDateTime, useList, useListFilters } from "./ui";

export const tierTone = (t?: string | null) => (t === "VIP" ? "amber" : t === "RETURNING" ? "green" : "gray") as "amber" | "green" | "gray";
export const activityTone = (t?: string | null) => (t === "ACTIVE" ? "green" : t === "AT_RISK" ? "amber" : t === "CHURNED" ? "red" : "gray") as "green" | "amber" | "red" | "gray";

/** Tải file xlsx có token: làm mới token nếu hết hạn rồi thử lại một lần. */
export async function downloadWithAuth(auth: ReturnType<typeof useAdmin>["auth"], path: string): Promise<{ blob: Blob; fileName: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = auth.session();
    if (!s) throw new Error("Phiên đăng nhập đã hết, vui lòng đăng nhập lại.");
    const res = await fetch(`${API_BASE.replace(/\/+$/, "")}${path}`, { headers: { authorization: `Bearer ${s.accessToken}` } });
    if (res.status === 401 && attempt === 0) { await auth.authed("/auth/me"); continue; }
    if (!res.ok) {
      let message = `Không tải được file (${res.status}).`;
      try { const j = await res.json() as { error?: { message?: string } }; if (j.error?.message) message = j.error.message; } catch { /* giữ thông báo chung */ }
      throw new Error(message);
    }
    return { blob: await res.blob(), fileName: parseFileName(res.headers.get("content-disposition")) };
  }
  throw new Error("Không tải được file.");
}

export default function CustomersPage() {
  const { auth, notify } = useAdmin();
  const fl = useListFilters({ q: "", tier: "", activity: "", marketingConsent: "", province: "", from: "", to: "" });
  const a = fl.applied;
  const query: ListQuery = {
    sort: fl.sort ?? "-createdAt", q: a.q,
    filters: { marketingConsent: a.marketingConsent, province: a.province, createdAt: { gte: dayStart(a.from), lte: dayEnd(a.to) } },
    extra: { tier: a.tier, activity: a.activity },
  };
  const list = useList<AdminCustomer>("/customers", { ...query, page: fl.page, pageSize: fl.pageSize });
  const [exporting, setExporting] = useState(false);

  async function exportXlsx() {
    setExporting(true);
    try {
      // Xuất theo đúng bộ lọc đang áp dụng (không phân trang).
      const { blob, fileName } = await downloadWithAuth(auth, `/customers/export${buildQuery(query)}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      notify(`Đã xuất ${fileName}`);
    } catch (e) { notify(describeError(e, e instanceof Error ? e.message : undefined), "error"); } finally { setExporting(false); }
  }

  return (
    <>
      <div className="ad-head">
        <h1>Khách hàng</h1>
        <button className="ad-btn primary" disabled={exporting} onClick={() => void exportXlsx()}>{exporting ? "Đang xuất..." : "Xuất Excel (theo bộ lọc)"}</button>
      </div>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Tìm kiếm"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="Tên, SĐT, email..." /></Field>
        <Field label="Phân loại">
          <select value={fl.filters.tier} onChange={(e) => fl.applyNow({ tier: e.target.value })}>
            <option value="">Tất cả</option>{Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Mức hoạt động">
          <select value={fl.filters.activity} onChange={(e) => fl.applyNow({ activity: e.target.value })}>
            <option value="">Tất cả</option>{Object.entries(ACTIVITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Đồng ý tư vấn">
          <select value={fl.filters.marketingConsent} onChange={(e) => fl.applyNow({ marketingConsent: e.target.value })}>
            <option value="">Tất cả</option><option value="true">Có</option><option value="false">Không</option>
          </select>
        </Field>
        <Field label="Tỉnh / thành"><input value={fl.filters.province} onChange={(e) => fl.setField("province", e.target.value)} /></Field>
        <Field label="Tạo từ"><input type="date" value={fl.filters.from} onChange={(e) => fl.setField("from", e.target.value)} /></Field>
        <Field label="Tạo đến"><input type="date" value={fl.filters.to} onChange={(e) => fl.setField("to", e.target.value)} /></Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><SortHeader label="Khách hàng" field="fullName" sort={fl.sort} onSort={fl.toggleSort} /><SortHeader label="Tỉnh / thành" field="province" sort={fl.sort} onSort={fl.toggleSort} /><th className="num">Đơn hợp lệ</th><th className="num">Đã chi</th><th>Phân loại</th><th>Hoạt động</th><th>Tư vấn</th><SortHeader label="Tạo lúc" field="createdAt" sort={fl.sort} onSort={fl.toggleSort} /></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td><Link className="ad-link" to={`/admin/customers/${c.id}`}><b>{c.fullName}</b></Link><div className="ad-muted">{c.phone}</div></td>
                  <td>{c.province ?? "—"}</td>
                  <td className="num">{c.orders ? c.orders.validOrders : "—"}</td>
                  <td className="num">{c.orders ? formatVnd(c.orders.totalSpent) : "—"}</td>
                  <td>{c.tier ? <Badge tone={tierTone(c.tier)}>{TIER_LABEL[c.tier] ?? c.tier}</Badge> : "—"}</td>
                  <td>{c.activity ? <Badge tone={activityTone(c.activity)}>{ACTIVITY_LABEL[c.activity] ?? c.activity}</Badge> : "—"}</td>
                  <td>{c.marketingConsent ? <Badge tone="green">Đồng ý</Badge> : <Badge>Không</Badge>}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data?.items.some((c) => c.statsAvailable === false) && <p className="ad-info">Một số thống kê đơn hàng tạm thời không lấy được (dịch vụ đơn hàng bận). Thử tải lại sau.</p>}
      <Pager meta={list.data?.meta} onPage={fl.setPage} />
      <p className="ad-muted">Cập nhật gần nhất: {fmtDateTime(new Date().toISOString())}</p>
    </>
  );
}
