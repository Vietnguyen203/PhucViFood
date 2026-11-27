/** Khoảng giá để lọc ở trang danh mục và tìm kiếm. Khóa nằm trên đường dẫn (?gia=...) nên chia sẻ và tải lại được. */
export interface PriceRange { key: string; label: string; min?: number; max?: number }

export const PRICE_RANGES: PriceRange[] = [
  { key: 'duoi-100', label: 'Dưới 100.000₫', max: 99_999 },
  { key: '100-200', label: '100.000₫ - 200.000₫', min: 100_000, max: 200_000 },
  { key: '200-500', label: '200.000₫ - 500.000₫', min: 200_001, max: 500_000 },
  { key: 'tren-500', label: 'Trên 500.000₫', min: 500_001 },
];

/** Tìm khoảng giá theo khóa; khóa lạ hoặc rỗng nghĩa là không lọc. */
export function findPriceRange(key: string | null | undefined): PriceRange | null {
  return PRICE_RANGES.find((r) => r.key === key) ?? null;
}
