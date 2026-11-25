/** Tiền luôn là số nguyên VND. Không dùng số thực. */

export function assertVnd(value: number | bigint, name = 'amount'): void {
  const ok = typeof value === 'bigint' ? true : Number.isSafeInteger(value);
  if (!ok) throw new RangeError(`${name} phải là số nguyên VND`);
  if (value < 0) throw new RangeError(`${name} không được âm`);
}

/**
 * Hoa hồng = floor(giá sản phẩm × tỷ lệ / 10000). Tỷ lệ tính bằng bps (1000 = 10%).
 * `baseAmount` là tổng giá sản phẩm, KHÔNG gồm phí ship.
 */
export function calculateCommission(baseAmount: number | bigint, rateBps: number): number {
  assertVnd(baseAmount, 'baseAmount');
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new RangeError('rateBps phải là số nguyên từ 0 đến 10000');
  }
  return Number((BigInt(baseAmount) * BigInt(rateBps)) / 10_000n);
}

export interface ShippingRule {
  flatFee: number;
  /** Miễn phí ship khi tổng giá sản phẩm từ mức này. null = không miễn phí. */
  freeThreshold: number | null;
}

export function calculateShippingFee(subtotal: number, rule: ShippingRule): number {
  assertVnd(subtotal, 'subtotal');
  if (rule.freeThreshold !== null && subtotal >= rule.freeThreshold) return 0;
  return rule.flatFee;
}

/** Đổi bigint (từ Prisma) sang number để đưa vào JSON; lỗi nếu vượt giới hạn an toàn. */
export function toSafeNumber(value: bigint | number): number {
  const n = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(n)) throw new RangeError('Giá trị vượt giới hạn số nguyên an toàn');
  return n;
}

export function formatVnd(value: number | bigint): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}
