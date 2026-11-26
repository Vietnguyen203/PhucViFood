import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { generateOrderCode, IDEMPOTENCY_KEY_REGEX, ORDER_CODE_REGEX, orderIdFromKey } from '../../src/common/validators';
import { loadConfig } from '../../src/config/app-config';
import { PlaceOrderDto } from '../../src/orders/dto';
import { toAffiliateView, toPublicView, transferInstructions, type OrderFull } from '../../src/orders/views';
import { isUuid } from '@phucvi/shared-library/utils';

const env = {
  ORDERING_DATABASE_URL: 'postgresql://x', RABBITMQ_URL: 'amqp://x', JWT_ACCESS_SECRET: 'a'.repeat(32), INTERNAL_API_KEY: 'k'.repeat(24),
};

describe('loadConfig', () => {
  it('đọc cấu hình hợp lệ với giá trị mặc định', () => {
    expect(loadConfig(env)).toMatchObject({
      port: 3004, catalogUrl: 'http://localhost:3003/api', affiliateUrl: 'http://localhost:3002/api',
      customerUrl: 'http://localhost:3005/api', downstreamTimeoutMs: 5000, relayEnabled: true,
      orderExpiryEnabled: true, orderExpiryIntervalMs: 60_000,
    });
  });
  it('cấu hình job hủy đơn quá hạn: tắt được, khoảng chạy phải hợp lệ', () => {
    expect(loadConfig({ ...env, ORDER_EXPIRY_ENABLED: 'false', ORDER_EXPIRY_INTERVAL_MS: '5000' })).toMatchObject({ orderExpiryEnabled: false, orderExpiryIntervalMs: 5000 });
    expect(() => loadConfig({ ...env, ORDER_EXPIRY_INTERVAL_MS: '10' })).toThrowError(/ORDER_EXPIRY_INTERVAL_MS/);
  });
  it('bỏ dấu / cuối địa chỉ; báo tất cả lỗi một lượt', () => {
    expect(loadConfig({ ...env, CATALOG_URL: 'http://c:1/api///' }).catalogUrl).toBe('http://c:1/api');
    expect(() => loadConfig({ INTERNAL_API_KEY: 'x', CATALOG_URL: 'khong-phai-url', DOWNSTREAM_TIMEOUT_MS: '5' })).toThrowError(
      /ORDERING_DATABASE_URL[\s\S]*RABBITMQ_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*INTERNAL_API_KEY[\s\S]*DOWNSTREAM_TIMEOUT_MS[\s\S]*CATALOG_URL/,
    );
  });
});

describe('mã đơn', () => {
  it('đúng dạng PV-yymmdd-XXXX với ngày theo giờ Việt Nam, không có ký tự dễ nhầm', () => {
    // 2026-11-24 18:00 UTC = 01:00 ngày 25/11 giờ Việt Nam
    const code = generateOrderCode(new Date('2026-11-24T18:00:00Z'));
    expect(code).toMatch(ORDER_CODE_REGEX);
    expect(code.startsWith('PV-261125-')).toBe(true);
    for (let i = 0; i < 200; i++) expect(generateOrderCode()).not.toMatch(/[ILO01]$|-[^-]*[ILO01][^-]*$/);
  });
  it('ít trùng nhau', () => {
    const set = new Set(Array.from({ length: 500 }, () => generateOrderCode(new Date('2026-11-25T00:00:00Z'))));
    expect(set.size).toBeGreaterThan(495);
  });
});

describe('Idempotency-Key', () => {
  it('id đơn suy ra từ khóa: cố định, là UUID, khác khóa thì khác id', () => {
    const a = orderIdFromKey('checkout-abc-12345');
    expect(orderIdFromKey('checkout-abc-12345')).toBe(a);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('4');
    expect(orderIdFromKey('checkout-abc-12346')).not.toBe(a);
  });
  it('chỉ nhận khóa 8-100 ký tự an toàn', () => {
    expect(IDEMPOTENCY_KEY_REGEX.test('abc-12345_x.Y')).toBe(true);
    for (const bad of ['short', 'có dấu cách rồi', 'a'.repeat(101), 'bad key!!!', '']) expect(IDEMPOTENCY_KEY_REGEX.test(bad)).toBe(false);
  });
});

const base = {
  items: [{ productId: '01930000-0000-7000-8000-000000005001', quantity: 2 }],
  customer: { fullName: ' Nguyễn Thị Test ', phone: '0912 345 678', province: 'Thành phố Hà Nội', ward: 'Phường Cầu Giấy', addressLine: '12 Trần Thái Tông' },
  paymentMethod: 'COD',
};
const errors = async (plain: object) => (await validate(plainToInstance(PlaceOrderDto, plain), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property).sort();

describe('DTO đặt hàng', () => {
  it('hợp lệ', async () => expect(await errors(base)).toEqual([]));

  it.each([
    ['không có sản phẩm', { items: [] }, 'items'],
    ['số lượng 0', { items: [{ productId: base.items[0].productId, quantity: 0 }] }, 'items'],
    ['productId sai', { items: [{ productId: 'abc', quantity: 1 }] }, 'items'],
    ['SĐT sai', { customer: { ...base.customer, phone: '123' } }, 'customer'],
    ['thiếu địa chỉ', { customer: { ...base.customer, addressLine: '' } }, 'customer'],
    ['thanh toán lạ', { paymentMethod: 'BITCOIN' }, 'paymentMethod'],
    ['cookie sai ngày', { cookie: { code: 'abc', clickedAt: 'hôm qua' } }, 'cookie'],
    ['gửi giá lên (không được tin client)', { price: 1 }, 'price'],
    ['gửi tổng tiền lên', { totalAmount: 1 }, 'totalAmount'],
  ])('từ chối: %s', async (_n, patch, field) => {
    expect(await errors({ ...base, ...patch })).toContain(field);
  });

  it('cookie chấp nhận đúng như API click của affiliate trả về (gồm maxAgeDays)', async () => {
    expect(await errors({ ...base, cookie: { code: 'linh01', channelCode: 'facebook', clickedAt: '2026-11-25T00:00:00Z', maxAgeDays: 30 } })).toEqual([]);
  });
});

const order = (over: Partial<OrderFull> = {}): OrderFull => ({
  id: 'o1', code: 'PV-261125-AAAA', idempotencyKey: null, customerId: 'c1', status: 1, paymentMethod: 2, paymentStatus: 2,
  subtotalAmount: 610_000n, shippingFee: 0n, totalAmount: 610_000n, affiliateId: 'a1', linkId: null, channelCode: 'facebook',
  referralCodeUsed: 'linh01', attributionSource: 1, isSelfPurchase: false, shipName: 'Nguyễn Văn An', shipPhone: '+84912345678',
  shipProvince: 'Hà Nội', shipWard: 'Cầu Giấy', shipAddressLine: '12 Trần Thái Tông', customerNote: null,
  placedAt: new Date(), paymentDueAt: null, deliveredAt: null, completedAt: null, cancelledAt: null, returnedAt: null, receivedBy: null, cancelReason: null,
  createdAt: new Date(), updatedAt: new Date(),
  items: [{ id: 'i1', orderId: 'o1', productId: 'p1', productName: 'Khô cá', unitPrice: 305_000n, quantity: 2, lineTotal: 610_000n }],
  ...over,
});
const bank = { bankName: 'VCB', accountNo: '001', accountHolder: 'CTY' };

describe('view dữ liệu theo người xem', () => {
  it('CTV chỉ thấy tên viết tắt, không có SĐT, địa chỉ hay khách hàng', () => {
    const v = toAffiliateView(order());
    expect(v.customer).toBe('N.V.A');
    expect(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x))).not.toMatch(/912345678|Trần Thái Tông|Nguyễn Văn An|shipPhone|customerId/);
  });

  it('khách tra cứu không thấy ghi nhận CTV; chỉ đơn chuyển khoản CHƯA trả mới có hướng dẫn chuyển khoản', () => {
    const v = toPublicView(order(), bank);
    expect(Object.keys(v)).not.toContain('attribution');
    expect(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x))).not.toMatch(/linh01|affiliateId/);
    expect(v.transferInstructions).toEqual({ ...bank, amount: 610_000n, content: 'PV-261125-AAAA', dueAt: null });
    // Có hạn thanh toán thì khách thấy hạn để chuyển khoản kịp.
    const due = new Date('2026-11-27T10:00:00Z');
    expect(toPublicView(order({ paymentDueAt: due }), bank).transferInstructions?.dueAt).toEqual(due);
    expect(transferInstructions(order({ paymentStatus: 3 }), bank)).toBeUndefined(); // đã PAID
    expect(transferInstructions(order({ paymentMethod: 1, paymentStatus: 1 }), bank)).toBeUndefined(); // COD
    expect(transferInstructions(order(), null)).toBeUndefined(); // chưa cấu hình tài khoản
  });
});
