// Test tích hợp: Postgres + RabbitMQ thật. Chạy: pnpm --filter @phucvi/shared-library test:integration
// Cần: docker compose up (postgres + rabbitmq) và đã `db:migrate` + `db:generate`.
import * as amqp from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient as UserClient } from '../../../../services/user/generated/client';
import { PrismaClient as AffiliateClient } from '../../../../services/affiliate/generated/client';
import { EventTypes, type EventEnvelope } from '../../src/contracts';
import { Inbox, OutboxRelay, OutboxWriter, RabbitMqClient, type EventPublisher } from '../../src/messaging';
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
});
