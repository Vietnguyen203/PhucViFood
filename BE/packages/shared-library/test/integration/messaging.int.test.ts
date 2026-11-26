// Test tích hợp: Postgres + RabbitMQ thật. Chạy: pnpm --filter @phucvi/shared-library test:integration
// Cần: docker compose up (postgres + rabbitmq) và đã `db:migrate` + `db:generate`.
import * as amqp from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient as UserClient } from '../../../../services/user/generated/client';
import { PrismaClient as AffiliateClient } from '../../../../services/affiliate/generated/client';
import { EventTypes, type EventEnvelope } from '../../src/contracts';
import {
  discardDeadLetters, Inbox, listDeadLetterQueues, listDeadLetters, MessagingMaintenance, OutboxRelay, OutboxWriter, RabbitMqClient,
  requeueDeadLetters, type EventPublisher,
} from '../../src/messaging';
import { uuidv7 } from '../../src/utils';

const enabled = process.env.RUN_INTEGRATION === '1';
const USER_URL = process.env.USER_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/user_db';
const AFFILIATE_URL = process.env.AFFILIATE_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/affiliate_db';
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://phucvi:phucvi@localhost:5672';

const AGG = 'IntTestAggregate'; // đánh dấu dữ liệu test để dọn
const TABLE = { schema: 'user' }; // user.outbox_events (từ khóa Postgres nên đã được quote)

describe.skipIf(!enabled)('messaging tích hợp (Postgres + RabbitMQ thật)', () => {
  let user: UserClient;
  let affiliate: AffiliateClient;
  let rabbit: RabbitMqClient;
  let raw: Awaited<ReturnType<typeof amqp.connect>>;
  const queues: string[] = [];
  const consumers: string[] = [];

  const writer = new OutboxWriter(TABLE, 'user');
  const newId = () => uuidv7();

  const userCreated = (aggregateId: string, email: string) => ({
    type: EventTypes.USER_CREATED, aggregateType: AGG, aggregateId,
    payload: { userId: aggregateId, email, role: 'AFFILIATE' as const },
  });

  async function outboxRow(id: string) {
    const rows = await user.$queryRawUnsafe<Array<{ published_at: Date | null; attempts: number; last_error: string | null; next_attempt_at: Date }>>(
      `SELECT published_at, attempts, last_error, next_attempt_at FROM "user".outbox_events WHERE id = $1::uuid`, id,
    );
    return rows[0];
  }

  async function waitFor<T>(fn: () => Promise<T | undefined> | T | undefined, ms = 8000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const v = await fn();
      if (v !== undefined) return v;
      if (Date.now() - start > ms) throw new Error('Hết thời gian chờ');
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  beforeAll(async () => {
    user = new UserClient({ datasources: { db: { url: USER_URL } } });
    affiliate = new AffiliateClient({ datasources: { db: { url: AFFILIATE_URL } } });
    rabbit = new RabbitMqClient({ url: RABBIT_URL, serviceName: 'user' });
    await rabbit.connect(5);
    raw = await amqp.connect(RABBIT_URL);
    await user.$executeRawUnsafe(`DELETE FROM "user".outbox_events WHERE aggregate_type = $1`, AGG);
  });

  afterAll(async () => {
    await user.$executeRawUnsafe(`DELETE FROM "user".outbox_events WHERE aggregate_type = $1`, AGG);
    await affiliate.$executeRawUnsafe(`DELETE FROM commission.inbox_events WHERE consumer LIKE 'int-test-%'`);
    await rabbit.close();
    const ch = await raw.createChannel();
    for (const q of queues) { await ch.deleteQueue(q).catch(() => undefined); await ch.deleteQueue(`${q}.dlq`).catch(() => undefined); }
    await raw.close();
    await user.$disconnect();
    await affiliate.$disconnect();
    void consumers;
  });

  it('outbox -> relay -> RabbitMQ -> consumer: nhận đúng phong bì, dòng outbox được đánh dấu đã gửi', async () => {
    const queue = `int.e2e.${newId()}`;
    queues.push(queue);
    const received: EventEnvelope[] = [];
    await rabbit.subscribe({ queue, routingKeys: [EventTypes.USER_CREATED], handler: async (e) => { received.push(e); } });

    const aggregateId = newId();
    const envelope = await user.$transaction((tx) => writer.add(tx, userCreated(aggregateId, 'a@example.com')));
    expect((await outboxRow(envelope.id)).published_at).toBeNull();

    const relay = new OutboxRelay(user, TABLE, rabbit);
    const res = await relay.runOnce();
    expect(res.published).toBeGreaterThanOrEqual(1);

    const got = await waitFor(() => received.find((e) => e.id === envelope.id));
    expect(got).toEqual(envelope);
    expect((await outboxRow(envelope.id)).published_at).toBeInstanceOf(Date);
  });

  it('transaction rollback thì KHÔNG có sự kiện trong outbox', async () => {
    const aggregateId = newId();
    let eventId = '';
    await expect(user.$transaction(async (tx) => {
      const env = await writer.add(tx, userCreated(aggregateId, 'rollback@example.com'));
      eventId = env.id;
      throw new Error('nghiệp vụ lỗi sau khi ghi outbox');
    })).rejects.toThrow('nghiệp vụ lỗi');
    expect(await outboxRow(eventId)).toBeUndefined();
  });

  it('gửi lỗi: tăng attempts, ghi last_error, hẹn thử lại (backoff) và chưa bị gửi lại ngay', async () => {
    const env = await user.$transaction((tx) => writer.add(tx, userCreated(newId(), 'retry@example.com')));
    const failing: EventPublisher = { publish: async () => { throw new Error('broker sập'); } };
    const relay = new OutboxRelay(user, TABLE, failing, { baseBackoffMs: 60_000 });
    const first = await relay.runOnce();
    expect(first.failed).toBeGreaterThanOrEqual(1);
    const row = await outboxRow(env.id);
    expect(row).toMatchObject({ attempts: 1, last_error: 'broker sập' });
    expect(row.published_at).toBeNull();
    expect(row.next_attempt_at.getTime()).toBeGreaterThan(Date.now() + 30_000);

    const seen: string[] = [];
    await new OutboxRelay(user, TABLE, { publish: async (e) => { seen.push(e.id); } }).runOnce();
    expect(seen).not.toContain(env.id); // còn đang chờ backoff
  });

  it('đúng thứ tự theo aggregate: sự kiện sau không vượt mặt sự kiện trước đang lỗi', async () => {
    const aggregateId = newId();
    const ids: string[] = [];
    for (const n of [1, 2, 3]) ids.push((await user.$transaction((tx) => writer.add(tx, userCreated(aggregateId, `order-${n}@example.com`)))).id);

    const log: string[] = [];
    let failFirstOnce = true;
    const flaky: EventPublisher = {
      publish: async (e) => {
        if (!ids.includes(e.id)) return; // bỏ qua sự kiện của test khác
        if (e.id === ids[0] && failFirstOnce) { failFirstOnce = false; throw new Error('lỗi tạm thời'); }
        log.push(e.id);
      },
    };
    const relay = new OutboxRelay(user, TABLE, flaky, { baseBackoffMs: 0 });

    await relay.runOnce(); // sự kiện 1 lỗi => 2 và 3 phải bị giữ lại
    expect(log).toEqual([]);
    for (let i = 0; i < 6 && log.length < 3; i++) await relay.runOnce();
    expect(log).toEqual(ids); // gửi đúng thứ tự 1, 2, 3
  });

  it('hai relay chạy song song không gửi trùng (FOR UPDATE SKIP LOCKED)', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push((await user.$transaction((tx) => writer.add(tx, userCreated(newId(), `p${i}@example.com`)))).id);

    const counts = new Map<string, number>();
    const slow: EventPublisher = {
      publish: async (e) => {
        await new Promise((r) => setTimeout(r, 15));
        if (ids.includes(e.id)) counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
      },
    };
    const mk = () => new OutboxRelay(user, TABLE, slow, { batchSize: 7 });
    const [a, b] = [mk(), mk()];
    for (let i = 0; i < 6; i++) await Promise.all([a.runOnce(), b.runOnce()]);

    expect(counts.size).toBe(20);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
  });

  it('inbox: xử lý trùng chỉ chạy handler một lần; handler lỗi thì rollback cả dòng inbox để thử lại', async () => {
    const inbox = new Inbox({ schema: 'commission' });
    const consumer = `int-test-${newId()}`;
    const messageId = newId();
    let calls = 0;
    const run = () => affiliate.$transaction((tx) => inbox.processOnce(tx, messageId, consumer, async () => { calls++; return calls; }));

    expect(await run()).toEqual({ processed: true, result: 1 });
    expect(await run()).toEqual({ processed: false });
    expect(calls).toBe(1);

    const failingId = newId();
    await expect(affiliate.$transaction((tx) => inbox.processOnce(tx, failingId, consumer, async () => { throw new Error('lỗi xử lý'); }))).rejects.toThrow('lỗi xử lý');
    const retried = await affiliate.$transaction((tx) => inbox.processOnce(tx, failingId, consumer, async () => 'ok'));
    expect(retried).toEqual({ processed: true, result: 'ok' }); // lần đầu đã rollback nên lần này vẫn được xử lý
  });

  it('consumer: lỗi lần đầu rồi thành công ở lần thử lại', async () => {
    const queue = `int.retry.${newId()}`;
    queues.push(queue);
    let attempts = 0;
    const done: string[] = [];
    await rabbit.subscribe({
      queue, routingKeys: [EventTypes.USER_CREATED], retryDelayMs: 50, maxAttempts: 3,
      handler: async (e) => { attempts++; if (attempts === 1) throw new Error('lỗi tạm'); done.push(e.id); },
    });
    const env = await user.$transaction((tx) => writer.add(tx, userCreated(newId(), 'consumer-retry@example.com')));
    await new OutboxRelay(user, TABLE, rabbit).runOnce();
    await waitFor(() => (done.includes(env.id) ? true : undefined));
    expect(attempts).toBe(2);
  });

  it('consumer: lỗi mãi thì sau maxAttempts chuyển vào dead-letter queue', async () => {
    const queue = `int.dlq.${newId()}`;
    queues.push(queue);
    let attempts = 0;
    await rabbit.subscribe({
      queue, routingKeys: [EventTypes.USER_CREATED], retryDelayMs: 30, maxAttempts: 2,
      handler: async () => { attempts++; throw new Error('luôn lỗi'); },
    });
    const env = await user.$transaction((tx) => writer.add(tx, userCreated(newId(), 'dlq@example.com')));
    await new OutboxRelay(user, TABLE, rabbit).runOnce();

    const ch = await raw.createChannel();
    const dead = await waitFor(async () => {
      const m = await ch.get(`${queue}.dlq`, { noAck: true });
      return m ? (JSON.parse(m.content.toString()) as EventEnvelope) : undefined;
    });
    expect(dead.id).toBe(env.id);
    expect(attempts).toBe(2);
    await ch.close();
  });
  // ═════════════════════════ Vận hành: dọn outbox/inbox ═════════════════════════
  it('dọn định kỳ: xóa outbox đã gửi và inbox đã xử lý quá hạn; giữ nguyên phần còn lại (schema cô lập)', async () => {
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
    await user.$executeRawUnsafe(`DROP SCHEMA IF EXISTS it_purge CASCADE`);
    await user.$executeRawUnsafe(`CREATE SCHEMA it_purge`);
    try {
      await user.$executeRawUnsafe(`CREATE TABLE it_purge.outbox_events (id uuid PRIMARY KEY, published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`);
      await user.$executeRawUnsafe(`CREATE TABLE it_purge.inbox_events (id uuid PRIMARY KEY, processed_at timestamptz NOT NULL)`);
      const [oldSent, recentSent, oldUnsent, oldSeen, recentSeen] = [newId(), newId(), newId(), newId(), newId()];
      const out = (id: string, published: Date | null, created: Date) =>
        user.$executeRawUnsafe(`INSERT INTO it_purge.outbox_events (id, published_at, created_at) VALUES ($1::uuid, $2, $3)`, id, published, created);
      await out(oldSent, ago(10), ago(10));
      await out(recentSent, ago(1), ago(1));
      await out(oldUnsent, null, ago(30)); // chưa gửi: TUYỆT ĐỐI không được xóa dù đã cũ
      await user.$executeRawUnsafe(`INSERT INTO it_purge.inbox_events (id, processed_at) VALUES ($1::uuid, $2), ($3::uuid, $4)`, oldSeen, ago(40), recentSeen, ago(10));

      const r = await new MessagingMaintenance(user, ['it_purge'], ['it_purge']).runOnce(); // mặc định: outbox 7 ngày, inbox 30 ngày
      expect(r).toEqual({ outbox: 1, inbox: 1 });
      const left = async (t: string) => (await user.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id::text FROM it_purge.${t}`)).map((x) => x.id).sort();
      expect(await left('outbox_events')).toEqual([recentSent, oldUnsent].sort());
      expect(await left('inbox_events')).toEqual([recentSeen]);
      expect(await new MessagingMaintenance(user, ['it_purge'], ['it_purge']).runOnce()).toEqual({ outbox: 0, inbox: 0 }); // chạy lại không xóa thêm
    } finally {
      await user.$executeRawUnsafe(`DROP SCHEMA IF EXISTS it_purge CASCADE`);
    }
  });

  // ═════════════════════════ Vận hành: dead-letter queue ═════════════════════════
  it('DLQ: xem không lấy đi, bỏ message chỉ định, đưa lại về queue gốc để xử lý lại sau khi sửa lỗi', async () => {
    const queue = `int.dlqtool.${newId()}`;
    queues.push(queue);
    let broken = true;
    const handled: string[] = [];
    await rabbit.subscribe({
      queue, routingKeys: [EventTypes.USER_CREATED], retryDelayMs: 20, maxAttempts: 1,
      handler: async (e) => { if (broken) throw new Error('lỗi do mã'); handled.push(e.id); },
    });
    const keep = await user.$transaction((tx) => writer.add(tx, userCreated(newId(), 'dlq-keep@example.com')));
    const drop = await user.$transaction((tx) => writer.add(tx, userCreated(newId(), 'dlq-drop@example.com')));
    await new OutboxRelay(user, TABLE, rabbit).runOnce();

    const listed = await waitFor(async () => { const l = await listDeadLetters(RABBIT_URL, queue); return l.total === 2 ? l : undefined; });
    expect(listed.messages.map((m) => m.messageId).sort()).toEqual([keep.id, drop.id].sort());
    expect(listed.messages[0]).toMatchObject({ type: EventTypes.USER_CREATED, attempts: 1 });
    expect((listed.messages.find((m) => m.messageId === keep.id)!.body as EventEnvelope<'user.user.created'>).payload.email).toBe('dlq-keep@example.com');
    expect((await listDeadLetters(RABBIT_URL, queue)).total).toBe(2); // xem không làm mất message

    // Danh sách các DLQ qua API quản trị RabbitMQ (số liệu cập nhật chậm vài giây).
    const found = await waitFor(async () => {
      const all = await listDeadLetterQueues('http://localhost:15672', 'phucvi', 'phucvi');
      return all.find((d) => d.queue === queue);
    }, 15_000);
    expect(found).toBeTruthy();

    expect(await discardDeadLetters(RABBIT_URL, queue, [drop.id])).toEqual({ discarded: 1 });
    expect((await listDeadLetters(RABBIT_URL, queue)).total).toBe(1);

    // Chưa sửa lỗi hoặc chỉ định sai mã: không đưa gì về queue gốc.
    expect(await requeueDeadLetters(RABBIT_URL, queue, { messageIds: [newId()] })).toEqual({ requeued: 0, kept: 1 });
    expect((await listDeadLetters(RABBIT_URL, queue)).total).toBe(1);

    broken = false; // "sửa lỗi"
    expect(await requeueDeadLetters(RABBIT_URL, queue, { messageIds: [keep.id] })).toEqual({ requeued: 1, kept: 0 });
    await waitFor(() => (handled.includes(keep.id) ? true : undefined));
    expect(handled).not.toContain(drop.id);
    expect((await listDeadLetters(RABBIT_URL, queue)).total).toBe(0);
  });

  it('DLQ: số lần thử được đặt lại khi đưa về, và tên queue sai bị từ chối', async () => {
    const queue = `int.dlqretry.${newId()}`;
    queues.push(queue);
    let attempts = 0;
    let broken = true;
    await rabbit.subscribe({
      queue, routingKeys: [EventTypes.USER_CREATED], retryDelayMs: 20, maxAttempts: 2,
      handler: async () => { attempts++; if (broken) throw new Error('lỗi'); },
    });
    const env = await user.$transaction((tx) => writer.add(tx, userCreated(newId(), 'dlq-retry@example.com')));
    await new OutboxRelay(user, TABLE, rabbit).runOnce();
    const l = await waitFor(async () => { const x = await listDeadLetters(RABBIT_URL, queue); return x.total === 1 ? x : undefined; });
    expect(l.messages[0]).toMatchObject({ messageId: env.id, attempts: 2 });
    const before = attempts;

    // Đưa về mà vẫn lỗi: được thử đủ số lần mới (không bị coi là đã hết lượt ngay) rồi lại vào DLQ.
    await requeueDeadLetters(RABBIT_URL, queue);
    await waitFor(async () => { const x = await listDeadLetters(RABBIT_URL, queue); return x.total === 1 && attempts >= before + 2 ? x : undefined; });
    expect(attempts).toBe(before + 2);
    broken = false;
    await requeueDeadLetters(RABBIT_URL, queue);
    await waitFor(async () => ((await listDeadLetters(RABBIT_URL, queue)).total === 0 && attempts === before + 3 ? true : undefined));

    for (const bad of ['', 'Hoa.Thuong', 'a b', 'x.dlq', '../x']) await expect(listDeadLetters(RABBIT_URL, bad)).rejects.toThrow(/không hợp lệ/);
    await expect(discardDeadLetters(RABBIT_URL, queue, [])).rejects.toThrow(/mã message/);
  });
});
