import { qualifiedTable, RawExecutor, TableRef } from './sql';

const INBOX_TABLE = 'inbox_events';

/**
 * Chống xử lý trùng khi broker gửi lặp (at-least-once). Gọi trong transaction của consumer:
 * dòng inbox và thay đổi nghiệp vụ cùng commit hoặc cùng rollback, nên xử lý đúng đúng một lần về hiệu ứng.
 */
export class Inbox {
  constructor(private readonly table: TableRef) {}

  async processOnce<R>(
    tx: RawExecutor,
    messageId: string,
    consumer: string,
    handler: () => Promise<R>,
  ): Promise<{ processed: true; result: R } | { processed: false }> {
    const inserted = await tx.$executeRawUnsafe(
      `INSERT INTO ${qualifiedTable(this.table, INBOX_TABLE)} (id, message_id, consumer, processed_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, now())
       ON CONFLICT (message_id, consumer) DO NOTHING`,
      messageId, consumer,
    );
    if (inserted === 0) return { processed: false };
    return { processed: true, result: await handler() };
  }
}
