import { useState } from "react";
import { AFFILIATE_STATUS_LABEL, type AdminAffiliate } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { IconButton } from "./icons";
import { Badge, ConfirmModal, ErrorBox, Field, FilterBar, FormModal, Loading, Modal, Pager, SortHeader, fmtBps, fmtDate, useList, useListFilters } from "./ui";

const tone = (s: string) => (s === "ACTIVE" ? "green" : s === "PENDING" ? "amber" : s === "SUSPENDED" ? "blue" : "red") as "green" | "amber" | "blue" | "red";
const dateOnly = (v: string | null) => (v ? v.slice(0, 10) : "");
const toBps = (percent: string) => (percent.trim() === "" ? undefined : Math.round(Number(percent.replace(",", ".")) * 100));

/** Tên CTV theo id, dùng cho các màn hoa hồng, chi trả, khoản trừ (backend chỉ trả affiliateId). */
export function useAffiliateNames() {
  const list = useList<AdminAffiliate>("/affiliates", { pageSize: 100, sort: "fullName" });
  const items = list.data?.items ?? [];
  const map = new Map(items.map((a) => [a.id, a]));
  return { map, items, nameOf: (id: string) => map.get(id)?.fullName ?? id.slice(0, 8) };
}

function ApproveModal({ a, onClose, onDone }: { a: AdminAffiliate; onClose: () => void; onDone: () => void }) {
  const { adm, notify } = useAdmin();
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState("");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  return (
    <FormModal title={`Duyệt CTV: ${a.fullName}`} submitLabel="Duyệt" onClose={onClose}
      onSubmit={async () => {
        await adm(`/affiliates/${a.id}/approve`, { method: "POST", body: { contractStart: start, contractEnd: end || undefined, commissionRateBps: toBps(rate), note: note.trim() || undefined } });
        notify("Đã duyệt cộng tác viên");
        onDone();
      }}>
      {(err) => (
        <>
          <div className="ad-grid2">
            <Field label="Hợp đồng bắt đầu *" error={err.contractStart}><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Hợp đồng kết thúc" error={err.contractEnd} hint="Để trống nếu không giới hạn."><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <Field label="Tỷ lệ hoa hồng (%)" error={err.commissionRateBps} hint="Để trống để dùng tỷ lệ mặc định của hệ thống."><input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="vd 10" /></Field>
          <Field label="Ghi chú" error={err.note}><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        </>
      )}
    </FormModal>
  );
}

function EditModal({ a, onClose, onDone }: { a: AdminAffiliate; onClose: () => void; onDone: () => void }) {
  const { adm, notify } = useAdmin();
  const [start, setStart] = useState(dateOnly(a.contractStart));
  const [end, setEnd] = useState(dateOnly(a.contractEnd));
  const [rate, setRate] = useState(a.commissionRateBps != null ? String(a.commissionRateBps / 100) : "");
  const [note, setNote] = useState(a.note ?? "");
  return (
    <FormModal title={`Sửa hợp đồng: ${a.fullName}`} onClose={onClose}
      onSubmit={async () => {
        await adm(`/affiliates/${a.id}`, { method: "PATCH", body: { contractStart: start || undefined, contractEnd: end || undefined, commissionRateBps: toBps(rate), note: note.trim() || undefined } });
        notify("Đã lưu");
        onDone();
      }}>
      {(err) => (
        <>
          <p className="ad-info">Tỷ lệ mới chỉ áp cho đơn đặt SAU khi lưu; đơn cũ giữ tỷ lệ đã chốt.</p>
          <div className="ad-grid2">
            <Field label="Hợp đồng bắt đầu" error={err.contractStart}><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Hợp đồng kết thúc" error={err.contractEnd}><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <Field label="Tỷ lệ hoa hồng (%)" error={err.commissionRateBps}><input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Ghi chú" error={err.note}><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        </>
      )}
    </FormModal>
  );
}

export default function AffiliatesPage() {
  const { adm } = useAdmin();
  const fl = useListFilters({ q: "", status: "" });
  const list = useList<AdminAffiliate>("/affiliates", { page: fl.page, pageSize: fl.pageSize, sort: fl.sort ?? "-createdAt", q: fl.applied.q, filters: { status: fl.applied.status } });
  const [approve, setApprove] = useState<AdminAffiliate | null>(null);
  const [edit, setEdit] = useState<AdminAffiliate | null>(null);
  const [detail, setDetail] = useState<AdminAffiliate | null>(null);
  const [act, setAct] = useState<{ a: AdminAffiliate; action: "reject" | "suspend" | "reactivate" } | null>(null);
  const LABEL = { reject: "Từ chối", suspend: "Tạm ngưng", reactivate: "Kích hoạt lại" };

  return (
    <>
      <div className="ad-head"><h1>Cộng tác viên</h1></div>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Tìm kiếm"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="Tên, SĐT, mã giới thiệu..." /></Field>
        <Field label="Trạng thái">
          <select value={fl.filters.status} onChange={(e) => fl.applyNow({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(AFFILIATE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><SortHeader label="Họ tên" field="fullName" sort={fl.sort} onSort={fl.toggleSort} /><SortHeader label="Mã" field="referralCode" sort={fl.sort} onSort={fl.toggleSort} /><th>Hợp đồng</th><th className="num">Hoa hồng</th><th>Trạng thái</th><SortHeader label="Đăng ký" field="createdAt" sort={fl.sort} onSort={fl.toggleSort} /><th></th></tr></thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td><button className="ad-link" onClick={() => setDetail(a)}><b>{a.fullName}</b></button><div className="ad-muted">{a.phone}</div></td>
                  <td>{a.referralCode}</td>
                  <td>{a.contractStart ? `${fmtDate(a.contractStart)} → ${a.contractEnd ? fmtDate(a.contractEnd) : "không giới hạn"}` : "—"}</td>
                  <td className="num">{a.commissionRateBps != null ? fmtBps(a.commissionRateBps) : "Mặc định"}</td>
                  <td><Badge tone={tone(a.status)}>{AFFILIATE_STATUS_LABEL[a.status] ?? a.status}</Badge></td>
                  <td>{fmtDate(a.createdAt)}</td>
                  <td className="actions">
                    <div className="ad-row-actions">
                      {a.status === "PENDING" && <><IconButton icon="check" label="Duyệt cộng tác viên" tone="primary" onClick={() => setApprove(a)} /><IconButton icon="close" label="Từ chối" tone="danger" onClick={() => setAct({ a, action: "reject" })} /></>}
                      {a.status === "ACTIVE" && <><IconButton icon="edit" label="Sửa hợp đồng" onClick={() => setEdit(a)} /><IconButton icon="pause" label="Tạm ngưng" tone="danger" onClick={() => setAct({ a, action: "suspend" })} /></>}
                      {a.status === "SUSPENDED" && <><IconButton icon="edit" label="Sửa hợp đồng" onClick={() => setEdit(a)} /><IconButton icon="play" label="Kích hoạt lại" tone="primary" onClick={() => setAct({ a, action: "reactivate" })} /></>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={fl.setPage} />

      {approve && <ApproveModal a={approve} onClose={() => setApprove(null)} onDone={list.reload} />}
      {edit && <EditModal a={edit} onClose={() => setEdit(null)} onDone={list.reload} />}
      {act && (
        <ConfirmModal title={`${LABEL[act.action]}: ${act.a.fullName}`} danger={act.action !== "reactivate"} confirmLabel={LABEL[act.action]} onClose={() => setAct(null)}
          message={act.action === "suspend" ? "CTV tạm ngưng sẽ không được ghi nhận đơn mới; hoa hồng đã phát sinh vẫn giữ." : act.action === "reject" ? "Đơn đăng ký bị từ chối." : "CTV hoạt động trở lại."}
          reason={{ label: "Ghi chú" }}
          onConfirm={async (note) => { await adm(`/affiliates/${act.a.id}/${act.action}`, { method: "POST", body: note ? { note } : {} }); list.reload(); }} />
      )}
      {detail && (
        <Modal title={detail.fullName} onClose={() => setDetail(null)}>
          <dl className="ad-dl">
            <dt>Mã giới thiệu</dt><dd>{detail.referralCode}</dd><dt>SĐT</dt><dd>{detail.phone}</dd>
            <dt>Ngân hàng</dt><dd>{detail.bankName ?? "—"}</dd><dt>Số tài khoản</dt><dd>{detail.bankAccountNo ?? "—"}</dd><dt>Chủ tài khoản</dt><dd>{detail.bankAccountHolder ?? "—"}</dd>
            <dt>Duyệt lúc</dt><dd>{fmtDate(detail.approvedAt)}</dd><dt>Ghi chú</dt><dd>{detail.note ?? "—"}</dd>
          </dl>
        </Modal>
      )}
    </>
  );
}
