import { createEnvelope, EventEnvelope, EventPayloads, EventType, ServiceName } from '../contracts/events';
import { qualifiedTable, RawExecutor, TableRef, TransactionalClient } from './sql';

const OUTBOX_TABLE = 'outbox_events';

export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
}

export interface OutboxEventInput<T extends EventType> {
  type: T;
  payload: EventPayloads[T];
  aggregateType: string;
  aggregateId: string;
  correlationId?: string;
}

/**
 * Ghi sự kiện vào bảng outbox TRONG CÙNG transaction với thay đổi nghiệp vụ.
 * Cột `payload` chứa nguyên phong bì sự kiện (EventEnvelope); id phong bì = id dòng outbox.
 */
export class OutboxWriter {
  constructor(
    private readonly table: TableRef,
    private readonly source: ServiceName,
  ) {}

  async add<T extends EventType>(tx: RawExecutor, event: OutboxEventInput<T>): Promise<EventEnvelope<T>> {
    const envelope = createEnvelope({ ...event, source: this.source });
    await tx.$executeRawUnsafe(
      `INSERT INTO ${qualifiedTable(this.table, OUTBOX_TABLE)}
         (id, aggregate_type, aggregate_id, event_type, payload, created_at, next_attempt_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb, now(), now())`,
      envelope.id, envelope.aggregateType, envelope.aggregateId, envelope.type, JSON.stringify(envelope),
    );
    return envelope;
  }
}

export interface RelayOptions {
  batchSize?: number;
  /** Nghỉ giữa các lần quét khi không còn sự kiện. */
  pollIntervalMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface RelayLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string, trace?: string): void;
}

const silent: RelayLogger = { log() {}, warn() {}, error() {} };

interface OutboxRow { id: string; payload: EventEnvelope; attempts: number }

/**
 * Đọc outbox và đẩy lên broker. Bảo đảm:
 * - At-least-once: lỗi thì thử lại với backoff; consumer phải xử lý idempotent (xem Inbox).
 * - Đúng thứ tự theo từng aggregate: sự kiện sau chỉ được gửi khi mọi sự kiện trước của cùng aggregate đã gửi.
 * - Nhiều relay chạy song song không gửi trùng nhau (FOR UPDATE SKIP LOCKED).
 */
export class OutboxRelay {
  private readonly opts: Required<RelayOptions>;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private running: Promise<void> | null = null;

  constructor(
    private readonly client: TransactionalClient,
    private readonly table: TableRef,
    private readonly publisher: EventPublisher,
    options: RelayOptions = {},
    private readonly logger: RelayLogger = silent,
  ) {
    this.opts = {
      batchSize: options.batchSize ?? 50,
      pollIntervalMs: options.pollIntervalMs ?? 1000,
      baseBackoffMs: options.baseBackoffMs ?? 1000,
      maxBackoffMs: options.maxBackoffMs ?? 60_000,
    };
  }

  /** Xử lý một lô. Trả về số sự kiện đã gửi và số lần gửi lỗi. */
  async runOnce(): Promise<{ published: number; failed: number }> {
    const t = qualifiedTable(this.table, OUTBOX_TABLE);
    return this.client.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<OutboxRow[]>(
          `SELECT o.id::text AS id, o.payload, o.attempts
             FROM ${t} o
            WHERE o.published_at IS NULL AND o.next_attempt_at <= now()
              AND NOT EXISTS (
                SELECT 1 FROM ${t} p
                 WHERE p.aggregate_id = o.aggregate_id AND p.published_at IS NULL
                   AND (p.created_at, p.id) < (o.created_at, o.id))
            ORDER BY o.created_at, o.id
            LIMIT $1
              FOR UPDATE OF o SKIP LOCKED`,
          this.opts.batchSize,
        );
        let published = 0;
        let failed = 0;
        for (const row of rows) {
          try {
            await this.publisher.publish(row.payload);
            await tx.$executeRawUnsafe(`UPDATE ${t} SET published_at = now(), last_error = NULL WHERE id = $1::uuid`, row.id);
            published++;
          } catch (err) {
            failed++;
            const delayMs = Math.min(this.opts.maxBackoffMs, this.opts.baseBackoffMs * 2 ** row.attempts);
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Gửi sự kiện ${row.id} lỗi (lần ${row.attempts + 1}), thử lại sau ${delayMs}ms: ${message}`);
            await tx.$executeRawUnsafe(
              `UPDATE ${t} SET attempts = attempts + 1, last_error = $2,
                      next_attempt_at = now() + ($3 || ' milliseconds')::interval
                WHERE id = $1::uuid`,
              row.id, message.slice(0, 1000), String(delayMs),
            );
          }
        }
        return { published, failed };
      },
      { timeout: 30_000 },
    );
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const loop = async (): Promise<void> => {
      let next = this.opts.pollIntervalMs;
      try {
        const { published } = await this.runOnce();
        if (published > 0) next = 0; // còn việc thì quét tiếp ngay
      } catch (err) {
        this.logger.error('Relay outbox lỗi', err instanceof Error ? err.stack : String(err));
      }
      if (!this.stopped) this.timer = setTimeout(() => { this.running = loop(); }, next);
    };
    this.running = loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
}

/** Xóa sự kiện đã gửi quá `olderThanDays` ngày để bảng không phình. */
export async function purgePublishedOutbox(executor: RawExecutor, table: TableRef, olderThanDays = 7): Promise<number> {
  return executor.$executeRawUnsafe(
    `DELETE FROM ${qualifiedTable(table, OUTBOX_TABLE)}
      WHERE published_at IS NOT NULL AND published_at < now() - ($1 || ' days')::interval`,
    String(olderThanDays),
  );
}
