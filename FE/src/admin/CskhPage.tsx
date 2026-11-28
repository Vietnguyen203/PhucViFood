import { useState } from "react";
import { Link } from "react-router";
import { formatVnd } from "../lib/money";
import { CARE_CHANNEL_LABEL } from "../lib/admin/types";
import { Badge, ErrorBox, Loading, Pager, fmtDateTime, useList } from "./ui";

interface QueueItem {
  id: string; code: string; shipName: string; shipPhone: string; totalAmount: number; deliveredAt: string | null; daysWaiting: number; careNoteCount: number;
  lastCareNote: { note: string; contactChannel: string | null; contactedAt: string } | null;
}

/** Đơn đã giao nhưng chưa hoàn tất: cần CSKH liên hệ xác nhận khách đã nhận, đơn giao lâu nhất lên đầu. */
export default function CskhPage() {
  const [page, setPage] = useState(1);
  const list = useList<QueueItem>("/orders/cskh-queue", { page, pageSize: 20 });
  return (
    <>
      <div className="ad-head"><h1>Hàng chờ CSKH</h1></div>
      <p className="ad-muted">Đơn đã giao chưa hoàn tất. Liên hệ khách xác nhận đã nhận hàng, ghi nhận trong đơn rồi hoàn tất (hoặc hoàn trả).</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Mã đơn</th><th>Khách nhận</th><th>Giao lúc</th><th>Đã chờ</th><th className="num">Tổng tiền</th><th>Lần liên hệ gần nhất</th></tr></thead>
            <tbody>
              {list.data.items.map((o) => (
                <tr key={o.id}>
                  <td><Link className="ad-link" to={`/admin/orders/${o.id}`}><b>{o.code}</b></Link></td>
                  <td>{o.shipName}<div className="ad-muted">{o.shipPhone}</div></td>
                  <td>{fmtDateTime(o.deliveredAt)}</td>
                  <td><Badge tone={o.daysWaiting >= 7 ? "red" : o.daysWaiting >= 3 ? "amber" : "gray"}>{o.daysWaiting} ngày</Badge></td>
                  <td className="num">{formatVnd(o.totalAmount)}</td>
                  <td>
                    {o.lastCareNote ? (
                      <>{o.lastCareNote.contactChannel && <Badge>{CARE_CHANNEL_LABEL[o.lastCareNote.contactChannel] ?? o.lastCareNote.contactChannel}</Badge>} {o.lastCareNote.note}
                        <div className="ad-muted">{fmtDateTime(o.lastCareNote.contactedAt)} · {o.careNoteCount} lần</div></>
                    ) : <span className="ad-muted">Chưa liên hệ</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </>
  );
}
