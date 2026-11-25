/**
 * Đổi dữ liệu về dạng JSON an toàn: bigint (tiền VND từ Prisma) thành number, hoặc chuỗi nếu vượt
 * giới hạn số nguyên an toàn. Date giữ nguyên để JSON.stringify chuyển thành ISO.
 */
export function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 20) return value;
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => jsonSafe(v, depth + 1));
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = jsonSafe(v, depth + 1);
  return out;
}
