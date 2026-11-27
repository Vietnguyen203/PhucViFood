import { describe, expect, it } from 'vitest';
import { hasWish, MAX_WISHLIST, parseWishlist, removeWish, toggleWish, type WishItem } from './wishlist';

const a: WishItem = { productId: 'a', slug: 'san-pham-a' };
const b: WishItem = { productId: 'b', slug: 'san-pham-b' };

describe('danh sách yêu thích', () => {
  it('thêm vào đầu danh sách, bấm lần nữa thì bỏ', () => {
    let l = toggleWish([], a);
    l = toggleWish(l, b);
    expect(l.map((i) => i.productId)).toEqual(['b', 'a']);
    expect(hasWish(l, 'a')).toBe(true);
    l = toggleWish(l, a);
    expect(l.map((i) => i.productId)).toEqual(['b']);
    expect(hasWish(l, 'a')).toBe(false);
  });

  it('không đổi mảng gốc', () => {
    const l = [a];
    toggleWish(l, b);
    removeWish(l, 'a');
    expect(l).toEqual([a]);
  });

  it('giới hạn số mục tối đa, giữ các mục mới nhất', () => {
    let l: WishItem[] = [];
    for (let i = 0; i < MAX_WISHLIST + 5; i++) l = toggleWish(l, { productId: `p${i}`, slug: `s${i}` });
    expect(l).toHaveLength(MAX_WISHLIST);
    expect(l[0].productId).toBe(`p${MAX_WISHLIST + 4}`);
  });

  it('đọc dữ liệu hỏng thì trả danh sách rỗng, bỏ mục sai dạng và trùng', () => {
    expect(parseWishlist(null)).toEqual([]);
    expect(parseWishlist('không phải json')).toEqual([]);
    expect(parseWishlist('{"a":1}')).toEqual([]);
    expect(parseWishlist(JSON.stringify([a, { productId: 1, slug: 'x' }, { productId: 'c' }, { productId: 'd', slug: '' }, a, b]))).toEqual([a, b]);
  });
});
