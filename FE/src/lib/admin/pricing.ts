// Giá bán, giảm giá: admin nhập "% giảm", hệ thống tự tính giá gốc (hiện gạch ngang ở cửa hàng).

/** % giảm tối đa cho phép nhập. */
export const MAX_DISCOUNT_PERCENT = 90;

/** % giảm thực tế (làm tròn) của giá bán so với giá gốc; 0 nếu không giảm. Cùng cách tính với backend. */
export function discountFromOriginal(price: number, original: number | null | undefined): number {
  if (!original || original <= price || price < 0) return 0;
  return Math.round(((original - price) / original) * 100);
}

/**
 * Giá gốc suy ra từ giá bán và % giảm: giá gốc = giá bán / (1 - %). Làm tròn LÊN tới nghìn đồng cho đẹp (vd 424.000₫);
 * nếu làm tròn làm lệch % hiển thị thì dùng số chính xác. Trả null khi không giảm (% rỗng hoặc 0) hoặc dữ liệu không hợp lệ.
 */
export function originalFromDiscount(price: number, percent: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(percent) || price <= 0 || percent <= 0 || percent > MAX_DISCOUNT_PERCENT) return null;
  const exact = Math.ceil((price * 100) / (100 - percent));
  const rounded = Math.ceil(exact / 1000) * 1000;
  return discountFromOriginal(price, rounded) === Math.round(percent) ? rounded : exact;
}

/** Lỗi nhập % giảm (null nếu hợp lệ hoặc để trống). */
export function discountProblem(text: string): string | null {
  const t = text.trim().replace('%', '').trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 'Giảm giá là số phần trăm, vd 20.';
  if (n > MAX_DISCOUNT_PERCENT) return `Giảm giá tối đa ${MAX_DISCOUNT_PERCENT}%.`;
  return null;
}

/** Đọc ô % giảm: rỗng hoặc 0 là không giảm; chấp nhận "20", "20%", "12,5". */
export function parsePercent(text: string): number {
  const t = text.trim().replace('%', '').trim();
  if (t === '') return 0;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
