import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatVnd } from "../lib/money";
import { useAsync } from "../lib/useAsync";
import { CARE_CHANNEL_LABEL, ORDER_STATUS_LABEL, ORDER_TRANSITIONS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, type AdminOrder } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { paymentTone, statusTone } from "./OrdersPage";
import { Badge, ConfirmModal, ErrorBox, Field, FormModal, Loading, fmtDateTime, useAction } from "./ui";

function CareNoteModal({ order, onClose, onSaved }: { order: AdminOrder; onClose: () => void; onSaved: (o: AdminOrder) => void }) {
  const { adm, notify } = useAdmin();
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState("");
  return (
    <FormModal title="Ghi nhận chăm sóc khách hàng" onClose={onClose}
      onSubmit={async () => {
        const { data } = await adm<AdminOrder>(`/orders/${order.id}/care-notes`, { method: "POST", body: { note: note.trim(), contactChannel: channel || undefined } });
        notify("Đã ghi nhận");
        onSaved(data);
      }}>
      {(err) => (
        <>
          <Field label="Kênh liên hệ" error={err.contactChannel}>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">Không rõ</option>
              {Object.entries(CARE_CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Nội dung *" error={err.note}><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} autoFocus /></Field>
        </>
      )}
    </FormModal>
  );
}

export default function OrderDetailPage() {
  const { id = "" } = useParams();
  const { adm } = useAdmin();
  const state = useAsync(async (signal) => (await adm<AdminOrder>(`/orders/${id}`, { signal })).data, [id]);
  const [local, setLocal] = useState<AdminOrder | null>(null);
  const [confirm, setConfirm] = useState<{ action: string; label: string; needsReason?: boolean; danger?: boolean } | null>(null);
  const [payment, setPayment] = useState<"PAID" | "REFUNDED" | null>(null);
  const [care, setCare] = useState(false);
  const act = useAction();
  const order = local && local.id === id ? local : state.data;

  if (state.loading && !order) return <Loading loading />;
  if (!order) return <><p><Link className="ad-link" to="/admin/orders">← Đơn hàng</Link></p><ErrorBox error={state.error} onRetry={state.reload} /></>;

  const transitions = ORDER_TRANSITIONS[order.status];
  const canPay = (order.paymentStatus === "UNPAID" || order.paymentStatus === "PENDING") && order.status !== "CANCELLED" && order.status !== "RETURNED";
  const canRefund = order.paymentStatus === "PAID" && (order.status === "CANCELLED" || order.status === "RETURNED");
  const total = order.items?.reduce((s, i) => s + i.lineTotal, 0) ?? order.subtotalAmount;

  return (
    <>
      <p><Link className="ad-link" to="/admin/orders">← Đơn hàng</Link></p>
      <div className="ad-head">
        <h1>{order.code} <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge></h1>
        <div className="ad-row-actions">
          {transitions.map((t) => (
            <button key={t.action} className={`ad-btn ${t.danger ? "danger" : "primary"}`} disabled={act.busy}
              onClick={() => t.needsReason ? setConfirm(t) : void act.run(async () => setLocal((await adm<AdminOrder>(`/orders/${order.id}/${t.action}`, { method: "POST" })).data), `${t.label}: thành công`)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {order.status === "PLACED" && order.paymentStatus === "UNPAID" && order.paymentDueAt && <p className="ad-info">Chờ chuyển khoản, tự hủy nếu chưa thanh toán trước <b>{fmtDateTime(order.paymentDueAt)}</b>.</p>}

      <div className="ad-cols">
        <section className="ad-card">
          <h2>Giao đến</h2>
          <p><b>{order.shipping.name}</b> · {order.shipping.phone}<br />{order.shipping.addressLine}, {order.shipping.ward}, {order.shipping.province}</p>
          {order.customerNote && <p className="ad-muted">Ghi chú của khách: {order.customerNote}</p>}
          <h2>Thanh toán</h2>
          <p>{PAYMENT_METHOD_LABEL[order.paymentMethod]} · <Badge tone={paymentTone(order.paymentStatus)}>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge></p>
          <div className="ad-row-actions" style={{ justifyContent: "flex-start" }}>
            {canPay && <button className="ad-btn" disabled={act.busy} onClick={() => setPayment("PAID")}>Đánh dấu đã thanh toán</button>}
            {canRefund && <button className="ad-btn" disabled={act.busy} onClick={() => setPayment("REFUNDED")}>Đánh dấu đã hoàn tiền</button>}
          </div>
        </section>
        <section className="ad-card">
          <h2>Cộng tác viên</h2>
          <dl className="ad-dl">
            <dt>Mã giới thiệu</dt><dd>{order.attribution.referralCodeUsed ?? "—"}</dd>
            <dt>Nguồn</dt><dd>{order.attribution.source ?? "Không có"}</dd>
            <dt>Kênh</dt><dd>{order.attribution.channelCode ?? "—"}</dd>
            <dt>Tự mua</dt><dd>{order.attribution.isSelfPurchase ? "Có (không tính hoa hồng)" : "Không"}</dd>
          </dl>
          {order.customerId && <p><Link className="ad-link" to={`/admin/customers/${order.customerId}`}>Xem khách hàng →</Link></p>}
          {order.cancelReason && <p className="ad-error">Lý do hủy/hoàn: {order.cancelReason}</p>}
        </section>
      </div>

      <h2>Sản phẩm</h2>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>Sản phẩm</th><th className="num">Đơn giá</th><th className="num">SL</th><th className="num">Thành tiền</th></tr></thead>
          <tbody>
            {(order.items ?? []).map((i) => <tr key={i.productId}><td>{i.name}</td><td className="num">{formatVnd(i.unitPrice)}</td><td className="num">{i.quantity}</td><td className="num">{formatVnd(i.lineTotal)}</td></tr>)}
            <tr><td colSpan={3} className="num">Tạm tính</td><td className="num">{formatVnd(total)}</td></tr>
            <tr><td colSpan={3} className="num">Phí giao hàng</td><td className="num">{formatVnd(order.shippingFee)}</td></tr>
            <tr><td colSpan={3} className="num"><b>Tổng cộng</b></td><td className="num"><b>{formatVnd(order.totalAmount)}</b></td></tr>
          </tbody>
        </table>
      </div>

      <div className="ad-cols">
        <section>
          <h2>Lịch sử trạng thái</h2>
          <ul className="ad-timeline">
            {(order.history ?? []).map((h, i) => (
              <li key={i}><span><b>{ORDER_STATUS_LABEL[h.toStatus]}</b> · {h.actorType === "ADMIN" ? "Admin" : h.actorType === "CUSTOMER" ? "Khách" : "Hệ thống"}{h.note ? ` · ${h.note}` : ""}</span><span className="ad-muted">{fmtDateTime(h.at)}</span></li>
            ))}
          </ul>
        </section>
        <section>
          <div className="ad-head"><h2>Chăm sóc khách hàng</h2><button className="ad-btn" onClick={() => setCare(true)}>+ Ghi nhận</button></div>
          {(order.careNotes ?? []).length === 0 ? <p className="ad-muted">Chưa có ghi nhận.</p> : (
            <ul className="ad-timeline">
              {order.careNotes!.map((n) => <li key={n.id}><span>{n.contactChannel ? <Badge>{CARE_CHANNEL_LABEL[n.contactChannel] ?? n.contactChannel}</Badge> : null} {n.note}</span><span className="ad-muted">{fmtDateTime(n.contactedAt)}</span></li>)}
            </ul>
          )}
        </section>
      </div>

      {confirm && (
        <ConfirmModal title={confirm.label} danger={confirm.danger} confirmLabel={confirm.label} onClose={() => setConfirm(null)}
          message={<>Đơn <b>{order.code}</b> sẽ chuyển sang trạng thái mới. {confirm.action === "cancel" ? "Hàng đã giữ sẽ được trả về kho." : "Hàng được hoàn về kho; hoa hồng liên quan được xử lý theo quy định."}</>}
          reason={{ label: "Lý do", required: true }}
          onConfirm={async (reason) => setLocal((await adm<AdminOrder>(`/orders/${order.id}/${confirm.action}`, { method: "POST", body: { reason } })).data)} />
      )}
      {payment && (
        <ConfirmModal title={payment === "PAID" ? "Xác nhận đã nhận tiền" : "Xác nhận đã hoàn tiền"} confirmLabel="Xác nhận" onClose={() => setPayment(null)}
          message={<>Đơn <b>{order.code}</b>, số tiền <b>{formatVnd(order.totalAmount)}</b>.</>}
          reason={{ label: "Ghi chú (mã giao dịch...)" }}
          onConfirm={async (note) => setLocal((await adm<AdminOrder>(`/orders/${order.id}/payment`, { method: "POST", body: { status: payment, note: note || undefined } })).data)} />
      )}
      {care && <CareNoteModal order={order} onClose={() => setCare(false)} onSaved={setLocal} />}
    </>
  );
}
