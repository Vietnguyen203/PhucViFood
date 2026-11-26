import { purgePublishedOutbox, type RelayLogger } from './outbox';
import { qualifiedTable, type RawExecutor } from './sql';

const INBOX_TABLE = 'inbox_events';
const silent: RelayLogger = { log() {}, warn() {}, error() {} };

export interface PurgeOptions {
  /** Mặc định bật. */
  enabled?: boolean;
  /** Khoảng giữa hai lượt dọn (ms). Mặc định 1 giờ. */
  intervalMs?: number;
  /** Chờ bao lâu sau khi khởi động mới dọn lần đầu (ms), để service khởi động lại thường xuyên vẫn được dọn. Mặc định 60 giây. */
  initialDelayMs?: number;
  /** Giữ sự kiện outbox đã gửi bao nhiêu ngày. Mặc định 7. */
  outboxRetentionDays?: number;
  /** Giữ dòng inbox (chống xử lý trùng) bao nhiêu ngày. Mặc định 30; phải dài hơn thời gian message có thể bị gửi lại, kể cả đưa lại từ DLQ. */
  inboxRetentionDays?: number;
}

export const DEFAULT_PURGE: Required<PurgeOptions> = {
  enabled: true, intervalMs: 3_600_000, initialDelayMs: 60_000, outboxRetentionDays: 7, inboxRetentionDays: 30,
};

/** Xóa dòng inbox đã xử lý quá `olderThanDays` ngày để bảng không phình. */
export async function purgeProcessedInbox(executor: RawExecutor, table: { schema: string }, olderThanDays = DEFAULT_PURGE.inboxRetentionDays): Promise<number> {
  return executor.$executeRawUnsafe(
    `DELETE FROM ${qualifiedTable(table, INBOX_TABLE)} WHERE processed_at < now() - ($1 || ' days')::interval`,
    String(olderThanDays),
  );
}

/**
 * Đọc cấu hình dọn dẹp từ biến môi trường: OUTBOX_PURGE_ENABLED, OUTBOX_RETENTION_DAYS, INBOX_RETENTION_DAYS, MAINTENANCE_INTERVAL_MS.
 * Giá trị sai thì dùng mặc định (và trả về cảnh báo) chứ không làm service dừng: đây chỉ là việc dọn dẹp.
 */
export function purgeOptionsFromEnv(env: Record<string, string | undefined>): { options: PurgeOptions; warnings: string[] } {
  const warnings: string[] = [];
  const int = (key: string, min: number, max: number): number | undefined => {
    const raw = env[key];
    if (raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) { warnings.push(`${key}="${raw}" không hợp lệ (số nguyên từ ${min} đến ${max}), dùng mặc định`); return undefined; }
    return n;
  };
  return {
    options: {
      enabled: env.OUTBOX_PURGE_ENABLED !== 'false',
      outboxRetentionDays: int('OUTBOX_RETENTION_DAYS', 1, 3650),
      inboxRetentionDays: int('INBOX_RETENTION_DAYS', 1, 3650),
      intervalMs: int('MAINTENANCE_INTERVAL_MS', 1_000, 86_400_000),
    },
    warnings,
  };
}

/**
 * Dọn định kỳ các bảng outbox (đã gửi) và inbox (đã xử lý) của một service. Không có job này hai bảng phình mãi.
 * Mỗi schema được dọn độc lập: một schema lỗi không chặn schema khác. Nhiều bản sao service cùng chạy là an toàn (xóa lặp vô hại).
 */
export class MessagingMaintenance {
  private readonly opts: Required<PurgeOptions>;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private running: Promise<unknown> | null = null;

  constructor(
    private readonly client: RawExecutor,
    private readonly outboxSchemas: string[],
    private readonly inboxSchemas: string[],
    options: PurgeOptions = {},
    private readonly logger: RelayLogger = silent,
  ) {
    // Bỏ các giá trị undefined để không ghi đè mặc định.
    const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as PurgeOptions;
    this.opts = { ...DEFAULT_PURGE, ...defined };
  }

  /** Một lượt dọn. Trả số dòng đã xóa. */
  async runOnce(): Promise<{ outbox: number; inbox: number }> {
    let outbox = 0;
    let inbox = 0;
    for (const schema of this.outboxSchemas) {
      try { outbox += await purgePublishedOutbox(this.client, { schema }, this.opts.outboxRetentionDays); }
      catch (e) { this.logger.error(`Dọn outbox của schema ${schema} lỗi`, e instanceof Error ? e.message : String(e)); }
    }
    for (const schema of this.inboxSchemas) {
      try { inbox += await purgeProcessedInbox(this.client, { schema }, this.opts.inboxRetentionDays); }
      catch (e) { this.logger.error(`Dọn inbox của schema ${schema} lỗi`, e instanceof Error ? e.message : String(e)); }
    }
    if (outbox > 0 || inbox > 0) this.logger.log(`Đã dọn ${outbox} sự kiện outbox đã gửi và ${inbox} dòng inbox cũ`);
    return { outbox, inbox };
  }

  start(): void {
    if (!this.opts.enabled || !this.stopped) return;
    this.stopped = false;
    const schedule = (delay: number): void => {
      this.timer = setTimeout(() => {
        this.running = this.runOnce().catch(() => undefined).finally(() => { if (!this.stopped) schedule(this.opts.intervalMs); });
      }, delay);
      this.timer.unref(); // không giữ tiến trình sống chỉ vì job dọn dẹp
    };
    schedule(this.opts.initialDelayMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
}
