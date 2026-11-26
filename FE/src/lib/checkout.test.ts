import { describe, expect, it } from 'vitest';
import { addToCart, EMPTY_CART } from './cart';
import {
  buildOrderPayload, describeStockProblems, EMPTY_CHECKOUT, mapServerFieldErrors, normalizeVnPhone, validateCheckout, type CheckoutForm,
} from './checkout';

const cart = addToCart(addToCart(EMPTY_CART, { id: 'p1', name: 'Khô gà', slug: 'kho-ga', imageUrl: null, unit: null, price: 145_000 }, 2), { id: 'p2', name: 'Lạp xưởng', slug: 'lx', imageUrl: null, unit: null, price: 189_000 });
const good: CheckoutForm = {
  ...EMPTY_CHECKOUT, fullName: ' Nguyễn Văn An ', phone: '0912 345 678', province: 'Thành phố Hà Nội', ward: 'Phường Cầu Giấy', addressLine: '12 Trần Thái Tông',
};

describe('normalizeVnPhone (khớp backend)', () => {
  it.each([['0912 345 678', '+84912345678'], ['+84 912-345-678', '+84912345678'], ['84912345678', '+84912345678'], ['912345678', '+84912345678'], ['(091) 234.5678', '+84912345678']])(
    '%s -> %s', (input, expected) => expect(normalizeVnPhone(input)).toBe(expected),
  );
  it.each(['', '123', '0012345678', '09123456789', 'abc', '09123+45678'])('từ chối %j', (input) => expect(normalizeVnPhone(input)).toBeNull());
});

describe('validateCheckout', () => {
  it('form đúng và giỏ có hàng: không lỗi', () => {
    expect(validateCheckout(good, cart)).toEqual({});
  });

  it('báo từng trường thiếu hoặc sai, kể cả giỏ trống', () => {
    const e = validateCheckout({ ...EMPTY_CHECKOUT, email: 'khong-phai-email', referralCode: 'AB' }, EMPTY_CART);
    expect(Object.keys(e).sort()).toEqual(['addressLine', 'email', 'fullName', 'items', 'phone', 'province', 'referralCode', 'ward']);
  });

  it('email bỏ trống là được; mã giới thiệu không phân biệt hoa thường; ghi chú tối đa 500 ký tự', () => {
    expect(validateCheckout({ ...good, email: '', referralCode: 'LINH01' }, cart)).toEqual({});
    expect(validateCheckout({ ...good, note: 'x'.repeat(501) }, cart).note).toBeDefined();
    expect(validateCheckout({ ...good, note: 'x'.repeat(500) }, cart).note).toBeUndefined();
  });

  it('tên chỉ có khoảng trắng bị từ chối', () => {
    expect(validateCheckout({ ...good, fullName: '   ' }, cart).fullName).toBeDefined();
  });
});

describe('buildOrderPayload', () => {
  it('chỉ gửi productId và số lượng (KHÔNG gửi giá, tên, tổng tiền), cắt khoảng trắng, bỏ trường trống', () => {
    const p = buildOrderPayload(good, cart, null);
    expect(p).toEqual({
      items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }],
      paymentMethod: 'COD',
      customer: { fullName: 'Nguyễn Văn An', phone: '0912 345 678', province: 'Thành phố Hà Nội', ward: 'Phường Cầu Giấy', addressLine: '12 Trần Thái Tông', marketingConsent: false },
    });
    expect(JSON.stringify(p)).not.toMatch(/"(price|unitPrice|totalAmount|subtotalAmount|shippingFee|productName)"/);
  });

  it('gửi email, ghi chú, tick đồng ý tư vấn và phương thức chuyển khoản khi có', () => {
    const p = buildOrderPayload({ ...good, email: ' a@b.vn ', note: ' Giao giờ hành chính ', marketingConsent: true, paymentMethod: 'BANK_QR' }, cart, null);
    expect(p).toMatchObject({ paymentMethod: 'BANK_QR', note: 'Giao giờ hành chính', customer: { email: 'a@b.vn', marketingConsent: true } });
  });

  it('mã CTV khách nhập (chữ thường) và cookie link CTV được gửi kèm (không kèm visitorId)', () => {
    const referral = { code: 'minh02', channelCode: 'tiktok', clickedAt: '2026-11-20T00:00:00.000Z', maxAgeDays: 30, visitorId: 'v-1' };
    const p = buildOrderPayload({ ...good, referralCode: ' LINH01 ' }, cart, referral);
    expect(p.referralCode).toBe('linh01');
    expect(p.cookie).toEqual({ code: 'minh02', channelCode: 'tiktok', clickedAt: '2026-11-20T00:00:00.000Z', maxAgeDays: 30 });
    expect(JSON.stringify(p)).not.toContain('v-1');
  });
});

describe('mapServerFieldErrors', () => {
  it('đưa lỗi của backend về đúng ô; trường không có ô thì gom vào items', () => {
    const e = mapServerFieldErrors([
      { field: 'customer.phone', messages: ['phone phải là SĐT Việt Nam hợp lệ'] },
      { field: 'customer.email', messages: ['email không hợp lệ', 'khác'] },
      { field: 'items.0.quantity', messages: ['quantity must not be less than 1'] },
      { field: 'paymentMethod', messages: ['paymentMethod sai'] },
      { field: 'khong.biet', messages: ['lạ'] },
      { messages: ['thiếu field'] },
    ]);
    expect(e.phone).toMatch(/SĐT/);
    expect(e.email).toBe('email không hợp lệ');
    expect(e.paymentMethod).toBe('paymentMethod sai');
    expect(e.items).toContain('quantity');
    expect(e.items).toContain('lạ');
  });
  it('không phải mảng thì không có lỗi', () => {
    expect(mapServerFieldErrors(undefined)).toEqual({});
    expect(mapServerFieldErrors({ a: 1 })).toEqual({});
  });
});

describe('describeStockProblems', () => {
  it('hết hàng nêu tên sản phẩm và số còn lại; ngừng bán nêu rõ; mục lạ bị bỏ', () => {
    const lines = describeStockProblems([
      { productId: 'p1', requested: 2, available: 1 },
      { productId: 'p2', reason: 'NOT_AVAILABLE' },
      { productId: 'khong-co-trong-gio', requested: 1, available: 0 },
      { requested: 9 },
    ], cart);
    expect(lines).toEqual([
      'Khô gà: chỉ còn 1 (bạn chọn 2).',
      'Lạp xưởng: hiện không còn được bán.',
      'Sản phẩm: chỉ còn 0 (bạn chọn 1).',
    ]);
    expect(describeStockProblems(undefined, cart)).toEqual([]);
  });
});
