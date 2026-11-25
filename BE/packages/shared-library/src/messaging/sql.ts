/** Phần của Prisma client (hoặc transaction client) mà outbox/inbox cần: chạy SQL thô. */
export interface RawExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/** Client có thể mở transaction tương tác (PrismaClient). */
export interface TransactionalClient extends RawExecutor {
  $transaction<R>(fn: (tx: RawExecutor) => Promise<R>, options?: { maxWait?: number; timeout?: number }): Promise<R>;
}

export interface TableRef {
  /** Postgres schema của miền, vd "ordering". */
  schema: string;
  /** Mặc định theo bảng outbox/inbox chuẩn. */
  table?: string;
}

const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Tên schema/bảng không đi qua tham số được, nên chỉ nhận định danh an toàn rồi mới ghép vào SQL. */
export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`Định danh SQL không hợp lệ: "${name}"`);
  return `"${name}"`;
}

export function qualifiedTable(ref: TableRef, defaultTable: string): string {
  return `${quoteIdent(ref.schema)}.${quoteIdent(ref.table ?? defaultTable)}`;
}
