const nf = new Intl.NumberFormat('vi-VN');

/** 189000 -> "189.000₫". Tiền luôn là số nguyên VND. */
export function formatVnd(amount: number): string {
  return `${nf.format(Math.round(amount))}₫`;
}

/** Phần trăm giảm hiển thị trên thẻ sản phẩm, vd 14 -> "-14%". */
export function formatDiscount(percent: number): string {
  return `-${Math.round(percent)}%`;
}

/**
 * Đọc số tiền VND người dùng gõ: chấp nhận "339000", "339.000", "339,000", "339.000 ₫", "339.000đ", "339000 VND".
 * Rỗng trả undefined; có chữ hoặc ký tự lạ (kể cả số âm, số lẻ) trả NaN để backend báo lỗi rõ thay vì gửi sai.
 */
export function parseMoney(text: string): number | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const digits = t.replace(/(vnđ|vnd|₫|đ)/gi, '').replace(/[.,\s]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : NaN;
}

/** Số gõ trơn nhỏ hơn mức này được hiểu là NGHÌN đồng (gõ 339 là 339.000₫); từ mức này trở lên là số tiền đầy đủ. */
export const THOUSANDS_BELOW = 10_000;

/**
 * Đọc giá bán mặc định theo nghìn đồng: "339" -> 339.000; "45" -> 45.000; "339000" -> 339.000 (đã là số đầy đủ);
 * "339.000", "339,000", "339.000 ₫" -> 339.000 (có dấu phân cách nghìn nghĩa là số đầy đủ). Rỗng trả undefined; chữ hoặc số lẻ trả NaN.
 */
export function parseThousands(text: string): number | undefined {
  const t = text.trim().replace(/(vnđ|vnd|₫|đ)/gi, '').trim();
  if (t === '') return undefined;
  if (/^\d{1,3}([.,\s]\d{3})+$/.test(t)) return Number(t.replace(/[.,\s]/g, '')); // đã có dấu phân cách nghìn: số đầy đủ
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n < THOUSANDS_BELOW ? n * 1000 : n;
  }
  return NaN;
}
