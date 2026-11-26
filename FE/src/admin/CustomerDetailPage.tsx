import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatVnd } from "../lib/money";
import { useAsync } from "../lib/useAsync";
import { ACTIVITY_LABEL, ORDER_STATUS_LABEL, TIER_LABEL, type AdminCustomer, type AdminOrder } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { activityTone, tierTone } from "./CustomersPage";
import { statusTone } from "./OrdersPage";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, fmtDateTime, useList } from "./ui";

function EditModal({ c, onClose, onSaved }: { c: AdminCustomer; onClose: () => void; onSaved: (c: AdminCustomer) => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState({ fullName: c.fullName, email: c.email ?? "", province: c.province ?? "", ward: c.ward ?? "", addressLine: c.addressLine ?? "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <FormModal title="Sửa thông tin khách hàng" onClose={onClose}
      onSubmit={async () => {
        const body = { fullName: f.fullName.trim(), email: f.email.trim() || undefined, province: f.province.trim() || undefined, ward: f.ward.trim() || undefined, addressLine: f.addressLine.trim() || undefined };
        onSaved((await adm<AdminCustomer>(`/customers/${c.id}`, { method: "PATCH", body })).data);
        notify("Đã lưu");
      }}>
      {(err) => (
        <>
          <p className="ad-muted">Số điện thoại ({c.phone}) là khóa định danh khách nên không sửa được.</p>
          <Field label="Họ và tên *" error={err.fullName}><input value={f.fullName} onChange={(e) => set("fullName", e.target.value)} autoFocus /></Field>
          <Field label="Email" error={err.email}><input value={f.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
          <div className="ad-grid2">
            <Field label="Tỉnh / thành" error={err.province}><input value={f.province} onChange={(e) => set("province", e.target.value)} /></Field>
            <Field label="Phường / xã" error={err.ward}><input value={f.ward} onChange={(e) => set("ward", e.target.value)} /></Field>
          </div>
          <Field label="Địa chỉ" error={err.addressLine}><input value={f.addressLine} onChange={(e) => set("addressLine", e.target.value)} /></Field>
        </>
      )}
    </FormModal>
  );
}

export default function CustomerDetailPage() {
  const { id = "" } = useParams();
  const { adm, notify } = useAdmin();
  const state = useAsync(async (signal) => (await adm<AdminCustomer>(`/customers/${id}`, { signal })).data, [id]);
  const [local, setLocal] = useState<AdminCustomer | null>(null);
  const [edit, setEdit] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(null);
  const orders = useList<AdminOrder>("/orders", { pageSize: 20, sort: "-placedAt", filters: { customerId: id } });
  const c = local && local.id === id ? local : state.data;

  if (state.loading && !c) return <Loading loading />;
  if (!c) return <><p><Link className="ad-link" to="/admin/khach-hang">← Khách hàng</Link></p><ErrorBox error={state.error} onRetry={state.reload} /></>;

  return (
    <>
      <p><Link className="ad-link" to="/admin/khach-hang">← Khách hàng</Link></p>
      <div className="ad-head">
        <h1>{c.fullName} {c.tier && <Badge tone={tierTone(c.tier)}>{TIER_LABEL[c.tier] ?? c.tier}</Badge>} {c.activity && <Badge tone={activityTone(c.activity)}>{ACTIVITY_LABEL[c.activity] ?? c.activity}</Badge>}</h1>
        <button className="ad-btn" onClick={() => setEdit(true)}>Sửa thông tin</button>
      </div>
      <div className="ad-cols">
        <section className="ad-card">
          <h2>Liên hệ</h2>
          <dl className="ad-dl">
            <dt>Số điện thoại</dt><dd>{c.phone}</dd><dt>Email</dt><dd>{c.email ?? "—"}</dd>
            <dt>Địa chỉ</dt><dd>{[c.addressLine, c.ward, c.province].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Khách từ</dt><dd>{fmtDateTime(c.createdAt)}</dd>
            <dt>Nguồn đầu tiên</dt><dd>{c.firstSource.affiliateId ? `CTV${c.firstSource.channelCode ? ` · kênh ${c.firstSource.channelCode}` : ""}` : "Trực tiếp"}</dd>
          </dl>
        </section>
        <section className="ad-card">
          <h2>Thống kê và đồng ý tư vấn</h2>
          {c.orders ? (
            <dl className="ad-dl">
              <dt>Đơn hợp lệ</dt><dd>{c.orders.validOrders}</dd><dt>Tổng chi tiêu</dt><dd>{formatVnd(c.orders.totalSpent)}</dd><dt>Đơn gần nhất</dt><dd>{fmtDateTime(c.orders.lastOrderAt)}</dd>
            </dl>
          ) : <p className="ad-muted">Chưa lấy được thống kê đơn hàng.</p>}
          <p>
            Đồng ý nhận tư vấn: {c.marketingConsent ? <Badge tone="green">Có</Badge> : <Badge>Không</Badge>}
            {c.consentAt && <span className="ad-muted"> · từ {fmtDateTime(c.consentAt)}</span>}
            {c.consentWithdrawnAt && <span className="ad-muted"> · rút lúc {fmtDateTime(c.consentWithdrawnAt)}</span>}
          </p>
          <button className="ad-btn small" onClick={() => setConsent(!c.marketingConsent)}>{c.marketingConsent ? "Ghi nhận khách rút đồng ý" : "Ghi nhận khách đồng ý"}</button>
        </section>
      </div>

      <h2>Đơn hàng</h2>
      <ErrorBox error={orders.error} onRetry={orders.reload} />
      <Loading loading={orders.loading && !orders.data} empty={!orders.loading && !orders.error && orders.data?.items.length === 0} />
      {orders.data && orders.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Mã đơn</th><th>Đặt lúc</th><th className="num">Tổng tiền</th><th>Trạng thái</th></tr></thead>
            <tbody>{orders.data.items.map((o) => <tr key={o.id}><td><Link className="ad-link" to={`/admin/don-hang/${o.id}`}><b>{o.code}</b></Link></td><td>{fmtDateTime(o.placedAt)}</td><td className="num">{formatVnd(o.totalAmount)}</td><td><Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge></td></tr>)}</tbody>
          </table>
        </div>
      )}

      {edit && <EditModal c={c} onClose={() => setEdit(false)} onSaved={(x) => setLocal({ ...c, ...x })} />}
      {consent !== null && (
        <ConfirmModal title="Cập nhật đồng ý tư vấn" confirmLabel="Xác nhận" onClose={() => setConsent(null)}
          message={consent ? "Ghi nhận khách đã đồng ý nhận tư vấn và ưu đãi?" : "Ghi nhận khách đã rút đồng ý? Khách sẽ không được liên hệ tư vấn nữa."}
          onConfirm={async () => { setLocal({ ...c, ...(await adm<AdminCustomer>(`/customers/${c.id}/consent`, { method: "POST", body: { consent } })).data }); notify("Đã cập nhật"); }} />
      )}
    </>
  );
}
