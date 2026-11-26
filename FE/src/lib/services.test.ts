import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCategories, fetchProducts } from './catalog';
import { cancelOrder, confirmReceived, lookupOrder, newIdempotencyKey, placeOrder } from './orders';
import { formatDiscount, formatVnd } from './money';
import { MemoryStore } from './storage';
import { loadReferral } from './referral';
import { trackEvent, trackReferralClick } from './tracking';

const ok = (data: unknown, meta?: unknown) =>
  new Response(JSON.stringify({ success: true, data, ...(meta ? { meta } : {}) }), { status: 200, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: (init ?? {}) as RequestInit }));
const bodyOf = (i: number) => JSON.parse(String(calls()[i].init.body));

describe('money', () => {
  it('định dạng tiền Việt: dấu chấm ngăn hàng nghìn, đuôi ₫', () => {
    expect(formatVnd(189_000)).toBe('189.000₫');
    expect(formatVnd(0)).toBe('0₫');
    expect(formatVnd(1_250_000)).toBe('1.250.000₫');
    expect(formatDiscount(14)).toBe('-14%');
  });
});

describe('catalog', () => {
  it('danh mục: gọi /public/categories', async () => {
    fetchMock.mockImplementation(async () => ok([{ id: 'c1', name: 'Đặc sản', slug: 'dac-san' }]));
    expect(await fetchCategories()).toEqual([{ id: 'c1', name: 'Đặc sản', slug: 'dac-san' }]);
    expect(calls()[0].url).toBe('/api/public/categories');
  });

  it('sản phẩm: mặc định trang 1, 8 sản phẩm, mới nhất trước; trả kèm phân trang', async () => {
    fetchMock.mockImplementation(async () => ok([{ id: 'p1' }], { pagination: { page: 1, pageSize: 8, total: 20, totalPages: 3 } }));
    const r = await fetchProducts();
    expect(r.items).toHaveLength(1);
    expect(r.pagination.totalPages).toBe(3);
    const q = new URL(calls()[0].url, 'http://x').searchParams;
    expect(q.get('page')).toBe('1');
    expect(q.get('pageSize')).toBe('8');
    expect(q.get('sort')).toBe('-createdAt');
    expect(q.has('filter[categoryId]')).toBe(false);
  });

  it('lọc theo danh mục và tìm kiếm; tìm kiếm trống thì bỏ', async () => {
    fetchMock.mockImplementation(async () => ok([]));
    await fetchProducts({ categoryId: '0191e2c0-aaaa-7bbb-8ccc-123456789abc', q: '  lạp xưởng ', page: 2, pageSize: 4, sort: 'price' });
    const q = new URL(calls()[0].url, 'http://x').searchParams;
    expect(q.get('filter[categoryId]')).toBe('0191e2c0-aaaa-7bbb-8ccc-123456789abc');
    expect(q.get('q')).toBe('lạp xưởng');
    expect([q.get('page'), q.get('pageSize'), q.get('sort')]).toEqual(['2', '4', 'price']);
    await fetchProducts({ q: '   ' });
    expect(new URL(calls()[1].url, 'http://x').searchParams.has('q')).toBe(false);
  });

  it('thiếu meta phân trang thì tự suy ra từ số dòng', async () => {
    fetchMock.mockImplementation(async () => ok([{ id: 'a' }, { id: 'b' }]));
    expect((await fetchProducts()).pagination).toMatchObject({ total: 2, totalPages: 1 });
  });
});

describe('orders', () => {
  it('khóa chống đặt trùng hợp lệ với backend (8-100 ký tự chữ, số, . _ -) và khác nhau mỗi lần', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9._-]{8,100}$/);
    expect(a).not.toBe(b);
  });

  it('đặt hàng: POST /public/orders kèm header Idempotency-Key', async () => {
    fetchMock.mockImplementation(async () => ok({ code: 'PV-261126-ABCD', status: 'PLACED' }));
    const order = await placeOrder({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'COD', customer: { fullName: 'A', phone: '0912345678', province: 'x', ward: 'y', addressLine: 'z', marketingConsent: false } }, 'key-12345678');
    expect(order.code).toBe('PV-261126-ABCD');
    expect(calls()[0].url).toBe('/api/public/orders');
    expect(calls()[0].init.method).toBe('POST');
    expect(calls()[0].init.headers).toMatchObject({ 'idempotency-key': 'key-12345678' });
  });

  it('tra cứu: mã in hoa, SĐT được mã hóa trong query', async () => {
    fetchMock.mockImplementation(async () => ok({ code: 'PV-1' }));
    await lookupOrder(' pv-261126-abcd ', '+84 912 345 678');
    expect(calls()[0].url).toBe('/api/public/orders/PV-261126-ABCD?phone=%2B84%20912%20345%20678');
  });

  it('hủy và xác nhận đã nhận hàng gửi SĐT trong body; lý do trống thì bỏ', async () => {
    fetchMock.mockImplementation(async () => ok({ code: 'PV-1' }));
    await cancelOrder('PV-1', ' 0912345678 ', '  ');
    await cancelOrder('PV-1', '0912345678', ' Đặt nhầm ');
    await confirmReceived('PV-1', '0912345678');
    expect(bodyOf(0)).toEqual({ phone: '0912345678' });
    expect(bodyOf(1)).toEqual({ phone: '0912345678', reason: 'Đặt nhầm' });
    expect(calls()[2].url).toBe('/api/public/orders/PV-1/confirm-received');
  });
});

describe('theo dõi link CTV', () => {
  const click = { valid: true, visitorId: '0191e2c0-aaaa-7bbb-8ccc-123456789abc', cookie: { code: 'linh01', channelCode: 'tiktok', clickedAt: new Date().toISOString(), maxAgeDays: 30 } };

  it('bấm link hợp lệ: gọi API với mã, kênh, trang đích; lưu cookie và visitorId', async () => {
    fetchMock.mockImplementation(async () => ok(click));
    const store = new MemoryStore();
    expect(await trackReferralClick(store, 'linh01', 'tiktok', '/r/linh01?c=tiktok')).toBe(true);
    expect(bodyOf(0)).toEqual({ code: 'linh01', channel: 'tiktok', landingPath: '/r/linh01?c=tiktok' });
    expect(loadReferral(store)).toMatchObject({ code: 'linh01', channelCode: 'tiktok', visitorId: click.visitorId });
  });

  it('bấm lần sau gửi lại visitorId cũ để backend nhận ra cùng một người xem', async () => {
    fetchMock.mockImplementation(async () => ok(click));
    const store = new MemoryStore();
    await trackReferralClick(store, 'linh01', null, '/r/linh01');
    await trackReferralClick(store, 'minh02', null, '/r/minh02');
    expect(bodyOf(1).visitorId).toBe(click.visitorId);
    expect(bodyOf(0)).not.toHaveProperty('channel');
  });

  it('mã không hợp lệ: trả false, không lưu gì', async () => {
    fetchMock.mockImplementation(async () => ok({ valid: false }));
    const store = new MemoryStore();
    expect(await trackReferralClick(store, 'khongco', null, '/r/khongco')).toBe(false);
    expect(loadReferral(store)).toBeNull();
  });

  it('lỗi mạng hoặc 5xx: nuốt lỗi, trả false (theo dõi không được làm hỏng việc xem hàng)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await trackReferralClick(new MemoryStore(), 'linh01', null, '/r/linh01')).toBe(false);
    fetchMock.mockImplementation(async () => new Response('lỗi', { status: 503 }));
    expect(await trackReferralClick(new MemoryStore(), 'linh01', null, '/r/linh01')).toBe(false);
  });

  it('cắt trang đích quá dài theo giới hạn backend (500 ký tự)', async () => {
    fetchMock.mockImplementation(async () => ok(click));
    await trackReferralClick(new MemoryStore(), 'linh01', null, `/r/linh01?x=${'a'.repeat(900)}`);
    expect(bodyOf(0).landingPath).toHaveLength(500);
  });

  it('tương tác: không có link CTV thì không gọi gì; có thì gửi mã, visitorId, loại, sản phẩm, kênh', async () => {
    fetchMock.mockImplementation(async () => ok({ recorded: true }));
    const store = new MemoryStore();
    trackEvent(store, 'ADD_TO_CART', 'p1');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async () => ok(click));
    await trackReferralClick(store, 'linh01', 'tiktok', '/r/linh01');
    fetchMock.mockImplementation(async () => ok({ recorded: true }));
    trackEvent(store, 'ADD_TO_CART', 'p1');
    trackEvent(store, 'CHECKOUT_START');
    expect(bodyOf(1)).toEqual({ code: 'linh01', visitorId: click.visitorId, type: 'ADD_TO_CART', productId: 'p1', channel: 'tiktok' });
    expect(bodyOf(2)).not.toHaveProperty('productId');
    expect(calls()[1].url).toBe('/api/public/tracking/events');
  });

  it('tương tác lỗi thì không ném lỗi chưa xử lý', async () => {
    const store = new MemoryStore();
    fetchMock.mockImplementation(async () => ok(click));
    await trackReferralClick(store, 'linh01', null, '/r/linh01');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(() => trackEvent(store, 'PRODUCT_VIEW', 'p1')).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});
