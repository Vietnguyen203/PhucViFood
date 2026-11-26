import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PURGE, MessagingMaintenance, purgeOptionsFromEnv, purgeProcessedInbox } from '../src/messaging';

/** Executor giả: ghi lại câu SQL và tham số; có thể cho một câu lỗi và đặt số dòng "đã xóa". */
function fakeExecutor(opts: { failOn?: string; rows?: number } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return {
    calls,
    $executeRawUnsafe: vi.fn(async (sql: string, ...values: unknown[]) => {
      calls.push({ sql, values });
      if (opts.failOn && sql.includes(opts.failOn)) throw new Error('lỗi giả lập');
      return opts.rows ?? 2;
    }),
    $queryRawUnsafe: vi.fn(async () => [] as never),
  };
}
const logger = () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('purgeOptionsFromEnv', () => {
  it('không có biến thì để mặc định, không cảnh báo, bật dọn dẹp', () => {
    const r = purgeOptionsFromEnv({});
    expect(r.warnings).toEqual([]);
    expect(r.options).toMatchObject({ enabled: true, outboxRetentionDays: undefined, inboxRetentionDays: undefined, intervalMs: undefined });
  });
  it('đọc giá trị hợp lệ; OUTBOX_PURGE_ENABLED=false tắt', () => {
    const r = purgeOptionsFromEnv({ OUTBOX_PURGE_ENABLED: 'false', OUTBOX_RETENTION_DAYS: '14', INBOX_RETENTION_DAYS: '60', MAINTENANCE_INTERVAL_MS: '5000' });
    expect(r.options).toEqual({ enabled: false, outboxRetentionDays: 14, inboxRetentionDays: 60, intervalMs: 5000 });
    expect(r.warnings).toEqual([]);
  });
  it('giá trị sai thì cảnh báo và dùng mặc định (không làm service dừng)', () => {
    const r = purgeOptionsFromEnv({ OUTBOX_RETENTION_DAYS: '0', INBOX_RETENTION_DAYS: 'abc', MAINTENANCE_INTERVAL_MS: '5' });
    expect(r.warnings).toHaveLength(3);
    expect(r.options.outboxRetentionDays).toBeUndefined();
  });
});

describe('MessagingMaintenance.runOnce', () => {
  it('xóa outbox đã gửi (7 ngày) và inbox đã xử lý (30 ngày) của từng schema, trả tổng số dòng', async () => {
    const db = fakeExecutor({ rows: 3 });
    const r = await new MessagingMaintenance(db, ['affiliate', 'commission'], ['commission']).runOnce();
    expect(r).toEqual({ outbox: 6, inbox: 3 });
    expect(db.calls.map((c) => c.sql.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(/DELETE FROM "affiliate"\."outbox_events" WHERE published_at IS NOT NULL/),
      expect.stringMatching(/DELETE FROM "commission"\."outbox_events" WHERE published_at IS NOT NULL/),
      expect.stringMatching(/DELETE FROM "commission"\."inbox_events" WHERE processed_at </),
    ]);
    expect(db.calls.map((c) => c.values[0])).toEqual(['7', '7', '30']);
  });

  it('chỉ xóa outbox ĐÃ GỬI, không động tới sự kiện chưa gửi', async () => {
    const db = fakeExecutor();
    await new MessagingMaintenance(db, ['ordering'], []).runOnce();
    expect(db.calls[0].sql).toContain('published_at IS NOT NULL');
  });

  it('thời gian giữ tùy chỉnh', async () => {
    const db = fakeExecutor();
    await new MessagingMaintenance(db, ['x'], ['x'], { outboxRetentionDays: 3, inboxRetentionDays: 90 }).runOnce();
    expect(db.calls.map((c) => c.values[0])).toEqual(['3', '90']);
  });

  it('giá trị undefined không ghi đè mặc định', async () => {
    const db = fakeExecutor();
    await new MessagingMaintenance(db, ['x'], ['x'], { outboxRetentionDays: undefined, inboxRetentionDays: undefined }).runOnce();
    expect(db.calls.map((c) => c.values[0])).toEqual([String(DEFAULT_PURGE.outboxRetentionDays), String(DEFAULT_PURGE.inboxRetentionDays)]);
  });

  it('một schema lỗi không chặn các schema còn lại; lỗi được ghi log', async () => {
    const db = fakeExecutor({ failOn: '"a"."outbox_events"' });
    const log = logger();
    const r = await new MessagingMaintenance(db, ['a', 'b'], ['b'], {}, log).runOnce();
    expect(r).toEqual({ outbox: 2, inbox: 2 });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('tên schema không an toàn bị từ chối (không ghép vào SQL)', async () => {
    const db = fakeExecutor();
    const log = logger();
    await new MessagingMaintenance(db, ['x"; DROP TABLE y; --'], [], {}, log).runOnce();
    expect(db.calls).toHaveLength(0);
    expect(log.error).toHaveBeenCalled();
  });
});

describe('purgeProcessedInbox', () => {
  it('mặc định giữ 30 ngày', async () => {
    const db = fakeExecutor();
    await purgeProcessedInbox(db, { schema: 'catalog' });
    expect(db.calls[0].values).toEqual(['30']);
  });
});

describe('MessagingMaintenance.start/stop (hẹn giờ)', () => {
  afterEach(() => vi.useRealTimers());

  it('dọn lần đầu sau initialDelayMs, rồi lặp theo intervalMs; stop thì dừng hẳn', async () => {
    vi.useFakeTimers();
    const db = fakeExecutor();
    const m = new MessagingMaintenance(db, ['s'], [], { initialDelayMs: 1000, intervalMs: 5000 });
    m.start();
    expect(db.calls).toHaveLength(0); // chưa dọn ngay lúc khởi động
    await vi.advanceTimersByTimeAsync(1000);
    expect(db.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4999);
    expect(db.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(db.calls).toHaveLength(2);
    await m.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(db.calls).toHaveLength(2);
  });

  it('tắt (enabled=false) thì không bao giờ chạy', async () => {
    vi.useFakeTimers();
    const db = fakeExecutor();
    const m = new MessagingMaintenance(db, ['s'], [], { enabled: false, initialDelayMs: 10, intervalMs: 10 });
    m.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(db.calls).toHaveLength(0);
    await m.stop();
  });

  it('lượt dọn lỗi không làm vòng lặp dừng', async () => {
    vi.useFakeTimers();
    const db = fakeExecutor({ failOn: 'outbox_events' });
    const m = new MessagingMaintenance(db, ['s'], [], { initialDelayMs: 10, intervalMs: 100 }, logger());
    m.start();
    await vi.advanceTimersByTimeAsync(450);
    expect(db.calls.length).toBeGreaterThanOrEqual(3);
    await m.stop();
  });
});
