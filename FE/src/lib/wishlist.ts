/** Danh sách yêu thích lưu trên máy khách (chưa có tài khoản khách). Chỉ giữ id và slug; tên, giá, ảnh luôn lấy mới từ catalog khi hiển thị. */
export interface WishItem { productId: string; slug: string }

/** Số mục tối đa, tránh localStorage phình vô hạn. */
export const MAX_WISHLIST = 100;

export const hasWish = (items: WishItem[], productId: string): boolean => items.some((i) => i.productId === productId);

/** Thêm nếu chưa có, bỏ nếu đã có. Mục mới nằm đầu danh sách. */
export function toggleWish(items: WishItem[], item: WishItem): WishItem[] {
  if (hasWish(items, item.productId)) return items.filter((i) => i.productId !== item.productId);
  return [item, ...items].slice(0, MAX_WISHLIST);
}

export const removeWish = (items: WishItem[], productId: string): WishItem[] => items.filter((i) => i.productId !== productId);

/** Đọc từ bộ nhớ cục bộ, bỏ mọi mục sai dạng hoặc trùng (dữ liệu có thể bị sửa tay). */
export function parseWishlist(raw: string | null): WishItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const items: WishItem[] = [];
    for (const v of parsed as Array<Record<string, unknown>>) {
      if (typeof v?.productId !== 'string' || typeof v.slug !== 'string' || !v.slug || seen.has(v.productId)) continue;
      seen.add(v.productId);
      items.push({ productId: v.productId, slug: v.slug });
    }
    return items.slice(0, MAX_WISHLIST);
  } catch {
    return [];
  }
}
