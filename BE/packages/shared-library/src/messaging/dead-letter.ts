import * as amqp from 'amqplib';

/**
 * Công cụ xử lý dead-letter queue (DLQ). Message vào DLQ khi consumer xử lý lỗi hết số lần thử (xem RabbitMqClient.subscribe).
 * Sau khi sửa nguyên nhân (lỗi mã, service phụ thuộc sập...), dùng `requeueDeadLetters` để đưa message về queue gốc xử lý lại.
 * Consumer đều idempotent (inbox) nên đưa lại message đã xử lý một phần là an toàn.
 */

const QUEUE_RE = /^[a-z0-9][a-z0-9_.-]{0,100}$/;
const ATTEMPT_HEADER = 'x-attempt';
/** Header RabbitMQ tự thêm khi dead-letter; bỏ đi khi đưa lại để message "sạch" như mới. */
const DEATH_HEADERS = ['x-death', 'x-first-death-exchange', 'x-first-death-queue', 'x-first-death-reason'];

export interface DeadLetterInfo {
  messageId: string | null;
  type: string | null;
  /** Số lần đã thử xử lý trước khi vào DLQ. */
  attempts: number;
  /** Lý do dead-letter theo RabbitMQ (vd "rejected"). */
  reason: string | null;
  occurredAt: string | null;
  /** Nội dung đã giải mã (JSON); chuỗi thô nếu không phải JSON. */
  body: unknown;
}

export interface RequeueOptions {
  /** Số message tối đa xử lý trong một lần. Mặc định 100. */
  limit?: number;
  /** Chỉ đưa lại các message có mã này. Bỏ trống = tất cả (tới `limit`). */
  messageIds?: string[];
}

function dlqName(queue: string): string {
  if (!QUEUE_RE.test(queue) || queue.endsWith('.dlq')) {
    throw new Error(`Tên queue không hợp lệ: "${queue}" (nhập tên queue gốc, vd affiliate.commission, không kèm .dlq)`);
  }
  return `${queue}.dlq`;
}

function describe(msg: amqp.GetMessage): DeadLetterInfo {
  const text = msg.content.toString('utf8');
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* giữ chuỗi thô */ }
  const death = (msg.properties.headers?.['x-death'] as Array<{ reason?: string }> | undefined)?.[0];
  return {
    messageId: msg.properties.messageId ?? null,
    type: msg.properties.type ?? null,
    attempts: Number(msg.properties.headers?.[ATTEMPT_HEADER] ?? 1),
    reason: death?.reason ?? null,
    occurredAt: msg.properties.timestamp ? new Date(msg.properties.timestamp * 1000).toISOString() : null,
    body,
  };
}

async function withChannel<T>(url: string, fn: (ch: amqp.ConfirmChannel) => Promise<T>): Promise<T> {
  const connection = await amqp.connect(url, { clientProperties: { connection_name: 'dlq-tool' } });
  try {
    const ch = await connection.createConfirmChannel();
    return await fn(ch);
  } finally {
    await connection.close().catch(() => undefined);
  }
}

/**
 * ack/nack trong AMQP là gửi-rồi-quên: nếu đóng kết nối ngay, broker có thể chưa xử lý xong và coi như chưa ack (message ở lại DLQ).
 * Một lời gọi đồng bộ trên cùng kênh buộc broker xử lý hết các lệnh trước đó rồi mới trả lời.
 */
async function settle(ch: amqp.Channel, dlq: string): Promise<void> {
  await ch.checkQueue(dlq);
}

/** Lấy tối đa `limit` message khỏi DLQ (chưa ack) để xem/xử lý. Message nào không dùng tới phải được trả lại bằng `nack(requeue)`. */
async function fetchBatch(ch: amqp.Channel, dlq: string, limit: number): Promise<amqp.GetMessage[]> {
  const batch: amqp.GetMessage[] = [];
  while (batch.length < limit) {
    const msg = await ch.get(dlq, { noAck: false });
    if (!msg) break;
    batch.push(msg);
  }
  return batch;
}

/** Xem các message trong DLQ của `queue` mà không lấy đi (vẫn còn trong DLQ sau khi xem). `total` là số message hiện có. */
export async function listDeadLetters(url: string, queue: string, limit = 50): Promise<{ total: number; messages: DeadLetterInfo[] }> {
  const dlq = dlqName(queue);
  return withChannel(url, async (ch) => {
    await ch.assertQueue(dlq, { durable: true });
    const total = (await ch.checkQueue(dlq)).messageCount;
    const batch = await fetchBatch(ch, dlq, limit);
    const messages = batch.map(describe);
    for (const m of batch) ch.nack(m, false, true); // trả lại DLQ
    await settle(ch, dlq);
    return { total, messages };
  });
}

/**
 * Đưa message trong DLQ về queue gốc để xử lý lại (số lần thử được đặt lại). Chỉ xóa khỏi DLQ sau khi broker đã xác nhận
 * ghi bền ở queue gốc, nên lỗi giữa chừng không làm mất message (tệ nhất là xử lý lại hai lần, và consumer idempotent).
 */
export async function requeueDeadLetters(url: string, queue: string, options: RequeueOptions = {}): Promise<{ requeued: number; kept: number }> {
  const dlq = dlqName(queue);
  const wanted = options.messageIds ? new Set(options.messageIds) : null;
  return withChannel(url, async (ch) => {
    await ch.assertQueue(dlq, { durable: true });
    const batch = await fetchBatch(ch, dlq, options.limit ?? 100);
    let requeued = 0;
    let kept = 0;
    for (const msg of batch) {
      const id = msg.properties.messageId as string | undefined;
      if (wanted && !(id && wanted.has(id))) { ch.nack(msg, false, true); kept++; continue; }
      const headers = { ...(msg.properties.headers ?? {}) } as Record<string, unknown>;
      delete headers[ATTEMPT_HEADER];
      for (const h of DEATH_HEADERS) delete headers[h];
      headers['x-requeued-from-dlq-at'] = new Date().toISOString();
      try {
        await new Promise<void>((resolve, reject) => {
          ch.sendToQueue(queue, msg.content, { ...msg.properties, persistent: true, headers }, (err) => (err ? reject(err) : resolve()));
        });
        ch.ack(msg);
        requeued++;
      } catch (e) {
        ch.nack(msg, false, true); // không đưa lại được: giữ nguyên trong DLQ
        kept++;
        await settle(ch, dlq);
        throw e;
      }
    }
    await settle(ch, dlq);
    return { requeued, kept };
  });
}

/** Bỏ hẳn các message chỉ định khỏi DLQ (không xử lý lại nữa). Bắt buộc nêu rõ mã message, không có xóa hàng loạt. */
export async function discardDeadLetters(url: string, queue: string, messageIds: string[], limit = 1000): Promise<{ discarded: number }> {
  if (messageIds.length === 0) throw new Error('Phải nêu rõ mã message cần bỏ');
  const dlq = dlqName(queue);
  const wanted = new Set(messageIds);
  return withChannel(url, async (ch) => {
    await ch.assertQueue(dlq, { durable: true });
    const batch = await fetchBatch(ch, dlq, limit);
    let discarded = 0;
    for (const msg of batch) {
      const id = msg.properties.messageId as string | undefined;
      if (id && wanted.has(id)) { ch.ack(msg); discarded++; } else ch.nack(msg, false, true);
    }
    await settle(ch, dlq);
    return { discarded };
  });
}

/** Danh sách các DLQ và số message, lấy từ API quản trị của RabbitMQ (cổng 15672). */
export async function listDeadLetterQueues(managementUrl: string, user: string, password: string): Promise<Array<{ queue: string; messages: number }>> {
  const res = await fetch(`${managementUrl.replace(/\/+$/, '')}/api/queues`, {
    headers: { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`API quản trị RabbitMQ trả ${res.status}`);
  const queues = (await res.json()) as Array<{ name: string; messages?: number }>;
  return queues.filter((q) => q.name.endsWith('.dlq')).map((q) => ({ queue: q.name.slice(0, -4), messages: q.messages ?? 0 })).sort((a, b) => a.queue.localeCompare(b.queue));
}
