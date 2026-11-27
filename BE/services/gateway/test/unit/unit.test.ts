import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/app-config';
import { clientIp } from '../../src/proxy/client-ip';
import { buildUpstreamHeaders, parseUpstream } from '../../src/proxy/proxy';
import { isSafePath, resolveService, ROUTE_PREFIXES } from '../../src/proxy/routes';
import { buildRules, RateLimiter } from '../../src/rate-limit/rate-limiter';

describe('loadConfig', () => {
  it('mặc định: cổng 3000, 5 service ở 3001..3005, giới hạn tốc độ bật', () => {
    const c = loadConfig({});
    expect(c.port).toBe(3000);
    expect(c.upstreams).toEqual({
      user: 'http://localhost:3001/api', affiliate: 'http://localhost:3002/api', tracking: 'http://localhost:3006/api', catalog: 'http://localhost:3003/api',
      ordering: 'http://localhost:3004/api', customer: 'http://localhost:3005/api',
    });
    expect(c.trustProxyHops).toBe(0);
    expect(c.rateLimit.enabled).toBe(true);
  });
  it('đọc địa chỉ service từ môi trường và bỏ dấu / cuối', () => {
    expect(loadConfig({ CATALOG_URL: 'http://catalog:3003/api/' }).upstreams.catalog).toBe('http://catalog:3003/api');
  });
  it('báo mọi lỗi một lượt', () => {
    expect(() => loadConfig({ GATEWAY_PORT: '0', USER_URL: 'khong-phai-url', MAX_BODY_BYTES: '5', TRUST_PROXY_HOPS: '-1' })).toThrowError(
      /USER_URL[\s\S]*GATEWAY_PORT[\s\S]*MAX_BODY_BYTES[\s\S]*TRUST_PROXY_HOPS/,
    );
  });
  it('không đọc PORT chung của .env (tránh đè cổng service user)', () => {
    expect(loadConfig({ PORT: '3001' }).port).toBe(3000);
    expect(loadConfig({ GATEWAY_PORT: '8080' }).port).toBe(8080);
  });
  it('RATE_LIMIT_ENABLED=false tắt giới hạn', () => {
    expect(loadConfig({ RATE_LIMIT_ENABLED: 'false' }).rateLimit.enabled).toBe(false);
  });
});

describe('resolveService', () => {
  it.each([
    ['/auth/login', 'user'], ['/users', 'user'], ['/users/abc', 'user'],
    ['/me/affiliate', 'affiliate'], ['/me/commissions/summary', 'affiliate'], ['/payouts', 'affiliate'], ['/adjustments/abc/waive', 'affiliate'], ['/me/adjustments', 'affiliate'], ['/public/referrals/abc', 'affiliate'],
    ['/public/tracking/events', 'tracking'], ['/me/stats', 'tracking'],
    ['/public/products/khô-cá', 'catalog'], ['/public/categories', 'catalog'], ['/products/1/stock-adjustments', 'catalog'], ['/categories', 'catalog'],
    ['/public/orders', 'ordering'], ['/public/orders/PV-1/cancel', 'ordering'], ['/orders/cskh-queue', 'ordering'], ['/me/orders', 'ordering'], ['/my-orders', 'ordering'], ['/public/uploads/abc.webp', 'catalog'], ['/products/images', 'catalog'], ['/public/banners', 'catalog'], ['/banners', 'catalog'], ['/banners/abc', 'catalog'], ['/public/creators', 'catalog'], ['/creators', 'catalog'], ['/creators/abc', 'catalog'], ['/my-orders/PV-1', 'ordering'],
    ['/customers/export', 'customer'], ['/customer-settings/segment.vip_min_orders', 'customer'],
  ])('%s -> %s', (path, service) => {
    expect(resolveService(path)).toBe(service);
  });

  it('/public/referrals có hai chủ: POST click là tracking, các yêu cầu khác (kiểm tra mã) là affiliate', () => {
    expect(resolveService('/public/referrals/click', 'POST')).toBe('tracking');
    expect(resolveService('/public/referrals/click', 'GET')).toBe('affiliate'); // mã giới thiệu tình cờ là "click"
    expect(resolveService('/public/referrals/abc', 'POST')).toBe('affiliate');
    expect(resolveService('/public/referrals/click/x', 'POST')).toBe('affiliate');
  });

  it('khớp theo từng đoạn, không khớp phần đầu của từ', () => {
    expect(resolveService('/orders-secret')).toBeNull();
    expect(resolveService('/customersX')).toBeNull();
  });
  it('không bao giờ chuyển tiếp /internal hay đường dẫn lạ', () => {
    for (const p of ['/internal/stock/reserve', '/internal/customers/upsert', '/internal/attribution/resolve', '/me', '/', '/admin']) expect(resolveService(p)).toBeNull();
  });
  it('API cấu hình quản trị đi đúng service', () => {
    expect(resolveService('/order-settings')).toBe('ordering');
    expect(resolveService('/order-settings/payment.bank_name')).toBe('ordering');
    expect(resolveService('/orders/stats')).toBe('ordering');
    expect(resolveService('/affiliate-settings')).toBe('affiliate');
    expect(resolveService('/customer-settings')).toBe('customer');
  });
  it('mỗi tiền tố chỉ thuộc một service', () => {
    const all = Object.values(ROUTE_PREFIXES).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('isSafePath', () => {
  it.each(['/orders', '/public/orders/PV-261125-ABCD', '/users/0191e2c0-aaaa-7bbb-8ccc-123456789abc'])('cho phép %s', (p) => expect(isSafePath(p)).toBe(true));
  it.each(['/orders/../internal/x', '/orders/./x', '/orders//x', '/orders/%2e%2e/internal', '/orders/%2E%2E/x', '/a%2fb', '/a%5cb', '/a\\b', '/a%00b'])('chặn %s', (p) => expect(isSafePath(p)).toBe(false));
});

describe('clientIp', () => {
  const req = (remote: string | undefined, xff?: string) => ({ socket: { remoteAddress: remote }, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } }) as never;
  it('không tin proxy thì bỏ qua X-Forwarded-For (client tự khai được)', () => {
    expect(clientIp(req('10.0.0.9', '6.6.6.6'), 0)).toBe('10.0.0.9');
  });
  it('IPv4 trong IPv6 được chuẩn hóa', () => {
    expect(clientIp(req('::ffff:203.0.113.5'), 0)).toBe('203.0.113.5');
  });
  it('một proxy tin cậy: lấy phần tử cuối, bỏ phần client tự thêm ở đầu', () => {
    expect(clientIp(req('172.18.0.2', '6.6.6.6, 203.0.113.5'), 1)).toBe('203.0.113.5');
  });
  it('hai proxy tin cậy: lấy phần tử thứ hai từ cuối', () => {
    expect(clientIp(req('172.18.0.2', '6.6.6.6, 203.0.113.5, 172.18.0.3'), 2)).toBe('203.0.113.5');
  });
  it('thiếu hoặc ngắn hơn số proxy thì dùng địa chỉ kết nối', () => {
    expect(clientIp(req('172.18.0.2'), 1)).toBe('172.18.0.2');
    expect(clientIp(req('172.18.0.2', '203.0.113.5'), 2)).toBe('172.18.0.2');
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  afterEach(() => limiter?.stop());
  const cfg = { enabled: true, globalPerMin: 5, authPerMin: 2, publicWritePerMin: 3, lookupPerMin: 2 };
  const make = () => {
    let t = 1_000_000;
    limiter = new RateLimiter(buildRules(cfg), () => t);
    return { advance: (ms: number) => { t += ms; } };
  };

  it('cho phép đến hết hạn mức rồi chặn kèm số giây chờ', () => {
    make();
    for (let i = 0; i < 5; i++) expect(limiter.check('1.1.1.1', 'GET', '/products').allowed).toBe(true);
    const blocked = limiter.check('1.1.1.1', 'GET', '/products');
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });
  it('mỗi IP một hạn mức riêng', () => {
    make();
    for (let i = 0; i < 5; i++) limiter.check('1.1.1.1', 'GET', '/products');
    expect(limiter.check('1.1.1.1', 'GET', '/products').allowed).toBe(false);
    expect(limiter.check('2.2.2.2', 'GET', '/products').allowed).toBe(true);
  });
  it('hết cửa sổ thì đếm lại', () => {
    const clock = make();
    for (let i = 0; i < 5; i++) limiter.check('1.1.1.1', 'GET', '/products');
    clock.advance(60_001);
    expect(limiter.check('1.1.1.1', 'GET', '/products').allowed).toBe(true);
  });
  it('đăng nhập bị luật riêng chặt hơn luật chung', () => {
    make();
    expect(limiter.check('1.1.1.1', 'POST', '/auth/login')).toMatchObject({ allowed: true, limit: 2, remaining: 1 });
    expect(limiter.check('1.1.1.1', 'POST', '/auth/login').remaining).toBe(0);
    expect(limiter.check('1.1.1.1', 'POST', '/auth/login').allowed).toBe(false);
    // GET thường vẫn dùng được: luật auth chỉ áp cho POST login/register/refresh.
    expect(limiter.check('1.1.1.1', 'GET', '/products').allowed).toBe(true);
  });
  it('yêu cầu bị luật riêng chặn không làm cạn hạn mức chung', () => {
    make();
    limiter.check('1.1.1.1', 'POST', '/auth/login');
    limiter.check('1.1.1.1', 'POST', '/auth/login');
    for (let i = 0; i < 20; i++) expect(limiter.check('1.1.1.1', 'POST', '/auth/login').allowed).toBe(false);
    // Chung: 5/phút, mới dùng 2 (hai lần được phép). Còn 3 lần.
    for (let i = 0; i < 3; i++) expect(limiter.check('1.1.1.1', 'GET', '/products').allowed).toBe(true);
    expect(limiter.check('1.1.1.1', 'GET', '/products').allowed).toBe(false);
  });
  it('tra cứu đơn theo mã chặt hơn; tạo đơn tính luật ghi công khai', () => {
    make();
    expect(limiter.check('1.1.1.1', 'GET', '/public/orders/PV-1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1', 'GET', '/public/orders/PV-2').allowed).toBe(true);
    expect(limiter.check('1.1.1.1', 'GET', '/public/orders/PV-3').allowed).toBe(false);
    for (let i = 0; i < 3; i++) expect(limiter.check('2.2.2.2', 'POST', '/public/orders').allowed).toBe(true);
    expect(limiter.check('2.2.2.2', 'POST', '/public/orders').allowed).toBe(false);
  });
});

describe('buildUpstreamHeaders', () => {
  const upstream = parseUpstream('catalog', 'http://catalog.internal:3003/api');
  const req = (headers: Record<string, string>) => ({ headers, socket: {} }) as never;

  it('parseUpstream tách địa chỉ và đường dẫn gốc', () => {
    expect(upstream).toMatchObject({ hostname: 'catalog.internal', port: 3003, basePath: '/api', protocol: 'http:' });
  });
  it('bỏ khóa nội bộ và header chuyển tiếp do client tự khai, đặt lại theo gateway', () => {
    const h = buildUpstreamHeaders(
      req({ host: 'shop.example', authorization: 'Bearer t', 'x-internal-key': 'ke-gian', 'x-forwarded-for': '6.6.6.6', 'x-request-id': 'gia-mao', 'x-real-ip': '6.6.6.6', 'content-type': 'application/json' }),
      upstream, { clientIp: '203.0.113.5', requestId: 'req-12345678' },
    );
    expect(h['x-internal-key']).toBeUndefined();
    expect(h['x-real-ip']).toBeUndefined();
    expect(h['x-forwarded-for']).toBe('203.0.113.5');
    expect(h['x-forwarded-host']).toBe('shop.example');
    expect(h['x-request-id']).toBe('req-12345678');
    expect(h.host).toBe('catalog.internal:3003');
    expect(h.authorization).toBe('Bearer t');
    expect(h['content-type']).toBe('application/json');
  });
  it('bỏ header hop-by-hop và header nêu trong Connection', () => {
    const h = buildUpstreamHeaders(req({ connection: 'keep-alive, x-secret-hop', 'keep-alive': 'timeout=5', 'x-secret-hop': '1', te: 'trailers', accept: '*/*' }), upstream, { clientIp: '1.1.1.1', requestId: 'req-12345678' });
    expect(h).not.toHaveProperty('connection');
    expect(h).not.toHaveProperty('keep-alive');
    expect(h).not.toHaveProperty('x-secret-hop');
    expect(h).not.toHaveProperty('te');
    expect(h.accept).toBe('*/*');
  });
});
