// Test tích hợp service ordering: Postgres (ordering_db) + RabbitMQ thật, gọi API qua HTTP thật.
// catalog, affiliate, customer được giả bằng máy chủ HTTP (xem fake-downstream.ts) để kiểm tra cả nhánh lỗi và bồi hoàn.
// Chạy: pnpm --filter @phucvi/ordering test:integration
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { generateJwtKeyPair, signAccessToken } from '@phucvi/shared-library/auth';
import { OrderStatusCodec, PaymentStatusCodec } from '@phucvi/shared-library/contracts';
import { uuidv7 } from '@phucvi/shared-library/utils';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { EXPIRED_PAYMENT_REASON, OrderExpiryService } from '../../src/orders/order-expiry.service';
import { ORDER_CODE_REGEX } from '../../src/common/validators';
import { loadConfig, type AppConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SettingsService } from '../../src/settings/settings.service';
import { FakeDownstream, type FakeProduct } from './fake-downstream';

/** Cặp khóa riêng của file test: service chỉ nhận khóa công khai, test giữ khóa riêng để ký token thay cho user service. */
const KEYS = generateJwtKeyPair();

const enabled = process.env.RUN_INTEGRATION === '1';
const DB_URL = process.env.ORDERING_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/ordering_db';
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://phucvi:phucvi@localhost:5672';
const INTERNAL_KEY = 'integration-internal-key-1234567890';
const rand = (n = 6) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

describe.skipIf(!enabled)('service ordering (HTTP + Postgres + RabbitMQ thật, service phụ thuộc được giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfig;
  let base: string;
  const fake = new FakeDownstream(INTERNAL_KEY);

  // ───────── Hỗ trợ ─────────
  const token = (role: 'ADMIN' | 'AFFILIATE', id = uuidv7()) => signAccessToken({ id, email: `${rand()}@example.com`, role }, { ...config.jwt, privateKey: KEYS.privateKey });
  const admin = () => token('ADMIN');

  async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  const newPhone = () => `09${digits(8)}`;
  const toE164 = (p: string) => `+84${p.slice(1)}`;
  const product = (over: Partial<FakeProduct> & { price?: number; stock?: number } = {}) => fake.addProduct({ price: 100_000, stock: 50, ...over });

  interface PlaceOpts { items?: Array<{ productId: string; quantity: number }>; phone?: string; payment?: 'COD' | 'BANK_QR'; referralCode?: string; cookie?: object; key?: string; extra?: object; marketingConsent?: boolean }
  async function place(o: PlaceOpts = {}) {
    const p = o.items ?? [{ productId: product().id, quantity: 1 }];
    const phone = o.phone ?? newPhone();
    const res = await api('POST', '/public/orders', {
      headers: o.key ? { 'idempotency-key': o.key } : {},
      body: {
        items: p, paymentMethod: o.payment ?? 'COD', referralCode: o.referralCode, cookie: o.cookie,
        customer: { fullName: `IT Khách ${rand(4)}`, phone, province: 'Thành phố Hà Nội', ward: 'Phường Cầu Giấy', addressLine: '12 Trần Thái Tông', marketingConsent: o.marketingConsent },
        ...o.extra,
      },
    });
    return { ...res, phone };
  }
  const dbOrder = (code: string) => prisma.order.findUniqueOrThrow({ where: { code }, include: { items: true, history: true } });
  const outbox = (orderId: string) => prisma.$queryRawUnsafe<Array<{ event_type: string; payload: any }>>(
    `SELECT event_type, payload->'payload' AS payload FROM ordering.outbox_events WHERE aggregate_id = $1::uuid ORDER BY created_at, id`, orderId,
  );
  const orderCount = (phone: string) => prisma.order.count({ where: { shipPhone: toE164(phone) } });

  /** Đưa đơn vào trạng thái mong muốn bằng API admin (đúng luồng). */
  async function advance(orderId: string, steps: Array<'confirm' | 'ship' | 'deliver' | 'complete'>) {
    for (const s of steps) expect((await api('POST', `/orders/${orderId}/${s}`, { token: admin() })).status).toBe(200);
  }

  beforeAll(async () => {
    await fake.start();
    process.env.ORDERING_DATABASE_URL = DB_URL;
    config = loadConfig({
      ORDERING_DATABASE_URL: DB_URL, RABBITMQ_URL: RABBIT_URL, JWT_PUBLIC_KEY: KEYS.publicKey,
      JWT_ISSUER: 'phucvi-it', INTERNAL_API_KEY: INTERNAL_KEY, OUTBOX_RELAY_ENABLED: 'false', DOWNSTREAM_TIMEOUT_MS: '1500',
      // Nhiều test cố ý làm service lỗi liên tiếp: nâng ngưỡng để mạch không ngắt chéo giữa các test. Retry giữ 2 lần, chờ ngắn.
      ORDER_EXPIRY_ENABLED: 'false', // test gọi runOnce() trực tiếp, không để job tự chạy xen vào
      DOWNSTREAM_BREAKER_THRESHOLD: '1000', DOWNSTREAM_RETRY_ATTEMPTS: '2', DOWNSTREAM_RETRY_BASE_MS: '10',
      CATALOG_URL: `${fake.url}/catalog/api`, AFFILIATE_URL: `${fake.url}/affiliate/api`, CUSTOMER_URL: `${fake.url}/customer/api`,
    });
    app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
    setupApp(app, { globalPrefix: 'api' });
    await app.listen(0);
    base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api`;
    prisma = app.get(PrismaService);
    // Tài khoản nhận chuyển khoản không có giá trị mặc định (phải cấu hình thật), nên test tự bảo đảm có: chạy được trên database mới
    // chưa seed (CI). `update: {}` giữ nguyên giá trị nếu đã có.
    for (const [key, value] of [['payment.bank_name', 'Vietcombank'], ['payment.bank_account_no', '0011000000000'], ['payment.bank_account_holder', 'CONG TY PHUC VI FOODS']] as const) {
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
    }
  });

  beforeEach(() => fake.reset());

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM ordering.outbox_events WHERE aggregate_id IN (SELECT id FROM ordering.orders WHERE ship_name LIKE 'IT %')`);
    await prisma.$executeRawUnsafe(`DELETE FROM ordering.orders WHERE ship_name LIKE 'IT %'`);
    await app.close();
    await fake.stop();
  });

  // ═════════════════════════ Phân quyền ═════════════════════════
  describe('phân quyền', () => {
    it('khách đặt và tra cứu không cần đăng nhập; quản trị cần ADMIN; /me cần AFFILIATE', async () => {
      expect((await api('GET', '/health')).status).toBe(200);
      expect((await place()).status).toBe(201);

      expect((await api('GET', '/orders')).status).toBe(401);
      expect((await api('GET', '/orders', { token: token('AFFILIATE') })).status).toBe(403);
      expect((await api('GET', '/orders/cskh-queue', { token: token('AFFILIATE') })).status).toBe(403);
      expect((await api('POST', `/orders/${uuidv7()}/confirm`, { token: token('AFFILIATE') })).status).toBe(403);
      expect((await api('GET', '/me/orders')).status).toBe(401);
      expect((await api('GET', '/me/orders', { token: admin() })).status).toBe(403);
    });
  });

  // ═════════════════════════ Đặt hàng ═════════════════════════
  describe('đặt hàng', () => {
    it('COD không mã giới thiệu: lấy tên và giá từ catalog, tính ship, ghi sự kiện; không gọi affiliate', async () => {
      const p = product({ price: 220_000, stock: 10, name: 'IT Khô cá lóc 500g' });
      const r = await place({ items: [{ productId: p.id, quantity: 2 }], marketingConsent: true });
      expect(r.status).toBe(201);
      const d = r.body.data;
      expect(d.code).toMatch(ORDER_CODE_REGEX);
      expect(d).toMatchObject({ status: 'PLACED', paymentMethod: 'COD', paymentStatus: 'PENDING', subtotalAmount: 440_000, shippingFee: 30_000, totalAmount: 470_000, replayed: false });
      expect(d.items).toEqual([{ productId: p.id, name: 'IT Khô cá lóc 500g', unitPrice: 220_000, quantity: 2, lineTotal: 440_000 }]);
      expect(d.transferInstructions).toBeUndefined();

      expect(fake.calls.resolve).toBe(0); // không có mã thì không cần hỏi affiliate
      expect(fake.stockOf(p.id)).toBe(8);
      expect(fake.lastUpsert).toMatchObject({ phone: toE164(r.phone), marketingConsent: true, firstAffiliateId: null, province: 'Thành phố Hà Nội' });

      const o = await dbOrder(d.code);
      expect(o).toMatchObject({ status: 1, paymentMethod: 1, paymentStatus: 1, shipPhone: toE164(r.phone), affiliateId: null });
      expect(o.customerId).toBe(fake.customers.get(toE164(r.phone)));
      expect(o.history).toHaveLength(1);
      expect(o.history[0]).toMatchObject({ fromStatus: null, toStatus: 1, actorType: 2 });

      const ev = await outbox(o.id);
      expect(ev.map((e) => e.event_type)).toEqual(['ordering.order.placed']);
      expect(ev[0].payload).toMatchObject({
        orderId: o.id, code: d.code, subtotalAmount: 440_000, shippingFee: 30_000, totalAmount: 470_000, affiliateId: null,
        commissionRateBps: null, items: [{ productId: p.id, quantity: 2 }],
      });
    });

    it('miễn phí ship từ 500.000đ (theo cấu hình), đúng ranh giới', async () => {
      const a = await place({ items: [{ productId: product({ price: 499_999 }).id, quantity: 1 }] });
      const b = await place({ items: [{ productId: product({ price: 500_000 }).id, quantity: 1 }] });
      expect(a.body.data.shippingFee).toBe(30_000);
      expect(b.body.data.shippingFee).toBe(0);
      expect(b.body.data.totalAmount).toBe(500_000);
    });

    it('chuyển khoản QR: chờ thanh toán, trả hướng dẫn chuyển khoản với nội dung là mã đơn', async () => {
      const r = await place({ payment: 'BANK_QR', items: [{ productId: product({ price: 200_000 }).id, quantity: 1 }] });
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ paymentMethod: 'BANK_QR', paymentStatus: 'UNPAID' });
      expect(r.body.data.transferInstructions).toEqual({
        bankName: 'Vietcombank', accountNo: '0011000000000', accountHolder: 'CONG TY PHUC VI FOODS', amount: 230_000, content: r.body.data.code,
        dueAt: expect.any(String), // hạn thanh toán
      });
    });

    it('mã CTV hợp lệ: lưu ghi nhận vào đơn, sự kiện mang tỷ lệ hoa hồng, nguồn đầu tiên của khách', async () => {
      const aff = fake.addAffiliate({ code: `it${rand(6)}`, rate: 1200, linkId: uuidv7() });
      const r = await place({ referralCode: aff.code.toUpperCase(), cookie: { code: aff.code, channelCode: 'facebook', clickedAt: new Date().toISOString(), maxAgeDays: 30 } });
      expect(r.status).toBe(201);
      expect(fake.lastResolve).toMatchObject({ referralCode: aff.code, customerPhone: toE164(r.phone), cookie: { code: aff.code, channelCode: 'facebook' } });

      const o = await dbOrder(r.body.data.code);
      expect(o).toMatchObject({ affiliateId: aff.id, linkId: aff.linkId, channelCode: 'facebook', referralCodeUsed: aff.code, attributionSource: 2, isSelfPurchase: false });
      expect(fake.lastUpsert).toMatchObject({ firstAffiliateId: aff.id, firstChannelCode: 'facebook' });
      expect((await outbox(o.id))[0].payload).toMatchObject({ affiliateId: aff.id, commissionRateBps: 1200, attributionSource: 'CODE', channelCode: 'facebook' });
    });

    it('CTV tự mua: giữ liên kết nhưng không có hoa hồng và không tính nguồn đầu tiên', async () => {
      const aff = fake.addAffiliate({ code: `it${rand(6)}` });
      const r = await place({ referralCode: aff.code, phone: `0${aff.phone.slice(3)}` });
      const o = await dbOrder(r.body.data.code);
      expect(o).toMatchObject({ affiliateId: aff.id, isSelfPurchase: true });
      expect(fake.lastUpsert).toMatchObject({ firstAffiliateId: null });
      expect((await outbox(o.id))[0].payload).toMatchObject({ isSelfPurchase: true, commissionRateBps: null });
    });

    it('hợp đồng CTV hết hạn: đơn tính khách vãng lai nhưng vẫn giữ mã khách đã nhập', async () => {
      const aff = fake.addAffiliate({ code: `it${rand(6)}`, expired: true });
      const r = await place({ referralCode: aff.code });
      const o = await dbOrder(r.body.data.code);
      expect(o).toMatchObject({ affiliateId: null, attributionSource: null, referralCodeUsed: aff.code, isSelfPurchase: false });
      expect((await outbox(o.id))[0].payload).toMatchObject({ affiliateId: null, commissionRateBps: null });
    });

    it('không tin dữ liệu giá, tên, tổng tiền từ client; gộp dòng trùng sản phẩm; kiểm tra đầu vào', async () => {
      const p = product({ price: 50_000, stock: 5000 });
      expect((await place({ items: [{ productId: p.id, quantity: 1 }], extra: { totalAmount: 1 } })).status).toBe(400);
      expect((await api('POST', '/public/orders', { body: { items: [{ productId: p.id, quantity: 1, unitPrice: 1 }], paymentMethod: 'COD', customer: { fullName: 'IT x', phone: newPhone(), province: 'a', ward: 'b', addressLine: 'c' } } })).status).toBe(400);

      const merged = await place({ items: [{ productId: p.id, quantity: 2 }, { productId: p.id, quantity: 3 }] });
      expect(merged.body.data.items).toEqual([expect.objectContaining({ productId: p.id, quantity: 5, lineTotal: 250_000 })]);
      expect((await place({ items: [{ productId: p.id, quantity: 600 }, { productId: p.id, quantity: 500 }] })).status).toBe(400); // tổng > 1000

      const bad = (customer: object) => api('POST', '/public/orders', { body: { items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'COD', customer } });
      const ok = { fullName: 'IT Tên', phone: newPhone(), province: 'a', ward: 'b', addressLine: 'c' };
      expect((await bad({ ...ok, phone: '123' })).status).toBe(400);
      expect((await bad({ ...ok, addressLine: '' })).status).toBe(400);
      expect((await bad({ ...ok, fullName: 'A' })).status).toBe(400);
      expect((await place({ items: [] })).status).toBe(400);
      expect((await api('POST', '/public/orders', { body: { items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'BITCOIN', customer: ok } })).status).toBe(400);
    });

    it('hết hàng: 409 kèm số còn lại, không tạo đơn; sản phẩm không còn bán: 422', async () => {
      const low = product({ stock: 2 });
      const r = await place({ items: [{ productId: low.id, quantity: 3 }] });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatchObject({ code: 'CONFLICT', details: [{ productId: low.id, requested: 3, available: 2 }] });
      expect(await orderCount(r.phone)).toBe(0);
      expect(fake.stockOf(low.id)).toBe(2);

      const gone = product({ available: false });
      const r2 = await place({ items: [{ productId: gone.id, quantity: 1 }] });
      expect(r2.status).toBe(422);
      expect(await orderCount(r2.phone)).toBe(0);
    });

    it('affiliate lỗi khi khách có mã: 503, không tạo đơn, chưa động tới khách hay kho', async () => {
      const aff = fake.addAffiliate({ code: `it${rand(6)}` });
      const p = product({ stock: 5 });
      fake.mode.affiliate = 'down';
      const r = await place({ items: [{ productId: p.id, quantity: 1 }], referralCode: aff.code });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(await orderCount(r.phone)).toBe(0);
      expect(fake.calls.upsert).toBe(0);
      expect(fake.calls.reserve).toBe(0);
      expect(fake.stockOf(p.id)).toBe(5);
    });

    it('affiliate lỗi nhưng khách KHÔNG có mã: vẫn đặt được bình thường', async () => {
      fake.mode.affiliate = 'down';
      expect((await place()).status).toBe(201);
    });

    it('customer lỗi: 503, chưa giữ hàng; catalog lỗi: 503, không tạo đơn', async () => {
      const p = product({ stock: 5 });
      fake.mode.customer = 'down';
      const r = await place({ items: [{ productId: p.id, quantity: 1 }] });
      expect(r.status).toBe(503);
      expect(fake.calls.reserve).toBe(0);
      expect(fake.stockOf(p.id)).toBe(5);

      fake.reset();
      fake.mode.catalog = 'down';
      const r2 = await place({ items: [{ productId: p.id, quantity: 1 }] });
      expect(r2.status).toBe(503);
      expect(await orderCount(r2.phone)).toBe(0);
    });

    it('lỗi tạm thời 503 của catalog, customer, affiliate: tự thử lại, đơn vẫn thành công, kho chỉ trừ MỘT lần', async () => {
      const aff = fake.addAffiliate({ code: `it${rand(6)}` });
      const p = product({ stock: 5 });
      fake.failNext = { catalog: 1, customer: 1, affiliate: 1 };
      const r = await place({ items: [{ productId: p.id, quantity: 2 }], referralCode: aff.code });
      expect(r.status).toBe(201);
      expect(fake.calls).toMatchObject({ reserve: 1, upsert: 1, resolve: 1 }); // lần 503 bị chặn trước khi vào xử lý
      expect(fake.stockOf(p.id)).toBe(3);
      expect(await orderCount(r.phone)).toBe(1);
    });

    it('lỗi tạm thời kéo dài quá số lần thử: vẫn 503 như cũ, chưa giữ hàng', async () => {
      const p = product({ stock: 5 });
      fake.failNext.customer = 5; // nhiều hơn số lần thử (2)
      const r = await place({ items: [{ productId: p.id, quantity: 1 }] });
      expect(r.status).toBe(503);
      expect(fake.calls.reserve).toBe(0);
      expect(fake.stockOf(p.id)).toBe(5);
    });

    it('service phụ thuộc treo: hết thời gian chờ thì trả 503 thay vì treo theo', async () => {
      fake.mode.customer = 'hang';
      const started = Date.now();
      const r = await place();
      expect(r.status).toBe(503);
      expect(Date.now() - started).toBeLessThan(3500); // DOWNSTREAM_TIMEOUT_MS = 1500
    });

    it('tạo đơn thất bại SAU khi đã giữ hàng: tự trả hàng về kho (bồi hoàn)', async () => {
      const bad = product({ price: -1, stock: 10 }); // giá âm vi phạm CHECK của DB khi lưu dòng đơn
      const r = await place({ items: [{ productId: bad.id, quantity: 2 }] });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(fake.calls.reserve).toBe(1);
      expect(fake.calls.release).toBe(1);
      expect(fake.stockOf(bad.id)).toBe(10); // đã trả lại
      expect(await orderCount(r.phone)).toBe(0);
    });

    it('Idempotency-Key: gửi lại cùng khóa trả đúng đơn cũ, không giữ hàng hay tạo đơn lần hai', async () => {
      const p = product({ stock: 10 });
      const key = `chk-${rand(12)}`;
      const first = await place({ key, items: [{ productId: p.id, quantity: 2 }] });
      expect(first.status).toBe(201);
      const again = await place({ key, items: [{ productId: p.id, quantity: 2 }], phone: first.phone });
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ code: first.body.data.code, replayed: true });
      expect(fake.calls.reserve).toBe(1);
      expect(fake.stockOf(p.id)).toBe(8);
      expect(await orderCount(first.phone)).toBe(1);
      expect((await place({ key: 'ngan' })).status).toBe(400);
    });

    it('nhiều yêu cầu song song cùng Idempotency-Key: chỉ một đơn, tồn kho chỉ trừ một lần', async () => {
      const p = product({ stock: 10 });
      const key = `par-${rand(12)}`;
      const phone = newPhone();
      const results = await Promise.all(Array.from({ length: 6 }, () => place({ key, phone, items: [{ productId: p.id, quantity: 3 }] })));
      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(new Set(results.map((r) => r.body.data.code)).size).toBe(1);
      expect(await orderCount(phone)).toBe(1);
      expect(fake.stockOf(p.id)).toBe(7);
    });

    it('mã đơn không trùng giữa nhiều đơn', async () => {
      const codes = (await Promise.all(Array.from({ length: 12 }, () => place()))).map((r) => r.body.data.code);
      expect(new Set(codes).size).toBe(12);
    });
  });

  // ═════════════════════════ Khách tra cứu và tự thao tác ═════════════════════════
  // ═════════════════════════ Hạn thanh toán và tự hủy đơn quá hạn ═════════════════════════
  describe('hạn thanh toán đơn chuyển khoản', () => {
    const expiry = () => app.get(OrderExpiryService);
    const dueNow = (id: string, minutesAgo = 5) => prisma.order.update({ where: { id }, data: { paymentDueAt: new Date(Date.now() - minutesAgo * 60_000) } });
    const statusOf = async (code: string) => OrderStatusCodec.toName((await dbOrder(code)).status);

    it('đơn chuyển khoản có hạn = lúc đặt + 24 giờ (mặc định); COD không có hạn; khách thấy hạn trong hướng dẫn chuyển khoản', async () => {
      const qr = await place({ payment: 'BANK_QR' });
      const o = await dbOrder(qr.body.data.code);
      expect(o.paymentDueAt!.getTime() - o.placedAt.getTime()).toBe(24 * 60 * 60_000);
      expect(new Date(qr.body.data.transferInstructions.dueAt).getTime()).toBe(o.paymentDueAt!.getTime());
      expect((await dbOrder((await place()).body.data.code)).paymentDueAt).toBeNull();
      const detail = await api('GET', `/orders/${o.id}`, { token: admin() });
      expect(new Date(detail.body.data.paymentDueAt).getTime()).toBe(o.paymentDueAt!.getTime());
    });

    it('quá hạn chưa thanh toán: tự hủy, ghi lịch sử do HỆ THỐNG, lý do rõ ràng, phát sự kiện để catalog trả hàng', async () => {
      const r = await place({ payment: 'BANK_QR' });
      const o = await dbOrder(r.body.data.code);
      await dueNow(o.id);

      expect(await expiry().runOnce()).toBeGreaterThanOrEqual(1);
      const after = await dbOrder(r.body.data.code);
      expect(OrderStatusCodec.toName(after.status)).toBe('CANCELLED');
      expect(after.cancelReason).toBe(EXPIRED_PAYMENT_REASON);
      expect(after.cancelledAt).not.toBeNull();
      const last = [...after.history!].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).at(-1)!;
      expect(last).toMatchObject({ actorType: 1, actorId: null, note: EXPIRED_PAYMENT_REASON }); // ActorType SYSTEM = 1
      const events = await outbox(o.id);
      expect(events.at(-1)).toMatchObject({ event_type: 'ordering.order.status_changed', payload: { fromStatus: 'PLACED', toStatus: 'CANCELLED', actorType: 'SYSTEM', actorId: null } });

      await expiry().runOnce(); // lần sau không hủy lại
      expect(await prisma.orderStatusHistory.count({ where: { orderId: o.id, toStatus: OrderStatusCodec.toCode('CANCELLED') } })).toBe(1);
    });

    it('đơn đã CONFIRMED nhưng chưa thanh toán cũng bị hủy khi quá hạn', async () => {
      const r = await place({ payment: 'BANK_QR' });
      const o = await dbOrder(r.body.data.code);
      await advance(o.id, ['confirm']);
      await dueNow(o.id);
      await expiry().runOnce();
      expect(await statusOf(r.body.data.code)).toBe('CANCELLED');
    });

    it('KHÔNG hủy: chưa tới hạn, COD, đã thanh toán (dù quá hạn), đơn đã giao vận chuyển', async () => {
      const future = await dbOrder((await place({ payment: 'BANK_QR' })).body.data.code);
      const cod = await dbOrder((await place()).body.data.code);
      await dueNow(cod.id); // COD có đặt hạn tay cũng không hủy

      const paid = await dbOrder((await place({ payment: 'BANK_QR' })).body.data.code);
      expect((await api('POST', `/orders/${paid.id}/payment`, { token: admin(), body: { status: 'PAID' } })).status).toBe(200);
      await dueNow(paid.id);

      const shipping = await dbOrder((await place({ payment: 'BANK_QR' })).body.data.code);
      expect((await api('POST', `/orders/${shipping.id}/payment`, { token: admin(), body: { status: 'PAID' } })).status).toBe(200);
      await advance(shipping.id, ['confirm', 'ship']);
      await dueNow(shipping.id);

      await expiry().runOnce();
      expect(await statusOf(future.code)).toBe('PLACED');
      expect(await statusOf(cod.code)).toBe('PLACED');
      expect(await statusOf(paid.code)).toBe('PLACED');
      expect(await statusOf(shipping.code)).toBe('SHIPPING');
    });

    it('thanh toán xong trước khi job chạy thì đơn được giữ lại (không hủy nhầm đơn đã trả tiền)', async () => {
      const r = await place({ payment: 'BANK_QR' });
      const o = await dbOrder(r.body.data.code);
      await dueNow(o.id);
      expect((await api('POST', `/orders/${o.id}/payment`, { token: admin(), body: { status: 'PAID' } })).status).toBe(200);
      await expiry().runOnce();
      expect(await statusOf(r.body.data.code)).toBe('PLACED');
    });

    it('hạn giữ hàng mặc định 24 giờ khi chưa cấu hình', async () => {
      expect(await app.get(SettingsService).paymentHoldMinutes()).toBe(1_440);
    });
  });

  // ═════════════════════════ API nội bộ: kiểm tra đơn tồn tại ═════════════════════════
  describe('API nội bộ: đơn có tồn tại không', () => {
    const existence = (body: object, key: string | null = INTERNAL_KEY) =>
      api('POST', '/internal/orders/existence', { body, headers: key ? { 'x-internal-key': key } : {} });

    it('cần khóa nội bộ; dữ liệu sai bị từ chối', async () => {
      expect((await existence({ orderIds: [uuidv7()] }, null)).status).toBe(401);
      expect((await existence({ orderIds: [uuidv7()] }, 'sai-khoa-sai-khoa-sai-khoa-1')).status).toBe(401);
      expect((await existence({ orderIds: [] })).status).toBe(400);
      expect((await existence({ orderIds: ['abc'] })).status).toBe(400);
      expect((await existence({ orderIds: Array.from({ length: 501 }, () => uuidv7()) })).status).toBe(400);
    });

    it('chỉ trả về những mã có đơn thật', async () => {
      const a = await dbOrder((await place()).body.data.code);
      const b = await dbOrder((await place()).body.data.code);
      const ghost = uuidv7();
      const r = await existence({ orderIds: [a.id, ghost, b.id, a.id] });
      expect(r.status).toBe(200);
      expect(r.body.data.existing.sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe('khách tra cứu và tự thao tác', () => {
    it('tra cứu bằng mã + SĐT (nhiều cách viết); sai SĐT hoặc sai mã đều 404; không lộ ghi nhận CTV', async () => {
      const aff = fake.addAffiliate({ code: `it${rand(6)}` });
      const placed = await place({ referralCode: aff.code });
      const code = placed.body.data.code;
      const e164 = toE164(placed.phone);

      for (const phone of [placed.phone, e164, `84${placed.phone.slice(1)}`]) {
        const r = await api('GET', `/public/orders/${code.toLowerCase()}?phone=${encodeURIComponent(phone)}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ code, status: 'PLACED' });
      }
      const v = (await api('GET', `/public/orders/${code}?phone=${placed.phone}`)).body.data;
      expect(JSON.stringify(v)).not.toMatch(new RegExp(`${aff.code}|affiliateId|customerId`));
      expect(v.history).toEqual([{ status: 'PLACED', at: expect.any(String) }]);

      expect((await api('GET', `/public/orders/${code}?phone=${newPhone()}`)).status).toBe(404);
      expect((await api('GET', `/public/orders/${code}`)).status).toBe(404);
      expect((await api('GET', `/public/orders/PV-000000-ZZZZ?phone=${placed.phone}`)).status).toBe(404);
    });

    it('khách tự hủy khi chưa giao: CANCELLED, phát sự kiện (catalog sẽ trả hàng); đã giao vận chuyển thì không hủy được', async () => {
      const a = await place();
      const cancelled = await api('POST', `/public/orders/${a.body.data.code}/cancel`, { body: { phone: a.phone, reason: 'Đổi ý' } });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');
      const o = await dbOrder(a.body.data.code);
      expect(o).toMatchObject({ status: 6, cancelReason: 'Đổi ý' });
      expect(o.cancelledAt).toBeTruthy();
      const ev = (await outbox(o.id)).find((e) => e.event_type === 'ordering.order.status_changed')!;
      expect(ev.payload).toMatchObject({ orderId: o.id, fromStatus: 'PLACED', toStatus: 'CANCELLED', actorType: 'CUSTOMER', receivedBy: null });
      expect((await api('POST', `/public/orders/${a.body.data.code}/cancel`, { body: { phone: a.phone } })).status).toBe(422); // đã hủy

      const b = await place();
      await advance((await dbOrder(b.body.data.code)).id, ['confirm', 'ship']);
      expect((await api('POST', `/public/orders/${b.body.data.code}/cancel`, { body: { phone: b.phone } })).status).toBe(422);
      expect((await api('POST', `/public/orders/${b.body.data.code}/cancel`, { body: { phone: newPhone() } })).status).toBe(404);
    });

    it('khách xác nhận đã nhận hàng: chỉ khi đã giao; COMPLETED, ghi receivedBy CUSTOMER và phát sự kiện cho affiliate', async () => {
      const r = await place();
      const code = r.body.data.code;
      const id = (await dbOrder(code)).id;
      expect((await api('POST', `/public/orders/${code}/confirm-received`, { body: { phone: r.phone } })).status).toBe(422); // chưa giao
      await advance(id, ['confirm', 'ship', 'deliver']);
      expect((await api('POST', `/public/orders/${code}/confirm-received`, { body: { phone: newPhone() } })).status).toBe(404);

      const done = await api('POST', `/public/orders/${code}/confirm-received`, { body: { phone: r.phone } });
      expect(done.status).toBe(200);
      expect(done.body.data.status).toBe('COMPLETED');
      const o = await dbOrder(code);
      expect(o).toMatchObject({ status: 5, receivedBy: 1 }); // CUSTOMER
      expect(o.completedAt).toBeTruthy();
      const last = (await outbox(id)).filter((e) => e.event_type === 'ordering.order.status_changed').pop()!;
      expect(last.payload).toMatchObject({ toStatus: 'COMPLETED', actorType: 'CUSTOMER', receivedBy: 'CUSTOMER' });
      expect((await api('POST', `/public/orders/${code}/confirm-received`, { body: { phone: r.phone } })).status).toBe(422); // đã hoàn tất
    });
  });

  // ═════════════════════════ Quản trị đơn hàng ═════════════════════════
  describe('quản trị đơn hàng', () => {
    it('danh sách: lọc theo trạng thái, thanh toán, CTV; tìm theo mã, tên, SĐT; phân trang; chi tiết đầy đủ', async () => {
      const t = admin();
      const aff = fake.addAffiliate({ code: `it${rand(6)}` });
      const a = await place({ referralCode: aff.code, payment: 'BANK_QR' });
      const b = await place({ referralCode: aff.code });
      const id = (await dbOrder(a.body.data.code)).id;

      const byAff = await api('GET', `/orders?filter[affiliateId]=${aff.id}&sort=placedAt`, { token: t });
      expect(byAff.status).toBe(200);
      expect(byAff.body.data.map((o: any) => o.code)).toEqual([a.body.data.code, b.body.data.code]);
      expect((await api('GET', `/orders?filter[affiliateId]=${aff.id}&filter[paymentMethod]=BANK_QR`, { token: t })).body.data.map((o: any) => o.code)).toEqual([a.body.data.code]);
      expect((await api('GET', `/orders?q=${a.body.data.code}`, { token: t })).body.data).toHaveLength(1);
      expect((await api('GET', `/orders?q=${encodeURIComponent(toE164(b.phone))}`, { token: t })).body.data.map((o: any) => o.code)).toEqual([b.body.data.code]);
      expect((await api('GET', `/orders?filter[affiliateId]=${aff.id}&pageSize=1&page=2&sort=placedAt`, { token: t })).body.meta.pagination).toMatchObject({ page: 2, pageSize: 1, total: 2 });
      expect((await api('GET', '/orders?filter[status]=4', { token: t })).status).toBe(400); // lọc bằng tên, không bằng mã số
      expect((await api('GET', '/orders?sort=shipPhone', { token: t })).status).toBe(400);

      const d = (await api('GET', `/orders/${id}`, { token: t })).body.data;
      expect(d).toMatchObject({ code: a.body.data.code, status: 'PLACED', paymentStatus: 'UNPAID', attribution: { affiliateId: aff.id, source: 'CODE', referralCodeUsed: aff.code } });
      expect(d.shipping.phone).toBe(toE164(a.phone));
      expect(d.items).toHaveLength(1);
      expect(d.history).toHaveLength(1);
      expect((await api('GET', `/orders/${uuidv7()}`, { token: t })).status).toBe(404);
      expect((await api('GET', '/orders/abc', { token: t })).status).toBe(400);
    });

    it('luồng đầy đủ PLACED -> CONFIRMED -> SHIPPING -> DELIVERED -> COMPLETED: mốc thời gian, lịch sử, sự kiện từng bước', async () => {
      const t = admin();
      const adminId = uuidv7();
      const ta = token('ADMIN', adminId);
      const r = await place();
      const id = (await dbOrder(r.body.data.code)).id;

      const steps: Array<[string, string]> = [['confirm', 'CONFIRMED'], ['ship', 'SHIPPING'], ['deliver', 'DELIVERED'], ['complete', 'COMPLETED']];
      for (const [action, status] of steps) {
        const res = await api('POST', `/orders/${id}/${action}`, { token: ta });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(status);
      }
      const o = await dbOrder(r.body.data.code);
      expect(o).toMatchObject({ status: 5, receivedBy: 2 }); // ADMIN xác nhận sau khi CSKH xử lý
      expect(o.deliveredAt).toBeTruthy();
      expect(o.completedAt).toBeTruthy();
      expect(o.history.map((h) => h.toStatus).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(o.history.find((h) => h.toStatus === 2)).toMatchObject({ actorType: 3, actorId: adminId });

      const events = (await outbox(id)).filter((e) => e.event_type === 'ordering.order.status_changed');
      expect(events.map((e) => e.payload.toStatus)).toEqual(['CONFIRMED', 'SHIPPING', 'DELIVERED', 'COMPLETED']);
      expect(events[3].payload).toMatchObject({ fromStatus: 'DELIVERED', receivedBy: 'ADMIN', actorId: adminId });
      void t;
    });

    it('chặn chuyển trạng thái sai luồng', async () => {
      const t = admin();
      const id = (await dbOrder((await place()).body.data.code)).id;
      const act = (a: string, body?: object) => api('POST', `/orders/${id}/${a}`, { token: t, body });
      for (const a of ['ship', 'deliver', 'complete']) expect((await act(a)).status).toBe(422); // phải CONFIRMED trước
      expect((await act('return', { reason: 'Khách trả' })).status).toBe(422); // chỉ trả được đơn đã giao
      expect((await act('confirm')).status).toBe(200);
      expect((await act('confirm')).status).toBe(422);
      expect((await act('cancel', { reason: 'Hết hàng thực tế' })).status).toBe(200);
      for (const a of ['confirm', 'ship', 'deliver', 'complete']) expect((await act(a)).status).toBe(422); // CANCELLED là cuối
      expect((await act('cancel', { reason: 'ab' })).status).toBe(400); // lý do quá ngắn
      expect((await api('POST', `/orders/${uuidv7()}/confirm`, { token: t })).status).toBe(404);
    });

    it('hủy và trả hàng: ghi lý do, mốc thời gian, sự kiện', async () => {
      const t = admin();
      const c = (await dbOrder((await place()).body.data.code)).id;
      const cancelled = await api('POST', `/orders/${c}/cancel`, { token: t, body: { reason: 'Khách không nghe máy' } });
      expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Khách không nghe máy' });
      expect(cancelled.body.data.cancelledAt).toBeTruthy();

      const rid = (await dbOrder((await place()).body.data.code)).id;
      await advance(rid, ['confirm', 'ship', 'deliver']);
      const returned = await api('POST', `/orders/${rid}/return`, { token: t, body: { reason: 'Hàng không đúng mô tả' } });
      expect(returned.body.data).toMatchObject({ status: 'RETURNED', cancelReason: 'Hàng không đúng mô tả' });
      expect(returned.body.data.returnedAt).toBeTruthy();
      expect((await outbox(rid)).pop()!.payload).toMatchObject({ toStatus: 'RETURNED', fromStatus: 'DELIVERED' });
    });

    it('nhiều admin cùng chuyển một đơn: chỉ một thao tác thành công', async () => {
      const id = (await dbOrder((await place()).body.data.code)).id;
      const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', `/orders/${id}/confirm`, { token: admin() })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409 || r.status === 422)).toHaveLength(5);
      expect((await prisma.orderStatusHistory.count({ where: { orderId: id, toStatus: 2 } }))).toBe(1);
      expect((await outbox(id)).filter((e) => e.payload.toStatus === 'CONFIRMED')).toHaveLength(1);
    });

    it('đơn chuyển khoản phải được xác nhận ĐÃ THANH TOÁN mới giao được; quy tắc trạng thái thanh toán', async () => {
      const t = admin();
      const r = await place({ payment: 'BANK_QR' });
      const id = (await dbOrder(r.body.data.code)).id;
      await advance(id, ['confirm']);
      const blocked = await api('POST', `/orders/${id}/ship`, { token: t });
      expect(blocked.status).toBe(422);
      expect(blocked.body.error.message).toContain('thanh toán');

      expect((await api('POST', `/orders/${id}/payment`, { token: t, body: { status: 'REFUNDED' } })).status).toBe(422); // chưa thanh toán thì không hoàn
      const paid = await api('POST', `/orders/${id}/payment`, { token: t, body: { status: 'PAID', note: 'VCB 25/11' } });
      expect(paid.status).toBe(200);
      expect(paid.body.data.paymentStatus).toBe('PAID');
      expect((await api('POST', `/orders/${id}/payment`, { token: t, body: { status: 'PAID' } })).status).toBe(422); // đã thanh toán
      expect((await api('POST', `/orders/${id}/ship`, { token: t })).status).toBe(200);

      const note = (await prisma.orderStatusHistory.findMany({ where: { orderId: id }, orderBy: { createdAt: 'asc' } })).find((h) => h.fromStatus === h.toStatus);
      expect(note?.note).toBe('Thanh toán: UNPAID -> PAID (VCB 25/11)');
      expect((await outbox(id)).filter((e) => e.event_type === 'ordering.order.status_changed')).toHaveLength(2); // đổi thanh toán không phát sự kiện trạng thái

      expect((await api('POST', `/orders/${id}/payment`, { token: t, body: { status: 'REFUNDED' } })).body.data.paymentStatus).toBe('REFUNDED');
      expect((await api('POST', `/orders/${id}/payment`, { token: t, body: { status: 'LOST' } })).status).toBe(400);
    });

    it('COD ghi nhận đã thu tiền; không ghi nhận thanh toán cho đơn đã hủy', async () => {
      const t = admin();
      const id = (await dbOrder((await place()).body.data.code)).id;
      expect((await api('POST', `/orders/${id}/payment`, { token: t, body: { status: 'PAID' } })).body.data.paymentStatus).toBe('PAID');

      const c = (await dbOrder((await place()).body.data.code)).id;
      await api('POST', `/orders/${c}/cancel`, { token: t, body: { reason: 'Khách hủy' } });
      expect((await api('POST', `/orders/${c}/payment`, { token: t, body: { status: 'PAID' } })).status).toBe(422);
    });
  });

  // ═════════════════════════ CSKH ═════════════════════════
  describe('hàng chờ CSKH', () => {
    it('đơn đã giao chưa hoàn tất, lâu nhất lên đầu, kèm số ngày chờ và ghi chú liên hệ gần nhất', async () => {
      const t = admin();
      const adminId = uuidv7();
      const ta = token('ADMIN', adminId);
      const placed = [await place(), await place(), await place()];
      const orders = await Promise.all(placed.map((p) => dbOrder(p.body.data.code)));
      // Đặt mốc giao rất xa trong quá khứ để các đơn này đứng đầu hàng chờ, bất kể dữ liệu mẫu.
      const dayMs = 86_400_000;
      const base = Date.UTC(2020, 0, 1);
      await prisma.order.update({ where: { id: orders[0].id }, data: { status: 4, deliveredAt: new Date(base + 31 * dayMs) } }); // giao sau
      await prisma.order.update({ where: { id: orders[1].id }, data: { status: 4, deliveredAt: new Date(base) } }); // giao lâu nhất
      // đơn thứ ba chưa giao: không được có mặt

      const empty = await api('POST', `/orders/${orders[1].id}/care-notes`, { token: ta, body: { note: '' } });
      expect(empty.status).toBe(400);
      expect((await api('POST', `/orders/${orders[1].id}/care-notes`, { token: ta, body: { note: 'Gọi lần 1 chưa nghe máy', contactChannel: 'CALL' } })).status).toBe(201);
      const second = await api('POST', `/orders/${orders[1].id}/care-notes`, { token: ta, body: { note: 'Nhắn Zalo, khách hẹn mai trả lời', contactChannel: 'ZALO' } });
      expect(second.body.data).toMatchObject({ contactChannel: 'ZALO', createdBy: adminId });
      expect((await api('POST', `/orders/${orders[1].id}/care-notes`, { token: ta, body: { note: 'x', contactChannel: 'FAX' } })).status).toBe(400);
      expect((await api('POST', `/orders/${uuidv7()}/care-notes`, { token: ta, body: { note: 'x' } })).status).toBe(404);

      const q = await api('GET', '/orders/cskh-queue?pageSize=50', { token: t });
      expect(q.status).toBe(200);
      const codes = q.body.data.map((o: any) => o.code);
      expect(codes.slice(0, 2)).toEqual([orders[1].code, orders[0].code]); // lâu nhất trước
      expect(codes).not.toContain(orders[2].code);
      const top = q.body.data[0];
      expect(top).toMatchObject({ careNoteCount: 2, lastCareNote: { note: 'Nhắn Zalo, khách hẹn mai trả lời', contactChannel: 'ZALO' } });
      expect(top.daysWaiting).toBeGreaterThan(2000);
      expect(q.body.data[1]).toMatchObject({ careNoteCount: 0, lastCareNote: null });
      expect(q.body.meta.pagination.total).toBeGreaterThanOrEqual(2);

      // Sau khi admin chuyển COMPLETED thì rời khỏi hàng chờ; chi tiết đơn có ghi chú CSKH.
      expect((await api('POST', `/orders/${orders[1].id}/complete`, { token: t })).status).toBe(200);
      expect((await api('GET', '/orders/cskh-queue?pageSize=50', { token: t })).body.data.map((o: any) => o.code)).not.toContain(orders[1].code);
      expect((await api('GET', `/orders/${orders[1].id}`, { token: t })).body.data.careNotes.map((n: any) => n.note)).toEqual(['Gọi lần 1 chưa nghe máy', 'Nhắn Zalo, khách hẹn mai trả lời']);
    });
  });

  // ═════════════════════════ CTV xem đơn ═════════════════════════
  describe('CTV xem đơn do mình giới thiệu', () => {
    it('chỉ thấy đơn của mình, khách chỉ hiện tên viết tắt, không có SĐT hay địa chỉ', async () => {
      const mine = fake.addAffiliate({ code: `it${rand(6)}` });
      const other = fake.addAffiliate({ code: `it${rand(6)}` });
      const userId = uuidv7();
      fake.userToAffiliate.set(userId, mine.id);
      const t = token('AFFILIATE', userId);

      const a = await place({ referralCode: mine.code });
      const b = await place({ referralCode: mine.code });
      const c = await place({ referralCode: other.code });
      const idB = (await dbOrder(b.body.data.code)).id;
      await advance(idB, ['confirm']);

      const list = await api('GET', '/me/orders?sort=placedAt', { token: t });
      expect(list.status).toBe(200);
      expect(list.body.data.map((o: any) => o.code)).toEqual([a.body.data.code, b.body.data.code]);
      expect(list.body.data[0].customer).toMatch(/^[A-ZĐ]\.[A-ZĐ]/); // tên viết tắt
      expect(JSON.stringify(list.body)).not.toMatch(/"(shipPhone|phone|shipping|addressLine|customerId|shipName)"|\+84/);
      expect((await api('GET', '/me/orders?filter[status]=CONFIRMED', { token: t })).body.data.map((o: any) => o.code)).toEqual([b.body.data.code]);

      expect((await api('GET', `/me/orders/${idB}`, { token: t })).body.data).toMatchObject({ code: b.body.data.code, items: [expect.any(Object)] });
      expect((await api('GET', `/me/orders/${(await dbOrder(c.body.data.code)).id}`, { token: t })).status).toBe(404); // đơn của CTV khác
    });

    it('tài khoản chưa có hồ sơ CTV: 404; affiliate lỗi: 503', async () => {
      expect((await api('GET', '/me/orders', { token: token('AFFILIATE') })).status).toBe(404);
      fake.mode.affiliate = 'down';
      const r = await api('GET', '/me/orders', { token: token('AFFILIATE') });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  // ═════════════════════════ API nội bộ cho service customer ═════════════════════════
  describe('API nội bộ: thống kê đơn theo khách', () => {
    const post = (body: object, key: string | null = INTERNAL_KEY) =>
      api('POST', '/internal/customers/order-stats', { body, headers: key ? { 'x-internal-key': key } : {} });

    it('cần khóa nội bộ', async () => {
      expect((await post({ customerIds: [uuidv7()] }, null)).status).toBe(401);
      expect((await post({ customerIds: [uuidv7()] }, 'sai-khoa-sai-khoa-sai-khoa-1')).status).toBe(401);
      expect((await api('GET', `/internal/customers/${uuidv7()}/orders`)).status).toBe(401);
    });

    it('số đơn hợp lệ, tổng chi, đơn gần nhất; bỏ qua đơn hủy và trả hàng; khách chưa có đơn không xuất hiện', async () => {
      const t = admin();
      const phone = newPhone();
      const a = await place({ phone, items: [{ productId: product({ price: 100_000 }).id, quantity: 1 }] }); // 130.000 gồm ship
      const b = await place({ phone, items: [{ productId: product({ price: 600_000 }).id, quantity: 1 }] }); // 600.000 miễn ship
      const c = await place({ phone, items: [{ productId: product({ price: 50_000 }).id, quantity: 1 }] }); // sẽ hủy
      const customerId = fake.customers.get(toE164(phone))!;
      await api('POST', `/orders/${(await dbOrder(c.body.data.code)).id}/cancel`, { token: t, body: { reason: 'Khách hủy' } });

      const stranger = uuidv7();
      const r = await post({ customerIds: [customerId, stranger, customerId] });
      expect(r.status).toBe(200);
      expect(r.body.data.stats).toHaveLength(1);
      const lastPlaced = (await dbOrder(b.body.data.code)).placedAt;
      expect(r.body.data.stats[0]).toMatchObject({ customerId, validOrders: 2, totalSpent: 130_000 + 600_000 });
      expect(new Date(r.body.data.stats[0].lastOrderAt).getTime()).toBeLessThanOrEqual(lastPlaced.getTime());
      void a;

      expect((await post({ customerIds: [] })).status).toBe(400);
      expect((await post({ customerIds: ['abc'] })).status).toBe(400);
      expect((await post({ customerIds: Array.from({ length: 501 }, () => uuidv7()) })).status).toBe(400);
    });

    it('các đơn gần nhất của một khách (mới nhất trước), kể cả đơn đã hủy', async () => {
      const phone = newPhone();
      const first = await place({ phone });
      const second = await place({ phone });
      const customerId = fake.customers.get(toE164(phone))!;
      const r = await api('GET', `/internal/customers/${customerId}/orders?limit=5`, { headers: { 'x-internal-key': INTERNAL_KEY } });
      expect(r.status).toBe(200);
      expect(r.body.data.map((o: any) => o.code)).toEqual([second.body.data.code, first.body.data.code]);
      expect(r.body.data[0]).toMatchObject({ status: 'PLACED', totalAmount: expect.any(Number) });
      expect((await api('GET', `/internal/customers/${customerId}/orders?limit=0`, { headers: { 'x-internal-key': INTERNAL_KEY } })).status).toBe(400);
      expect((await api('GET', '/internal/customers/abc/orders', { headers: { 'x-internal-key': INTERNAL_KEY } })).status).toBe(400);
    });
  });

  describe('tổng quan và cấu hình (admin)', () => {
    it('cần ADMIN: không token 401, CTV 403', async () => {
      for (const path of ['/orders/stats', '/order-settings']) {
        expect((await api('GET', path)).status).toBe(401);
        expect((await api('GET', path, { token: token('AFFILIATE') })).status).toBe(403);
      }
      expect((await api('PATCH', '/order-settings/shipping.flat_fee', { token: token('AFFILIATE'), body: { value: 1 } })).status).toBe(403);
    });

    it('tổng quan: đơn mới đặt được tính vào hôm nay, theo trạng thái và biểu đồ 14 ngày; đơn hủy không tính doanh thu', async () => {
      const before = (await api('GET', '/orders/stats', { token: admin() })).body.data;
      const a = await place({ payment: 'BANK_QR' });
      const b = await place({ payment: 'COD' });
      const cancelled = await place({ payment: 'COD' });
      expect((await api('POST', `/public/orders/${cancelled.body.data.code}/cancel`, { body: { phone: cancelled.phone, reason: 'test tổng quan' } })).status).toBe(200);

      const after = (await api('GET', '/orders/stats', { token: admin() })).body.data;
      const valid = a.body.data.totalAmount + b.body.data.totalAmount;
      expect(after.today.orders - before.today.orders).toBe(2);
      expect(after.today.revenue - before.today.revenue).toBe(valid);
      expect(after.last7Days.orders).toBeGreaterThanOrEqual(after.today.orders);
      expect(after.last30Days.revenue).toBeGreaterThanOrEqual(after.last7Days.revenue);
      expect(after.byStatus.PLACED - before.byStatus.PLACED).toBe(2);
      expect(after.byStatus.CANCELLED - before.byStatus.CANCELLED).toBe(1);
      expect(after.awaitingPayment - before.awaitingPayment).toBe(1);
      expect(Object.keys(after.byStatus).sort()).toEqual(['CANCELLED', 'COMPLETED', 'CONFIRMED', 'DELIVERED', 'PLACED', 'RETURNED', 'SHIPPING']);
      // biểu đồ: đủ 14 ngày liên tiếp, ngày cuối là hôm nay (giờ VN), tổng khớp với cửa sổ 14 ngày
      expect(after.daily).toHaveLength(14);
      const dates = after.daily.map((d: { date: string }) => d.date);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(14);
      expect(after.daily[13].revenue - (before.daily[13]?.revenue ?? 0)).toBeGreaterThanOrEqual(valid);
    });

    it('báo cáo theo khoảng ngày: cần ADMIN, kiểm tra tham số, số liệu khớp đơn vừa đặt', async () => {
      const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
      const report = (from: string, to: string, token = admin()) => api('GET', `/orders/report?from=${from}&to=${to}`, { token });
      expect((await api('GET', `/orders/report?from=${today}&to=${today}`)).status).toBe(401);
      expect((await report(today, today, token('AFFILIATE'))).status).toBe(403);
      for (const [f, t] of [['2026-02-30', today], ['abc', today], [today, '2026-13-01'], ['2026-06-02', '2026-06-01'], ['2024-01-01', '2026-01-01'], ['', '']]) {
        expect((await report(f, t)).status, `${f}..${t}`).toBe(400);
      }
      expect((await api('GET', '/orders/report', { token: admin() })).status).toBe(400);

      const before = (await report(today, today)).body.data;
      const a = await place({ payment: 'BANK_QR' });
      const b = await place({ payment: 'COD' });
      const cancelled = await place({ payment: 'COD' });
      expect((await api('POST', `/public/orders/${cancelled.body.data.code}/cancel`, { body: { phone: cancelled.phone, reason: 'test báo cáo' } })).status).toBe(200);
      const after = (await report(today, today)).body.data;

      const valid = a.body.data.totalAmount + b.body.data.totalAmount;
      expect(after.range).toEqual({ from: today, to: today, days: 1 });
      expect(after.totals.orders - before.totals.orders).toBe(2);
      expect(after.totals.revenue - before.totals.revenue).toBe(valid);
      expect(after.byStatus.PLACED - before.byStatus.PLACED).toBe(2);
      expect(after.byStatus.CANCELLED - before.byStatus.CANCELLED).toBe(1);
      expect(after.daily).toEqual([{ date: today, orders: after.totals.orders, revenue: after.totals.revenue }]);
      expect(after.totals.averageOrderValue).toBe(Math.round(after.totals.revenue / after.totals.orders));
      const methods = Object.fromEntries(after.byPayment.map((m: any) => [m.method, m]));
      expect(methods.BANK_QR.orders).toBeGreaterThanOrEqual(1);
      expect(methods.COD.orders).toBeGreaterThanOrEqual(1);
      expect(after.topProducts.length).toBeGreaterThan(0);
      expect(after.topProducts.length).toBeLessThanOrEqual(10);
      expect(after.topProducts[0]).toMatchObject({ productId: expect.any(String), name: expect.any(String), quantity: expect.any(Number), revenue: expect.any(Number) });

      // khoảng nhiều ngày: đủ ngày liên tiếp, tổng ngày khớp tổng khoảng; khoảng trong quá khứ không có đơn mới
      const week = (await report('2026-01-01', '2026-01-10')).body.data;
      expect(week.daily).toHaveLength(10);
      expect(week.daily.reduce((n: number, d: any) => n + d.revenue, 0)).toBe(week.totals.revenue);
      const long = (await report('2025-01-01', '2025-12-31')).body.data; // 365 ngày: vẫn trong giới hạn 366
      expect(long.daily).toHaveLength(365);
    });

    it('cấu hình: liệt kê đủ khóa sửa được, đổi phí ship có hiệu lực ngay và ghi người sửa', async () => {
      const list = (await api('GET', '/order-settings', { token: admin() })).body.data as Array<{ key: string; kind: string }>;
      expect(list.map((x) => x.key).sort()).toEqual(['payment.bank_account_holder', 'payment.bank_account_no', 'payment.bank_name', 'payment.hold_minutes', 'shipping.flat_fee', 'shipping.free_threshold']);
      const original = (await api('GET', '/order-settings', { token: admin() })).body.data.find((x: { key: string }) => x.key === 'shipping.flat_fee').value;
      const adminId = uuidv7();
      const r = await api('PATCH', '/order-settings/shipping.flat_fee', { token: token('ADMIN', adminId), body: { value: 45_000 } });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ key: 'shipping.flat_fee', value: 45_000, updatedBy: adminId });
      const order = await place({ items: [{ productId: product({ price: 10_000 }).id, quantity: 1 }] });
      expect(order.body.data.shippingFee).toBe(45_000);
      await api('PATCH', '/order-settings/shipping.flat_fee', { token: admin(), body: { value: original ?? 30_000 } });
    });

    it('cấu hình: từ chối khóa lạ (404), sai kiểu hoặc ngoài giới hạn (400), số tài khoản sai định dạng', async () => {
      expect((await api('PATCH', '/order-settings/khong.co', { token: admin(), body: { value: 1 } })).status).toBe(404);
      for (const [key, value] of [['shipping.flat_fee', -1], ['shipping.flat_fee', 1.5], ['shipping.flat_fee', 'abc'], ['payment.hold_minutes', 0], ['payment.bank_name', 123], ['payment.bank_name', '   '], ['payment.bank_account_no', 'abc123']] as const) {
        const r = await api('PATCH', `/order-settings/${key}`, { token: admin(), body: { value } });
        expect(r.status, `${key}=${JSON.stringify(value)}`).toBe(400);
      }
      expect((await api('PATCH', '/order-settings/shipping.flat_fee', { token: admin(), body: {} })).status).toBe(400);
    });

    it('cấu hình tài khoản nhận tiền: lưu có cắt khoảng trắng, hướng dẫn chuyển khoản dùng ngay', async () => {
      const keep = (await api('GET', '/order-settings', { token: admin() })).body.data as Array<{ key: string; value: string | null }>;
      const prev = (k: string) => keep.find((x) => x.key === k)?.value ?? null;
      const set = (key: string, value: string) => api('PATCH', `/order-settings/${key}`, { token: admin(), body: { value } });
      expect((await set('payment.bank_name', '  Techcombank  ')).body.data.value).toBe('Techcombank');
      await set('payment.bank_account_no', '19031234567890');
      await set('payment.bank_account_holder', 'CONG TY TEST');
      const o = await place({ payment: 'BANK_QR' });
      expect(o.body.data.transferInstructions).toMatchObject({ bankName: 'Techcombank', accountNo: '19031234567890', accountHolder: 'CONG TY TEST' });
      for (const k of ['payment.bank_name', 'payment.bank_account_no', 'payment.bank_account_holder']) if (prev(k)) await set(k, prev(k) as string);
    });
  });

  it('trạng thái lưu dạng số trong DB, API trả tên chuỗi', async () => {
    const r = await place({ payment: 'BANK_QR' });
    const raw = await prisma.$queryRawUnsafe<Array<{ status: number; payment_method: number; payment_status: number }>>(
      `SELECT status, payment_method, payment_status FROM ordering.orders WHERE code = $1`, r.body.data.code,
    );
    expect(raw[0]).toEqual({ status: OrderStatusCodec.toCode('PLACED'), payment_method: 2, payment_status: PaymentStatusCodec.toCode('UNPAID') });
    expect(r.body.data).toMatchObject({ status: 'PLACED', paymentMethod: 'BANK_QR', paymentStatus: 'UNPAID' });
  });
});
