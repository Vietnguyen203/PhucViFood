import { useState } from "react";
import { formatVnd } from "../lib/money";
import type { AdminAdjustment, AdminCommission, AdminPayout } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { useAffiliateNames } from "./AffiliatesPage";
import { Badge, ErrorBox, Field, FormModal, Loading, Modal, Pager, fmtDateTime, useList } from "./ui";

function CreatePayoutModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { adm, notify } = useAdmin();
  const names = useAffiliateNames();
  const [affiliateId, setAffiliateId] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const confirmed = useList<AdminCommission>("/commissions", { pageSize: 100, filters: { status: "CONFIRMED", affiliateId } });
  const pending = useList<AdminAdjustment>("/adjustments", { pageSize: 100, filters: { status: "PENDING", affiliateId } });
  const rows = affiliateId ? confirmed.data?.items ?? [] : [];
  const chosen = picked ?? new Set(rows.map((r) => r.id));
  const gross = rows.filter((r) => chosen.has(r.id)).reduce((s, r) => s + r.amount, 0);
  const deduct = affiliateId ? (pending.data?.items ?? []).reduce((s, r) => s + r.amount, 0) : 0;
  const toggle = (id: string) => { const n = new Set(chosen); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); };

  return (
    <FormModal title="Tạo đợt chi trả" wide submitLabel="Chi trả" onClose={onClose}
      onSubmit={async () => {
        if (rows.length > 0 && chosen.size === 0 && pending.data?.items.length === 0) throw new Error("Chọn ít nhất một hoa hồng.");
        await adm("/payouts", { method: "POST", body: { affiliateId, commissionIds: picked ? [...chosen] : undefined, paymentReference: ref.trim() || undefined, note: note.trim() || undefined } });
        notify("Đã tạo đợt chi trả");
        onDone();
      }}>
      {(err) => (
        <>
          <Field label="Cộng tác viên *" error={err.affiliateId}>
            <select value={affiliateId} onChange={(e) => { setAffiliateId(e.target.value); setPicked(null); }}>
              <option value="">Chọn cộng tác viên</option>
              {names.items.map((a) => <option key={a.id} value={a.id}>{a.fullName} ({a.referralCode})</option>)}
            </select>
          </Field>
          {affiliateId && (
            <>
              <ErrorBox error={confirmed.error} onRetry={confirmed.reload} />
              <Loading loading={confirmed.loading} empty={!confirmed.loading && rows.length === 0} />
              {rows.length > 0 && (
                <div className="ad-table-wrap">
                  <table className="ad-table">
                    <thead><tr><th></th><th>Đơn</th><th className="num">Hoa hồng</th></tr></thead>
                    <tbody>{rows.map((r) => <tr key={r.id}><td><input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} /></td><td>{r.orderCode}</td><td className="num">{formatVnd(r.amount)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              <p className="ad-info">
                Hoa hồng chọn: <b>{formatVnd(gross)}</b>
                {deduct > 0 && <> · khoản trừ chờ (đơn hoàn sau khi đã chi): <b>{formatVnd(deduct)}</b>, tự trừ khi đủ tiền</>}
                {" "}· Số chuyển thực tế do hệ thống tính khi tạo đợt.
              </p>
            </>
          )}
          <Field label="Mã giao dịch chuyển khoản" error={err.paymentReference}><input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} /></Field>
          <Field label="Ghi chú" error={err.note}><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        </>
      )}
    </FormModal>
  );
}

export default function PayoutsPage() {
  const names = useAffiliateNames();
  const [page, setPage] = useState(1);
  const list = useList<AdminPayout>("/payouts", { page, pageSize: 20, sort: "-paidAt" });
  const [create, setCreate] = useState(false);
  const [detail, setDetail] = useState<AdminPayout | null>(null);
  const { adm } = useAdmin();
  const [full, setFull] = useState<AdminPayout | null>(null);

  async function open(p: AdminPayout) { setDetail(p); setFull(null); try { setFull((await adm<AdminPayout>(`/payouts/${p.id}`)).data); } catch { setFull(p); } }

  return (
    <>
      <div className="ad-head"><h1>Đợt chi trả</h1><button className="ad-btn primary" onClick={() => setCreate(true)}>+ Tạo đợt chi trả</button></div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Thời điểm</th><th>CTV</th><th className="num">Thực chuyển</th><th className="num">Đã trừ</th><th>Mã giao dịch</th><th></th></tr></thead>
            <tbody>
              {list.data.items.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.paidAt)}</td><td>{names.nameOf(p.affiliateId)}</td>
                  <td className="num"><b>{formatVnd(p.totalAmount)}</b></td>
                  <td className="num">{p.adjustmentAmount > 0 ? <Badge tone="red">−{formatVnd(p.adjustmentAmount)}</Badge> : "—"}</td>
                  <td>{p.paymentReference ?? "—"}</td>
                  <td className="actions"><button className="ad-btn small" onClick={() => void open(p)}>Chi tiết</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      {create && <CreatePayoutModal onClose={() => setCreate(false)} onDone={list.reload} />}
      {detail && (
        <Modal title="Chi tiết đợt chi trả" wide onClose={() => setDetail(null)}>
          <dl className="ad-dl">
            <dt>CTV</dt><dd>{names.nameOf(detail.affiliateId)}</dd><dt>Thực chuyển</dt><dd><b>{formatVnd(detail.totalAmount)}</b></dd>
            <dt>Mã giao dịch</dt><dd>{detail.paymentReference ?? "—"}</dd><dt>Ghi chú</dt><dd>{detail.note ?? "—"}</dd>
          </dl>
          {!full ? <Loading loading /> : (
            <>
              <h2>Hoa hồng trong đợt</h2>
              <ul>{(full.commissions ?? []).map((c) => <li key={c.id}>{c.orderCode}: {formatVnd(c.amount)}</li>)}</ul>
              {(full.adjustments ?? []).length > 0 && <><h2>Khoản trừ đã áp dụng</h2><ul>{full.adjustments!.map((a) => <li key={a.id}>{a.orderCode}: −{formatVnd(a.amount)}</li>)}</ul></>}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
