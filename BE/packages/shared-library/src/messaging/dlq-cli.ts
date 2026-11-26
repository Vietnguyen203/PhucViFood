// Công cụ dòng lệnh xử lý dead-letter queue. Chạy từ gốc repo:
//   pnpm dlq                                  liệt kê các DLQ đang có message
//   pnpm dlq list <queue> [--limit N]         xem message trong DLQ của <queue> (không lấy đi)
//   pnpm dlq requeue <queue> [--limit N] [--id <messageId> ...]   đưa về queue gốc xử lý lại
//   pnpm dlq discard <queue> --id <messageId> [--id ...]          bỏ hẳn message chỉ định
// <queue> là tên queue gốc (vd affiliate.commission), không kèm ".dlq". Cần RABBITMQ_URL (đọc từ .env ở gốc repo).
import { discardDeadLetters, listDeadLetterQueues, listDeadLetters, requeueDeadLetters } from './dead-letter';

function parseArgs(argv: string[]): { positional: string[]; limit?: number; ids: string[] } {
  const positional: string[] = [];
  const ids: string[] = [];
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') limit = Number(argv[++i]);
    else if (a === '--id') ids.push(argv[++i]);
    else positional.push(a);
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit phải là số nguyên dương');
  if (ids.some((id) => !id)) throw new Error('--id cần kèm mã message');
  return { positional, limit, ids };
}

async function main(): Promise<void> {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('Thiếu RABBITMQ_URL');
  const { positional, limit, ids } = parseArgs(process.argv.slice(2));
  const [cmd, q] = positional;

  if (!cmd || cmd === 'queues') {
    const u = new URL(url);
    const mgmt = process.env.RABBITMQ_MANAGEMENT_URL ?? `http://${u.hostname}:${process.env.RABBITMQ_MANAGEMENT_PORT ?? '15672'}`;
    const list = await listDeadLetterQueues(mgmt, decodeURIComponent(u.username), decodeURIComponent(u.password));
    if (list.length === 0) { console.log('Chưa có dead-letter queue nào.'); return; }
    for (const d of list) console.log(`${String(d.messages).padStart(5)}  ${d.queue}${d.messages > 0 ? '   <-- có message cần xử lý' : ''}`);
    return;
  }
  if (!q) throw new Error('Thiếu tên queue. Ví dụ: pnpm dlq list affiliate.commission');

  if (cmd === 'list') {
    const r = await listDeadLetters(url, q, limit ?? 50);
    console.log(`DLQ của ${q}: ${r.total} message (hiển thị ${r.messages.length})`);
    for (const m of r.messages) console.log(JSON.stringify({ messageId: m.messageId, type: m.type, attempts: m.attempts, reason: m.reason, occurredAt: m.occurredAt, body: m.body }, null, 2));
  } else if (cmd === 'requeue') {
    const r = await requeueDeadLetters(url, q, { limit, messageIds: ids.length ? ids : undefined });
    console.log(`Đã đưa ${r.requeued} message về queue ${q}; giữ lại ${r.kept} message trong DLQ.`);
  } else if (cmd === 'discard') {
    if (ids.length === 0) throw new Error('discard cần --id <messageId> (không bỏ hàng loạt)');
    const r = await discardDeadLetters(url, q, ids);
    console.log(`Đã bỏ ${r.discarded} message khỏi DLQ của ${q}.`);
  } else {
    throw new Error(`Lệnh không hợp lệ: ${cmd} (list, requeue, discard, hoặc để trống để liệt kê các DLQ)`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
