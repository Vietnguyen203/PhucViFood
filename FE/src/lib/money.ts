const nf = new Intl.NumberFormat('vi-VN');

/** 189000 -> "189.000₫". Tiền luôn là số nguyên VND. */
export function formatVnd(amount: number): string {
  return `${nf.format(Math.round(amount))}₫`;
}

/** Phần trăm giảm hiển thị trên thẻ sản phẩm, vd 14 -> "-14%". */
export function formatDiscount(percent: number): string {
  return `-${Math.round(percent)}%`;
}
