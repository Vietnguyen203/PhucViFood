// Test tích hợp service affiliate: Postgres (affiliate_db) + RabbitMQ thật, gọi API qua HTTP thật.
// Chạy: pnpm --filter @phucvi/affiliate test:integration
import * as amqp from 'amqplib';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { signAccessToken } from '@phucvi/shared-library/auth';
import {
  AffiliateStatusCodec, CommissionStatusCodec, EventTypes, createEnvelope, type AffiliateStatus, type EventEnvelope,
} from '@phucvi/shared-library/contracts';
import { RabbitMqClient } from '@phucvi/shared-library/messaging';
import { uuidv7 } from '@phucvi/shared-library/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { loadConfig, type AppConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';

const enabled = process.env.RUN_INTEGRATION === '1';
const DB_URL = process.env.AFFILIATE_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/affiliate_db';
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://phucvi:phucvi@localhost:5672';
const INTERNAL_KEY = 'integration-internal-key-1234567890';

const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!enabled)('service affiliate (HTTP + Postgres + RabbitMQ thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfig;
  let base: string;
  let publisher: RabbitMqClient;
  let rawConn: Awaited<ReturnType<typeof amqp.connect>>;

  // Theo dõi dữ liệu test để dọn.
  const affiliateIds: string[] = [];
  const publishedEventIds: string[] = [];
  const orderCodes: string[] = [];

  // ───────── Hỗ trợ ─────────
  const tokenFor = (userId: string, role: 'ADMIN' | 'AFFILIATE', email = `${rand(6)}@example.com`) =>
    signAccessToken({ id: userId, email, role }, config.jwt);
  const adminToken = () => tokenFor(uuidv7(), 'ADMIN');

  async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, what: string, ms = 10_000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - start > ms) throw new Error(`Hết thời gian chờ: ${what}`);
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  /** Tạo CTV trực tiếp trong DB (không phụ thuộc dữ liệu seed hay ngày hiện tại). */
  async function makeAffiliate(over: { status?: AffiliateStatus; start?: string; end?: string | null; rate?: number } = {}) {
    const userId = uuidv7();
    const code = `it${rand(6)}`;
    const phone = `+849${digits(8)}`;
    const a = await prisma.affiliate.create({
      data: {
        userId, fullName: `IT-${code}`, phone, referralCode: code, status: AffiliateStatusCodec.toCode(over.status ?? 'ACTIVE'),
        contractStart: new Date(`${over.start ?? day(-1)}T00:00:00Z`),
        contractEnd: over.end === null ? null : new Date(`${over.end ?? day(365)}T00:00:00Z`),
        commissionRateBps: over.rate ?? 1000,
      },
    });
    affiliateIds.push(a.id);
    return { ...a, token: tokenFor(userId, 'AFFILIATE', `${code}@example.com`) };
  }

  const placedEvent = (o: { orderId?: string; code?: string; affiliateId: string | null; rate: number | null; subtotal: number; self?: boolean }) => {
    const orderId = o.orderId ?? uuidv7();
    const code = o.code ?? `IT-${rand(8).toUpperCase()}`;
    orderCodes.push(code);
    return createEnvelope({
      type: EventTypes.ORDER_PLACED, source: 'ordering', aggregateType: 'Order', aggregateId: orderId,
      payload: {
        orderId, code, customerId: uuidv7(), placedAt: new Date().toISOString(),
        subtotalAmount: o.subtotal, shippingFee: 30_000, totalAmount: o.subtotal + 30_000,
        affiliateId: o.affiliateId, linkId: null, channelCode: 'facebook', referralCodeUsed: 'x',
        attributionSource: o.affiliateId ? 'LINK' : null, isSelfPurchase: o.self ?? false, commissionRateBps: o.rate, items: [],
      },
    });
  };
  const statusEvent = (placed: EventEnvelope<'ordering.order.placed'>, to: 'COMPLETED' | 'CANCELLED' | 'RETURNED' | 'DELIVERED', receivedBy: 'CUSTOMER' | 'ADMIN' | null = null) =>
    createEnvelope({
      type: EventTypes.ORDER_STATUS_CHANGED, source: 'ordering', aggregateType: 'Order', aggregateId: placed.payload.orderId,
      payload: {
        orderId: placed.payload.orderId, code: placed.payload.code, fromStatus: null, toStatus: to, actorType: 'ADMIN',
        actorId: null, at: new Date().toISOString(), receivedBy,
      },
    });
  async function publish(...events: EventEnvelope[]) {
    for (const e of events) { publishedEventIds.push(e.id); await publisher.publish(e); }
  }
  const commissionOf = (orderId: string) => prisma.commission.findUnique({ where: { orderId } });
  const waitCommission = (orderId: string, status?: 'ESTIMATED' | 'CONFIRMED' | 'PAID' | 'CANCELLED') =>
    waitFor(async () => {
      const c = await commissionOf(orderId);
      return c && (!status || c.status === CommissionStatusCodec.toCode(status)) ? c : null;
    }, `hoa hồng ${orderId} ${status ?? ''}`);
  /** Chờ tới khi sự kiện đã được consumer xử lý xong (có dòng inbox). */
  const waitProcessed = (eventId: string) =>
    waitFor(async () => {
      const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM commission.inbox_events WHERE message_id = $1::uuid`, eventId);
      return Number(r[0].n) > 0;
    }, `sự kiện ${eventId} được xử lý`);
  const outboxCount = async (schema: 'affiliate' | 'commission', aggregateId: string) =>
    Number((await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM ${schema}.outbox_events WHERE aggregate_id = $1::uuid`, aggregateId))[0].n);

  beforeAll(async () => {
    process.env.AFFILIATE_DATABASE_URL = DB_URL;
    config = loadConfig({
      AFFILIATE_DATABASE_URL: DB_URL, RABBITMQ_URL: RABBIT_URL,
      JWT_ACCESS_SECRET: 'integration-test-secret-integration-test-secret', JWT_ISSUER: 'phucvi-it',
      INTERNAL_API_KEY: INTERNAL_KEY, AFFILIATE_EVENT_QUEUE: `affiliate.it.${rand(8)}`, OUTBOX_RELAY_ENABLED: 'false',
    });
    app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
    setupApp(app, { globalPrefix: 'api' });
    await app.listen(0);
    base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api`;
    prisma = app.get(PrismaService);
    publisher = new RabbitMqClient({ url: RABBIT_URL, serviceName: 'ordering' });
    await publisher.connect(5);
    rawConn = await amqp.connect(RABBIT_URL);
  });

  afterAll(async () => {
    const ids = affiliateIds;
    await prisma.$executeRawUnsafe(`DELETE FROM commission.commissions WHERE order_code LIKE 'IT-%' OR affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM commission.payouts WHERE affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM commission.outbox_events WHERE payload->'payload'->>'affiliateId' = ANY($1::text[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM affiliate.outbox_events WHERE aggregate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM commission.inbox_events WHERE message_id = ANY($1::uuid[])`, publishedEventIds);
    await prisma.$executeRawUnsafe(`DELETE FROM tracking.referral_clicks WHERE affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM tracking.tracking_events WHERE affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM affiliate.affiliate_links WHERE affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM affiliate.affiliates WHERE id = ANY($1::uuid[])`, ids);
    const ch = await rawConn.createChannel();
    await ch.deleteQueue(config.eventQueue).catch(() => undefined);
    await ch.deleteQueue(`${config.eventQueue}.dlq`).catch(() => undefined);
    await rawConn.close();
    await publisher.close();
    await app.close();
    void orderCodes;
  });

  // ═════════════════════════ Phân quyền ═════════════════════════
  describe('phân quyền', () => {
    it('API cần đăng nhập, đúng vai trò; API công khai không cần', async () => {
      expect((await api('GET', '/me/affiliate')).status).toBe(401);
      expect((await api('GET', '/me/affiliate', { token: adminToken() })).status).toBe(403); // ADMIN không có hồ sơ CTV
      expect((await api('GET', '/affiliates', { token: (await makeAffiliate()).token })).status).toBe(403);
      expect((await api('GET', '/commissions')).status).toBe(401);
      expect((await api('POST', '/payouts', { token: (await makeAffiliate()).token, body: {} })).status).toBe(403);
      expect((await api('GET', '/health')).status).toBe(200);
      expect((await api('GET', '/public/referrals/khongco1')).status).toBe(200);
    });
  });

  // ═════════════════════════ Hồ sơ CTV và duyệt ═════════════════════════
  describe('hồ sơ CTV và duyệt', () => {
    const userId = uuidv7();
    let token = '';
    beforeAll(() => { token = tokenFor(userId, 'AFFILIATE'); }); // sau khi cấu hình đã được khởi tạo
    const code = `it${rand(6)}`;
    const phone = `09${digits(8)}`;
    let affiliateId = '';

    it('chưa có hồ sơ thì 404', async () => {
      expect((await api('GET', '/me/affiliate', { token })).status).toBe(404);
    });

    it('CTV tạo hồ sơ: PENDING, SĐT chuẩn hóa +84, mã lưu chữ thường', async () => {
      const r = await api('POST', '/me/affiliate', { token, body: { fullName: '  Nguyễn Thị Test ', phone, referralCode: code.toUpperCase(), bankName: 'Vietcombank', bankAccountNo: '0011000000009' } });
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ status: 'PENDING', referralCode: code, fullName: 'Nguyễn Thị Test', userId });
      expect(r.body.data.phone).toBe(`+84${phone.slice(1)}`);
      affiliateId = r.body.data.id;
      affiliateIds.push(affiliateId);
      expect((await api('GET', '/me/affiliate', { token })).body.data.id).toBe(affiliateId);
    });

    it('ghi sự kiện PENDING vào outbox cùng transaction', async () => {
      expect(await outboxCount('affiliate', affiliateId)).toBe(1);
    });

    it('từ chối: hồ sơ thứ hai, SĐT hoặc mã đã dùng (không phân biệt hoa thường), dữ liệu sai, tự đặt status', async () => {
      const dup = await api('POST', '/me/affiliate', { token, body: { fullName: 'Test Hai', phone: `09${digits(8)}`, referralCode: `it${rand(6)}` } });
      expect(dup.status).toBe(409);

      const other = tokenFor(uuidv7(), 'AFFILIATE');
      const samePhone = await api('POST', '/me/affiliate', { token: other, body: { fullName: 'Test Ba', phone, referralCode: `it${rand(6)}` } });
      expect(samePhone.status).toBe(409);
      expect(samePhone.body.error.message).toContain('Số điện thoại');
      const sameCode = await api('POST', '/me/affiliate', { token: other, body: { fullName: 'Test Ba', phone: `09${digits(8)}`, referralCode: code.toUpperCase() } });
      expect(sameCode.status).toBe(409);
      expect(sameCode.body.error.message).toContain('Mã giới thiệu');

      for (const body of [
        { fullName: 'Test', phone: '123', referralCode: `it${rand(6)}` },
        { fullName: 'Test', phone: `09${digits(8)}`, referralCode: 'abc' },
        { fullName: 'Test', phone: `09${digits(8)}`, referralCode: 'admin' },
        { fullName: 'Test', phone: `09${digits(8)}`, referralCode: `it${rand(6)}`, status: 'ACTIVE' }, // không tự kích hoạt được
      ]) expect((await api('POST', '/me/affiliate', { token: other, body })).status).toBe(400);
    });

    it('CTV sửa họ tên và thông tin nhận tiền, không sửa được SĐT hay mã', async () => {
      const ok = await api('PATCH', '/me/affiliate', { token, body: { bankName: 'Techcombank' } });
      expect(ok.status).toBe(200);
      expect(ok.body.data.bankName).toBe('Techcombank');
      expect((await api('PATCH', '/me/affiliate', { token, body: { phone: '0912345678' } })).status).toBe(400);
      expect((await api('PATCH', '/me/affiliate', { token, body: { referralCode: 'doima1' } })).status).toBe(400);
    });

    it('admin xem danh sách, tìm kiếm, lọc theo trạng thái', async () => {
      const admin = adminToken();
      const found = await api('GET', `/affiliates?q=${code}&filter[status]=PENDING`, { token: admin });
      expect(found.status).toBe(200);
      expect(found.body.data.map((a: any) => a.id)).toEqual([affiliateId]);
      expect((await api('GET', `/affiliates/${affiliateId}`, { token: admin })).body.data.referralCode).toBe(code);
      expect((await api('GET', '/affiliates?filter[status]=2', { token: admin })).status).toBe(400); // lọc bằng tên, không bằng mã số
    });

    it('duyệt: cần ngày bắt đầu hợp đồng hợp lệ; khoảng ngày phải đúng', async () => {
      const admin = adminToken();
      expect((await api('POST', `/affiliates/${affiliateId}/approve`, { token: admin, body: {} })).status).toBe(400);
      expect((await api('POST', `/affiliates/${affiliateId}/approve`, { token: admin, body: { contractStart: '2026-02-30' } })).status).toBe(400);
      expect((await api('POST', `/affiliates/${affiliateId}/approve`, { token: admin, body: { contractStart: '2026-06-01', contractEnd: '2026-05-01' } })).status).toBe(400);
      const ok = await api('POST', `/affiliates/${affiliateId}/approve`, { token: admin, body: { contractStart: day(-1), contractEnd: day(365), commissionRateBps: 1200, note: 'Duyệt' } });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ status: 'ACTIVE', commissionRateBps: 1200, contractStart: day(-1), contractEnd: day(365), note: 'Duyệt' });
      expect(ok.body.data.approvedAt).toBeTruthy();
    });

    it('chỉ chuyển trạng thái theo luồng hợp lệ', async () => {
      const admin = adminToken();
      const act = (what: string, body: object = {}) => api('POST', `/affiliates/${affiliateId}/${what}`, { token: admin, body });
      expect((await act('approve', { contractStart: day(-1) })).status).toBe(422); // đã ACTIVE
      expect((await act('reject')).status).toBe(422); // ACTIVE không từ chối được
      expect((await act('reactivate')).status).toBe(422); // chưa bị khóa
      expect((await act('suspend', { note: 'Vi phạm' })).body.data.status).toBe('SUSPENDED');
      expect((await act('suspend')).status).toBe(422);
      expect((await act('reactivate')).body.data.status).toBe('ACTIVE');
      expect((await api('POST', `/affiliates/${uuidv7()}/suspend`, { token: admin, body: {} })).status).toBe(404);
    });

    it('mỗi lần đổi trạng thái đều phát sự kiện: PENDING, ACTIVE, SUSPENDED, ACTIVE', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ event_type: string; to_status: string }>>(
        `SELECT event_type, payload->'payload'->>'toStatus' AS to_status FROM affiliate.outbox_events WHERE aggregate_id = $1::uuid ORDER BY created_at, id`, affiliateId,
      );
      expect(rows.map((r) => r.to_status)).toEqual(['PENDING', 'ACTIVE', 'SUSPENDED', 'ACTIVE']);
      expect(new Set(rows.map((r) => r.event_type))).toEqual(new Set(['affiliate.affiliate.status_changed']));
    });

    it('từ chối hồ sơ PENDING; admin chỉnh tỷ lệ và hợp đồng', async () => {
      const admin = adminToken();
      const t = tokenFor(uuidv7(), 'AFFILIATE');
      const created = await api('POST', '/me/affiliate', { token: t, body: { fullName: 'Test Bốn', phone: `09${digits(8)}`, referralCode: `it${rand(6)}` } });
      affiliateIds.push(created.body.data.id);
      const rejected = await api('POST', `/affiliates/${created.body.data.id}/reject`, { token: admin, body: { note: 'Thiếu thông tin' } });
      expect(rejected.body.data.status).toBe('REJECTED');
      expect((await api('POST', `/affiliates/${created.body.data.id}/approve`, { token: admin, body: { contractStart: day(0) } })).status).toBe(422); // REJECTED là cuối

      const edit = await api('PATCH', `/affiliates/${affiliateId}`, { token: admin, body: { commissionRateBps: 1500, contractEnd: day(400) } });
      expect(edit.status).toBe(200);
      expect(edit.body.data).toMatchObject({ commissionRateBps: 1500, contractEnd: day(400) });
      expect((await api('PATCH', `/affiliates/${affiliateId}`, { token: admin, body: { commissionRateBps: 20_000 } })).status).toBe(400);
      expect((await api('PATCH', `/affiliates/${affiliateId}`, { token: admin, body: { contractEnd: '2000-01-01' } })).status).toBe(400); // trước ngày bắt đầu
      expect((await api('PATCH', `/affiliates/${affiliateId}`, { token: admin, body: { status: 'ACTIVE' } })).status).toBe(400); // không đổi trạng thái qua PATCH
    });
  });

  // ═════════════════════════ Link theo kênh ═════════════════════════
  describe('link theo kênh', () => {
    it('CTV tạo, liệt kê, tắt link; chỉ thấy và sửa link của mình', async () => {
      const a = await makeAffiliate();
      const b = await makeAffiliate();
      const created = await api('POST', '/me/links', { token: a.token, body: { channelCode: ' FaceBook ', label: 'Facebook cá nhân' } });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ channelCode: 'facebook', isActive: true, path: `/r/${a.referralCode}?c=facebook` });

      expect((await api('POST', '/me/links', { token: a.token, body: { channelCode: 'facebook', label: 'Trùng' } })).status).toBe(409);
      expect((await api('POST', '/me/links', { token: a.token, body: { channelCode: 'a b', label: 'Sai' } })).status).toBe(400);
      expect((await api('POST', '/me/links', { token: b.token, body: { channelCode: 'facebook', label: 'CTV khác dùng được' } })).status).toBe(201);

      expect((await api('GET', '/me/links', { token: a.token })).body.data).toHaveLength(1);
      const off = await api('PATCH', `/me/links/${created.body.data.id}`, { token: a.token, body: { isActive: false } });
      expect(off.body.data.isActive).toBe(false);
      expect((await api('PATCH', `/me/links/${created.body.data.id}`, { token: b.token, body: { isActive: true } })).status).toBe(404); // link của CTV khác
    });
  });

  // ═════════════════════════ Bấm link và tương tác ═════════════════════════
  describe('bấm link giới thiệu và tương tác', () => {
    it('ghi nhận lượt bấm, trả cookie; mã không phân biệt hoa thường; gắn link theo kênh', async () => {
      const a = await makeAffiliate();
      const link = (await api('POST', '/me/links', { token: a.token, body: { channelCode: 'tiktok', label: 'TikTok' } })).body.data;

      const r = await api('POST', '/public/referrals/click', { body: { code: a.referralCode.toUpperCase(), channel: 'TikTok', landingPath: `/r/${a.referralCode}?c=tiktok` }, headers: { 'user-agent': 'IT-agent' } });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ valid: true, cookie: { code: a.referralCode, channelCode: 'tiktok', maxAgeDays: 30 } });
      expect(r.body.data.visitorId).toMatch(/^[0-9a-f-]{36}$/);

      const row = await prisma.referralClick.findFirstOrThrow({ where: { affiliateId: a.id }, orderBy: { createdAt: 'desc' } });
      expect(row).toMatchObject({ linkId: link.id, channelCode: 'tiktok', visitorId: r.body.data.visitorId, landingPath: `/r/${a.referralCode}?c=tiktok`, userAgent: 'IT-agent' });

      // Bấm lại với cùng visitorId, kênh chưa có link: vẫn ghi, linkId null.
      const again = await api('POST', '/public/referrals/click', { body: { code: a.referralCode, channel: 'zalo', visitorId: r.body.data.visitorId, landingPath: '/r/x' } });
      expect(again.body.data.visitorId).toBe(r.body.data.visitorId);
      const row2 = await prisma.referralClick.findFirstOrThrow({ where: { affiliateId: a.id, channelCode: 'zalo' } });
      expect(row2.linkId).toBeNull();
    });

    it('mã không hợp lệ, CTV chưa duyệt, bị khóa hoặc hết hợp đồng: không ghi, không cấp cookie', async () => {
      const cases = [
        await makeAffiliate({ status: 'PENDING' }),
        await makeAffiliate({ status: 'SUSPENDED' }),
        await makeAffiliate({ start: day(-120), end: day(-30) }), // hợp đồng đã hết hạn
        await makeAffiliate({ start: day(10), end: day(100) }), // chưa tới hạn
      ];
      for (const a of cases) {
        const r = await api('POST', '/public/referrals/click', { body: { code: a.referralCode, landingPath: '/r/x' } });
        expect(r.body.data).toEqual({ valid: false });
        expect(await prisma.referralClick.count({ where: { affiliateId: a.id } })).toBe(0);
        expect((await api('GET', `/public/referrals/${a.referralCode}`)).body.data).toEqual({ valid: false });
      }
      expect((await api('POST', '/public/referrals/click', { body: { code: 'khongco123', landingPath: '/r/x' } })).body.data).toEqual({ valid: false });
      expect((await api('POST', '/public/referrals/click', { body: { code: 'abcd' } })).status).toBe(400); // thiếu landingPath
    });

    it('GET /public/referrals/:code báo hợp lệ cho CTV còn hiệu lực', async () => {
      const a = await makeAffiliate();
      expect((await api('GET', `/public/referrals/${a.referralCode.toUpperCase()}`)).body.data).toEqual({ valid: true });
    });

    it('ghi tương tác và thống kê cho CTV', async () => {
      const a = await makeAffiliate();
      const visitorId = uuidv7();
      await api('POST', '/public/referrals/click', { body: { code: a.referralCode, channel: 'facebook', visitorId, landingPath: '/r/x' } });
      await api('POST', '/public/referrals/click', { body: { code: a.referralCode, channel: 'facebook', visitorId: uuidv7(), landingPath: '/r/x' } });
      await api('POST', '/public/referrals/click', { body: { code: a.referralCode, channel: 'facebook', visitorId, landingPath: '/r/x' } });

      const productId = uuidv7();
      const ev = await api('POST', '/public/tracking/events', { body: { code: a.referralCode, visitorId, type: 'ADD_TO_CART', productId, channel: 'facebook' } });
      expect(ev.body.data).toEqual({ recorded: true });
      expect((await prisma.trackingEvent.findFirstOrThrow({ where: { affiliateId: a.id } })).type).toBe(2); // ADD_TO_CART lưu mã số
      expect((await api('POST', '/public/tracking/events', { body: { code: 'khongco123', visitorId, type: 'PRODUCT_VIEW' } })).body.data).toEqual({ recorded: false });
      expect((await api('POST', '/public/tracking/events', { body: { code: a.referralCode, visitorId, type: 'HACK' } })).status).toBe(400);

      const stats = await api('GET', '/me/stats', { token: a.token });
      expect(stats.status).toBe(200);
      expect(stats.body.data.clicks).toMatchObject({ total: 3, uniqueVisitors: 2, byChannel: [{ channelCode: 'facebook', clicks: 3, visitors: 2 }] });
      expect(stats.body.data.events).toEqual([{ channelCode: 'facebook', type: 'ADD_TO_CART', count: 1 }]);
      expect((await api('GET', '/me/stats?from=khongphaingay', { token: a.token })).status).toBe(400);
      expect((await api('GET', `/me/stats?from=${day(1)}`, { token: a.token })).status).toBe(400);
    });
  });

  // ═════════════════════════ Ghi nhận CTV cho đơn hàng (API nội bộ) ═════════════════════════
  describe('API nội bộ: ghi nhận CTV cho đơn hàng', () => {
    const resolve = (body: object, key: string | null = INTERNAL_KEY) =>
      api('POST', '/internal/attribution/resolve', { body, headers: key ? { 'x-internal-key': key } : {} });
    const phoneOfCustomer = () => `09${digits(8)}`;

    it('tra CTV theo tài khoản đăng nhập (cho service khác); cần khóa nội bộ', async () => {
      const a = await makeAffiliate();
      const lookup = (userId: string, key: string | null = INTERNAL_KEY) =>
        api('GET', `/internal/affiliates/by-user/${userId}`, { headers: key ? { 'x-internal-key': key } : {} });
      const found = await lookup(a.userId);
      expect(found.status).toBe(200);
      expect(found.body.data).toEqual({ affiliateId: a.id, referralCode: a.referralCode, status: 'ACTIVE' });
      expect((await lookup(uuidv7())).status).toBe(404);
      expect((await lookup('abc')).status).toBe(400);
      expect((await lookup(a.userId, null)).status).toBe(401);
    });

    it('thiếu hoặc sai khóa nội bộ bị từ chối', async () => {
      expect((await resolve({ customerPhone: phoneOfCustomer() }, null)).status).toBe(401);
      expect((await resolve({ customerPhone: phoneOfCustomer() }, 'sai-khoa-sai-khoa-sai-khoa-1')).status).toBe(401);
    });

    it('mã nhập tay hợp lệ: gắn CTV, có hoa hồng, chốt tỷ lệ hiện tại', async () => {
      const a = await makeAffiliate({ rate: 1200 });
      const r = await resolve({ referralCode: a.referralCode.toUpperCase(), customerPhone: phoneOfCustomer() });
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({
        affiliateId: a.id, linkId: null, channelCode: null, referralCodeUsed: a.referralCode, attributionSource: 'CODE',
        isSelfPurchase: false, commissionEligible: true, commissionRateBps: 1200, reason: 'OK',
      });
    });

    it('chỉ có cookie: nguồn LINK, giữ kênh và link; mã nhập tay thắng cookie', async () => {
      const a = await makeAffiliate();
      const b = await makeAffiliate();
      const link = (await api('POST', '/me/links', { token: a.token, body: { channelCode: 'facebook', label: 'FB' } })).body.data;
      // Cookie đúng như API click trả về (gồm cả maxAgeDays), chuyển nguyên sang resolve.
      const cookie = { code: a.referralCode, channelCode: 'facebook', clickedAt: new Date(Date.now() - 86_400_000).toISOString(), maxAgeDays: 30 };

      const viaCookie = await resolve({ cookie, customerPhone: phoneOfCustomer() });
      expect(viaCookie.body.data).toMatchObject({ affiliateId: a.id, attributionSource: 'LINK', channelCode: 'facebook', linkId: link.id, commissionEligible: true });

      const typedWins = await resolve({ referralCode: b.referralCode, cookie, customerPhone: phoneOfCustomer() });
      expect(typedWins.body.data).toMatchObject({ affiliateId: b.id, attributionSource: 'CODE', referralCodeUsed: b.referralCode });
    });

    it('cookie quá 30 ngày bị bỏ qua: tính khách vãng lai', async () => {
      const a = await makeAffiliate();
      const r = await resolve({ cookie: { code: a.referralCode, clickedAt: new Date(Date.now() - 31 * 86_400_000).toISOString() }, customerPhone: phoneOfCustomer() });
      expect(r.body.data).toMatchObject({ affiliateId: null, referralCodeUsed: null, commissionEligible: false, reason: 'NO_AFFILIATE' });
    });

    it('CTV tự mua bằng SĐT của mình: giữ liên kết, không hoa hồng', async () => {
      const a = await makeAffiliate();
      const r = await resolve({ referralCode: a.referralCode, customerPhone: a.phone.replace('+84', '0') });
      expect(r.body.data).toMatchObject({ affiliateId: a.id, isSelfPurchase: true, commissionEligible: false, commissionRateBps: null, reason: 'SELF_PURCHASE' });
    });

    it('hợp đồng kiểm tra theo NGÀY ĐẶT HÀNG: đặt trước khi hết hạn vẫn được, sau khi hết hạn là vãng lai', async () => {
      const a = await makeAffiliate({ start: day(-120), end: day(-30) });
      const during = await resolve({ referralCode: a.referralCode, customerPhone: phoneOfCustomer(), orderedAt: new Date(Date.now() - 60 * 86_400_000).toISOString() });
      expect(during.body.data).toMatchObject({ affiliateId: a.id, commissionEligible: true, reason: 'OK' });

      const after = await resolve({ referralCode: a.referralCode, customerPhone: phoneOfCustomer() });
      expect(after.body.data).toMatchObject({ affiliateId: null, commissionEligible: false, reason: 'OUT_OF_CONTRACT', referralCodeUsed: a.referralCode });
    });

    it('CTV bị khóa, chưa duyệt, mã không tồn tại; dữ liệu sai', async () => {
      const suspended = await makeAffiliate({ status: 'SUSPENDED' });
      expect((await resolve({ referralCode: suspended.referralCode, customerPhone: phoneOfCustomer() })).body.data.reason).toBe('NOT_ACTIVE');
      expect((await resolve({ referralCode: 'khongco123', customerPhone: phoneOfCustomer() })).body.data.reason).toBe('NO_AFFILIATE');
      expect((await resolve({ referralCode: suspended.referralCode, customerPhone: '123' })).status).toBe(400);
      expect((await resolve({ customerPhone: phoneOfCustomer(), cookie: { code: 'abc', clickedAt: 'khong-phai-ngay' } })).status).toBe(400);
    });
  });

  // ═════════════════════════ Hoa hồng theo sự kiện đơn hàng (RabbitMQ thật) ═════════════════════════
  describe('hoa hồng theo sự kiện đơn hàng', () => {
    it('đơn đặt: tạo ESTIMATED = 10% giá sản phẩm (không tính ship), phát sự kiện, xử lý lặp không tạo trùng', async () => {
      const a = await makeAffiliate({ rate: 1000 });
      const placed = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 610_000 });
      await publish(placed);
      const c = await waitCommission(placed.payload.orderId, 'ESTIMATED');
      expect(c).toMatchObject({ orderCode: placed.payload.code, affiliateId: a.id, rateBps: 1000, baseAmount: 610_000n, amount: 61_000n });
      expect(await outboxCount('commission', c.id)).toBe(1);

      // Cùng một sự kiện gửi lặp, và một sự kiện khác cùng đơn: vẫn chỉ một hoa hồng, một sự kiện phát ra.
      await publisher.publish(placed);
      const sameOrder = placedEvent({ orderId: placed.payload.orderId, code: placed.payload.code, affiliateId: a.id, rate: 1000, subtotal: 610_000 });
      await publish(sameOrder);
      await waitProcessed(sameOrder.id);
      expect(await prisma.commission.count({ where: { orderId: placed.payload.orderId } })).toBe(1);
      expect(await outboxCount('commission', c.id)).toBe(1);
    });

    it('làm tròn xuống và chốt tỷ lệ tại thời điểm đặt (đổi tỷ lệ sau đó không ảnh hưởng)', async () => {
      const a = await makeAffiliate({ rate: 1000 });
      const placed = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 333 });
      await publish(placed);
      expect((await waitCommission(placed.payload.orderId)).amount).toBe(33n); // floor(33,3)

      await api('PATCH', `/affiliates/${a.id}`, { token: adminToken(), body: { commissionRateBps: 2000 } });
      expect((await commissionOf(placed.payload.orderId))?.rateBps).toBe(1000);
    });

    it('khách vãng lai, tự mua, hoặc CTV không tồn tại: không có hoa hồng', async () => {
      const a = await makeAffiliate();
      const guest = placedEvent({ affiliateId: null, rate: null, subtotal: 500_000 });
      const self = placedEvent({ affiliateId: a.id, rate: null, subtotal: 500_000, self: true });
      const ghost = placedEvent({ affiliateId: uuidv7(), rate: 1000, subtotal: 500_000 });
      await publish(guest, self, ghost);
      for (const e of [guest, self, ghost]) await waitProcessed(e.id);
      for (const e of [guest, self, ghost]) expect(await commissionOf(e.payload.orderId)).toBeNull();
    });

    it('đơn hoàn tất: khách xác nhận hoặc admin chuyển => CONFIRMED, ghi ai xác nhận; xử lý lặp không đổi', async () => {
      const a = await makeAffiliate();
      const byCustomer = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 200_000 });
      const byAdmin = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 300_000 });
      // Gửi liền nhau: consumer xử lý tuần tự nên COMPLETED không vượt mặt placed.
      const done1 = statusEvent(byCustomer, 'COMPLETED', 'CUSTOMER');
      const done2 = statusEvent(byAdmin, 'COMPLETED', 'ADMIN');
      await publish(byCustomer, done1, byAdmin, done2, statusEvent(byCustomer, 'DELIVERED'));

      const c1 = await waitCommission(byCustomer.payload.orderId, 'CONFIRMED');
      const c2 = await waitCommission(byAdmin.payload.orderId, 'CONFIRMED');
      expect(c1.confirmedBy).toBe(1); // CUSTOMER
      expect(c2.confirmedBy).toBe(2); // ADMIN
      expect(c1.confirmedAt).toBeTruthy();
      expect(await outboxCount('commission', c1.id)).toBe(2); // ESTIMATED, CONFIRMED

      await publisher.publish(done1); // gửi lặp
      await waitProcessed(done1.id);
      expect(await outboxCount('commission', c1.id)).toBe(2);
    });

    it('đơn hủy hoặc hoàn => CANCELLED; hoa hồng đã PAID thì không tự đổi', async () => {
      const a = await makeAffiliate();
      const cancelled = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 100_000 });
      const returned = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 100_000 });
      await publish(cancelled, statusEvent(cancelled, 'CANCELLED'), returned, statusEvent(returned, 'COMPLETED', 'CUSTOMER'), statusEvent(returned, 'RETURNED'));
      const c = await waitCommission(cancelled.payload.orderId, 'CANCELLED');
      expect(c).toMatchObject({ cancelReason: 'Đơn bị hủy' });
      expect(c.cancelledAt).toBeTruthy();
      expect(await waitCommission(returned.payload.orderId, 'CANCELLED')).toMatchObject({ cancelReason: 'Đơn bị hoàn' });

      // Đã chi trả rồi mới bị hoàn: giữ nguyên PAID, chờ admin xử lý tay.
      const paid = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 100_000 });
      await publish(paid, statusEvent(paid, 'COMPLETED', 'CUSTOMER'));
      await waitCommission(paid.payload.orderId, 'CONFIRMED');
      expect((await api('POST', '/payouts', { token: adminToken(), body: { affiliateId: a.id } })).status).toBe(201);
      const back = statusEvent(paid, 'RETURNED');
      await publish(back);
      await waitProcessed(back.id);
      expect((await commissionOf(paid.payload.orderId))?.status).toBe(CommissionStatusCodec.toCode('PAID'));
    });

    it('admin xác nhận thủ công hoa hồng ESTIMATED (sau khi CSKH xử lý); chỉ xác nhận được từ ESTIMATED', async () => {
      const a = await makeAffiliate();
      const placed = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 400_000 });
      await publish(placed);
      const c = await waitCommission(placed.payload.orderId, 'ESTIMATED');
      const admin = adminToken();

      const ok = await api('PATCH', `/commissions/${c.id}/confirm`, { token: admin });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ status: 'CONFIRMED', confirmedBy: 'ADMIN', amount: 40_000 });
      expect((await api('PATCH', `/commissions/${c.id}/confirm`, { token: admin })).status).toBe(422);
      expect(await outboxCount('commission', c.id)).toBe(2);

      const cancelled = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 100_000 });
      await publish(cancelled, statusEvent(cancelled, 'CANCELLED'));
      const cc = await waitCommission(cancelled.payload.orderId, 'CANCELLED');
      expect((await api('PATCH', `/commissions/${cc.id}/confirm`, { token: admin })).status).toBe(422);
      expect((await api('PATCH', `/commissions/${uuidv7()}/confirm`, { token: admin })).status).toBe(404);
    });
  });

  // ═════════════════════════ Chi trả và xem của CTV ═════════════════════════
  describe('chi trả hoa hồng', () => {
    it('gom hoa hồng đã xác nhận thành một đợt: PAID, tổng đúng, phát sự kiện; chi lần hai bị từ chối', async () => {
      const a = await makeAffiliate();
      const o1 = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 610_000 }); // 61.000
      const o2 = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 870_000 }); // 87.000
      const o3 = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 500_000 }); // chưa xác nhận
      await publish(o1, statusEvent(o1, 'COMPLETED', 'CUSTOMER'), o2, statusEvent(o2, 'COMPLETED', 'ADMIN'), o3);
      const c1 = await waitCommission(o1.payload.orderId, 'CONFIRMED');
      const c2 = await waitCommission(o2.payload.orderId, 'CONFIRMED');
      const c3 = await waitCommission(o3.payload.orderId, 'ESTIMATED');
      const admin = adminToken();

      expect((await api('POST', '/payouts', { token: admin, body: { affiliateId: uuidv7() } })).status).toBe(404); // CTV không tồn tại
      expect((await api('POST', '/payouts', { token: admin, body: { affiliateId: a.id, commissionIds: [c3.id] } })).status).toBe(422); // chưa xác nhận
      const other = await makeAffiliate();
      expect((await api('POST', '/payouts', { token: admin, body: { affiliateId: other.id, commissionIds: [c1.id] } })).status).toBe(422); // của CTV khác
      expect((await api('POST', '/payouts', { token: admin, body: { affiliateId: a.id, commissionIds: [] } })).status).toBe(400);

      const adminUserId = uuidv7();
      const r = await api('POST', '/payouts', { token: tokenFor(adminUserId, 'ADMIN'), body: { affiliateId: a.id, paymentReference: 'IT-VCB-001', note: 'Đợt thử' } });
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ affiliateId: a.id, totalAmount: 148_000, paymentReference: 'IT-VCB-001', createdBy: adminUserId });
      expect(r.body.data.commissions.map((c: any) => c.orderCode).sort()).toEqual([o1.payload.code, o2.payload.code].sort());

      const paid = await prisma.commission.findMany({ where: { payoutId: r.body.data.id } });
      expect(paid).toHaveLength(2);
      expect(paid.every((c) => c.status === CommissionStatusCodec.toCode('PAID') && c.paidAt)).toBe(true);
      expect((await commissionOf(o3.payload.orderId))?.status).toBe(CommissionStatusCodec.toCode('ESTIMATED')); // không bị đụng tới
      expect(await outboxCount('commission', c1.id)).toBe(3); // ESTIMATED, CONFIRMED, PAID
      expect(await outboxCount('commission', c2.id)).toBe(3);

      expect((await api('POST', '/payouts', { token: admin, body: { affiliateId: a.id } })).status).toBe(422); // không còn gì để chi
      expect((await api('POST', '/payouts', { token: admin, body: { affiliateId: a.id, commissionIds: [c1.id] } })).status).toBe(422); // đã chi

      // Đối soát: tổng đợt chi bằng tổng hoa hồng trong đợt.
      const sum = await prisma.$queryRawUnsafe<Array<{ diff: bigint }>>(
        `SELECT p.total_amount - coalesce(sum(c.amount), 0) AS diff FROM commission.payouts p LEFT JOIN commission.commissions c ON c.payout_id = p.id WHERE p.id = $1::uuid GROUP BY p.id`, r.body.data.id,
      );
      expect(Number(sum[0].diff)).toBe(0);
    });

    it('hai admin chi trả song song: chỉ một đợt được tạo', async () => {
      const a = await makeAffiliate();
      const o = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 100_000 });
      await publish(o, statusEvent(o, 'COMPLETED', 'CUSTOMER'));
      await waitCommission(o.payload.orderId, 'CONFIRMED');
      const results = await Promise.all([1, 2, 3].map(() => api('POST', '/payouts', { token: adminToken(), body: { affiliateId: a.id } })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await prisma.payout.count({ where: { affiliateId: a.id } })).toBe(1);
    });

    it('CTV chỉ thấy hoa hồng và đợt chi trả của chính mình; tổng hợp theo trạng thái', async () => {
      const a = await makeAffiliate();
      const b = await makeAffiliate();
      const oa = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 200_000 });
      const oa2 = placedEvent({ affiliateId: a.id, rate: 1000, subtotal: 300_000 });
      const ob = placedEvent({ affiliateId: b.id, rate: 1000, subtotal: 900_000 });
      await publish(oa, statusEvent(oa, 'COMPLETED', 'CUSTOMER'), oa2, ob);
      const ca = await waitCommission(oa.payload.orderId, 'CONFIRMED');
      await waitCommission(oa2.payload.orderId, 'ESTIMATED');
      const cb = await waitCommission(ob.payload.orderId, 'ESTIMATED');

      const mine = await api('GET', '/me/commissions?sort=orderCode', { token: a.token });
      expect(mine.status).toBe(200);
      expect(mine.body.data.map((c: any) => c.orderCode).sort()).toEqual([oa.payload.code, oa2.payload.code].sort());
      expect(JSON.stringify(mine.body)).not.toMatch(/"(customer\w*|phone|address\w*|ship\w*)":/i); // không có trường nào về khách
      expect((await api('GET', `/me/commissions?filter[status]=CONFIRMED`, { token: a.token })).body.data).toHaveLength(1);
      expect((await api('GET', `/me/commissions/${ca.id}`, { token: a.token })).body.data.id).toBe(ca.id);
      expect((await api('GET', `/me/commissions/${cb.id}`, { token: a.token })).status).toBe(404); // của CTV khác

      const summary = await api('GET', '/me/commissions/summary', { token: a.token });
      expect(summary.body.data).toEqual({
        byStatus: { ESTIMATED: { count: 1, amount: 30_000 }, CONFIRMED: { count: 1, amount: 20_000 }, PAID: { count: 0, amount: 0 }, CANCELLED: { count: 0, amount: 0 } },
        payable: 20_000,
      });

      const payout = (await api('POST', '/payouts', { token: adminToken(), body: { affiliateId: a.id } })).body.data;
      const myPayouts = await api('GET', '/me/payouts', { token: a.token });
      expect(myPayouts.body.data.map((p: any) => p.id)).toEqual([payout.id]);
      expect((await api('GET', `/me/payouts/${payout.id}`, { token: a.token })).body.data.commissions).toHaveLength(1);
      expect((await api('GET', `/me/payouts/${payout.id}`, { token: b.token })).status).toBe(404);
      expect((await api('GET', '/me/payouts', { token: b.token })).body.data).toEqual([]);
      expect((await api('GET', '/me/commissions/summary', { token: a.token })).body.data.byStatus.PAID).toEqual({ count: 1, amount: 20_000 });

      // Admin xem toàn bộ, lọc theo CTV và trạng thái.
      const all = await api('GET', `/commissions?filter[affiliateId]=${a.id}&filter[status]=PAID`, { token: adminToken() });
      expect(all.body.data.map((c: any) => c.id)).toEqual([ca.id]);
      expect((await api('GET', `/payouts?filter[affiliateId]=${a.id}`, { token: adminToken() })).body.meta.pagination.total).toBe(1);
    });
  });
});
