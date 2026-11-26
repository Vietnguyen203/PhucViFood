import { describe, expect, it } from 'vitest';
import {
  addToCart, cartCount, cartSubtotal, EMPTY_CART, estimateShipping, MAX_QUANTITY, parseCart, removeFromCart, setQuantity,
} from './cart';

const khoGa = { id: 'p1', name: 'Khô gà lá chanh', slug: 'kho-ga', imageUrl: null, unit: 'hộp 500g', price: 145_000 };
const lapXuong = { id: 'p2', name: 'Lạp xưởng tươi', slug: 'lap-xuong', imageUrl: 'https://x/y.png', unit: null, price: 189_000 };

describe('giỏ hàng', () => {
  it('thêm sản phẩm mới và cộng dồn số lượng sản phẩm đã có', () => {
    let c = addToCart(EMPTY_CART, khoGa);
    c = addToCart(c, lapXuong, 2);
    c = addToCart(c, khoGa, 3);
    expect(c.lines).toHaveLength(2);
    expect(c.lines.find((l) => l.productId === 'p1')?.quantity).toBe(4);
    expect(cartCount(c)).toBe(6);
    expect(cartSubtotal(c)).toBe(4 * 145_000 + 2 * 189_000);
  });

  it('không đổi state gốc (bất biến)', () => {
    const before = addToCart(EMPTY_CART, khoGa);
    const snapshot = JSON.stringify(before);
    addToCart(before, khoGa, 5);
    setQuantity(before, 'p1', 9);
    removeFromCart(before, 'p1');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('số lượng bị chặn ở MAX_QUANTITY và bỏ qua giá trị không hợp lệ', () => {
    expect(addToCart(EMPTY_CART, khoGa, MAX_QUANTITY + 500).lines[0].quantity).toBe(MAX_QUANTITY);
    expect(addToCart(addToCart(EMPTY_CART, khoGa, MAX_QUANTITY), khoGa, 10).lines[0].quantity).toBe(MAX_QUANTITY);
    expect(addToCart(EMPTY_CART, khoGa, 0)).toBe(EMPTY_CART);
    expect(addToCart(EMPTY_CART, khoGa, -3)).toBe(EMPTY_CART);
    expect(addToCart(EMPTY_CART, khoGa, 2.9).lines[0].quantity).toBe(2);
  });

  it('thêm lại thì cập nhật giá theo giá mới nhất', () => {
    const c = addToCart(addToCart(EMPTY_CART, khoGa), { ...khoGa, price: 139_000 });
    expect(c.lines[0].price).toBe(139_000);
  });

  it('đặt số lượng; về 0 hoặc âm thì bỏ dòng', () => {
    let c = addToCart(addToCart(EMPTY_CART, khoGa), lapXuong);
    c = setQuantity(c, 'p1', 5);
    expect(c.lines.find((l) => l.productId === 'p1')?.quantity).toBe(5);
    expect(setQuantity(c, 'p1', 0).lines.map((l) => l.productId)).toEqual(['p2']);
    expect(setQuantity(c, 'p2', -1).lines.map((l) => l.productId)).toEqual(['p1']);
    expect(removeFromCart(c, 'p2').lines.map((l) => l.productId)).toEqual(['p1']);
  });
});

describe('phí ship tạm tính', () => {
  it('đồng giá 30.000đ; miễn phí từ 500.000đ; giỏ trống thì 0', () => {
    expect(estimateShipping(0)).toBe(0);
    expect(estimateShipping(100_000)).toBe(30_000);
    expect(estimateShipping(499_999)).toBe(30_000);
    expect(estimateShipping(500_000)).toBe(0);
  });
});

describe('parseCart (đọc từ bộ nhớ cục bộ)', () => {
  it('đọc lại đúng giỏ đã lưu', () => {
    const c = addToCart(addToCart(EMPTY_CART, khoGa, 2), lapXuong);
    expect(parseCart(JSON.stringify(c))).toEqual(c);
  });

  it('dữ liệu hỏng, rỗng hoặc sai dạng thì về giỏ trống, không ném lỗi', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{"lines":"x"}', '{"lines":null}']) expect(parseCart(raw)).toEqual(EMPTY_CART);
  });

  it('bỏ từng dòng sai (thiếu id, giá không phải số, số lượng <= 0), giữ dòng đúng và chặn số lượng quá lớn', () => {
    const raw = JSON.stringify({ lines: [
      { productId: 'p1', name: 'A', price: 1000, quantity: 2 },
      { name: 'thiếu id', price: 1, quantity: 1 },
      { productId: 'p3', name: 'giá chữ', price: 'abc', quantity: 1 },
      { productId: 'p4', name: 'số lượng 0', price: 1, quantity: 0 },
      { productId: 'p5', name: 'quá lớn', price: 1, quantity: 99_999 },
      null,
    ] });
    const c = parseCart(raw);
    expect(c.lines.map((l) => l.productId)).toEqual(['p1', 'p5']);
    expect(c.lines[1].quantity).toBe(MAX_QUANTITY);
  });
});
