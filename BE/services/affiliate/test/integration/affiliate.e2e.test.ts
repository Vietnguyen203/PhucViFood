// Test tích hợp service affiliate: Postgres (affiliate_db) + RabbitMQ thật, gọi API qua HTTP thật.
// Chạy: pnpm --filter @phucvi/affiliate test:integration
import * as amqp from 'amqplib';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { signAccessToken } from '@phucvi/shared-library/auth';
import {
  AdjustmentStatusCodec, AffiliateStatusCodec, CommissionStatusCodec, EventTypes, createEnvelope, type AffiliateStatus, type EventEnvelope,
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
    await prisma.$executeRawUnsafe(`DELETE FROM commission.adjustments WHERE order_code LIKE 'IT-%' OR affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM commission.commissions WHERE order_code LIKE 'IT-%' OR affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM commission.payouts WHERE affiliate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM commission.outbox_events WHERE payload->'payload'->>'affiliateId' = ANY($1::text[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM affiliate.outbox_events WHERE aggregate_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM commission.inbox_events WHERE message_id = ANY($1::uuid[])`, publishedEventIds);
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

  // ═════════════════════════ Kiểm tra mã giới thiệu ═════════════════════════
  // Lượt bấm link, tương tác và thống kê đã tách sang service tracking (test ở BE/services/tracking).
  describe('kiểm tra mã giới thiệu', () => {
    const context = (body: object, key: string | null = INTERNAL_KEY) =>
      api('POST', '/internal/referrals/context', { body, headers: key ? { 'x-internal-key': key } : {} });

    it('GET /public/referrals/:code báo hợp lệ cho CTV còn hiệu lực; chữ hoa vẫn khớp', async () => {
      const a = await makeAffiliate();
      expect((await api('GET', `/public/referrals/${a.referralCode.toUpperCase()}`)).body.data).toEqual({ valid: true });
    });

    it('API bấm link không còn ở affiliate (đã chuyển sang tracking)', async () => {
      const a = await makeAffiliate();
      expect((await api('POST', '/public/referrals/click', { body: { code: a.referralCode, landingPath: '/r/x' } })).status).toBe(404);
    });

    it('nội bộ: mã hợp lệ trả CTV, link theo kênh và số ngày cookie; mã không phân biệt hoa thường', async () => {
      const a = await makeAffiliate();
      const link = (await api('POST', '/me/links', { token: a.token, body: { channelCode: 'tiktok', label: 'TikTok' } })).body.data;

      const withLink = await context({ code: a.referralCode.toUpperCase(), channel: 'TikTok' });
      expect(withLink.status).toBe(200);
      expect(withLink.body.data).toEqual({ valid: true, affiliateId: a.id, referralCode: a.referralCode, linkId: link.id, cookieDays: 30 });

      // Kênh chưa có link, hoặc không có kênh: vẫn hợp lệ, linkId null.
      expect((await context({ code: a.referralCode, channel: 'zalo' })).body.data).toMatchObject({ valid: true, linkId: null });
      expect((await context({ code: a.referralCode })).body.data).toMatchObject({ valid: true, linkId: null });

      // Link đã tắt thì không gắn.
      await api('PATCH', `/me/links/${link.id}`, { token: a.token, body: { isActive: false } });
      expect((await context({ code: a.referralCode, channel: 'tiktok' })).body.data).toMatchObject({ valid: true, linkId: null });
    });

    it('nội bộ: mã không tồn tại, CTV chưa duyệt, bị khóa, hợp đồng hết hạn hoặc chưa tới hạn đều là valid:false (vẫn 200)', async () => {
      const cases = [
        await makeAffiliate({ status: 'PENDING' }),
        await makeAffiliate({ status: 'SUSPENDED' }),
        await makeAffiliate({ start: day(-120), end: day(-30) }),
        await makeAffiliate({ start: day(10), end: day(100) }),
      ];
      for (const a of cases) {
        const r = await context({ code: a.referralCode });
        expect(r.status).toBe(200);
        expect(r.body.data).toEqual({ valid: false });
        expect((await api('GET', `/public/referrals/${a.referralCode}`)).body.data).toEqual({ valid: false });
      }
      expect((await context({ code: 'khongco123' })).body.data).toEqual({ valid: false });
    });

    it('nội bộ: cần khóa; dữ liệu sai bị từ chối', async () => {
      const a = await makeAffiliate();
      expect((await context({ code: a.referralCode }, null)).status).toBe(401);
      expect((await context({ code: a.referralCode }, 'sai-khoa-sai-khoa-sai-khoa-sai')).status).toBe(401);
      expect((await context({})).status).toBe(400);
      expect((await context({ code: a.referralCode, khac: 1 })).status).toBe(400);
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
      // ...và ghi một khoản trừ chờ (chi tiết ở nhóm "đơn hoàn sau khi hoa hồng đã chi trả" bên dưới); đơn hủy/hoàn trước khi chi thì không có.
      expect(await prisma.adjustment.count({ where: { orderId: paid.payload.orderId } })).toBe(1);
      expect(await prisma.adjustment.count({ where: { orderId: { in: [cancelled.payload.orderId, returned.payload.orderId] } } })).toBe(0);
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
  // ═════════════════════════ Đơn hoàn sau khi hoa hồng đã chi trả ═════════════════════════
  describe('đơn hoàn sau khi hoa hồng đã chi trả (khoản trừ vào đợt chi sau)', () => {
    const admin = () => adminToken();
    /** Đơn đã hoàn tất và đã được chi trả (một đợt chi riêng). Trả về sự kiện đặt đơn. */
    async function paidOrder(a: { id: string }, subtotal: number) {
      const o = placedEvent({ affiliateId: a.id, rate: 1000, subtotal });
      await publish(o, statusEvent(o, 'COMPLETED', 'CUSTOMER'));
      await waitCommission(o.payload.orderId, 'CONFIRMED');
      expect((await api('POST', '/payouts', { token: admin(), body: { affiliateId: a.id } })).status).toBe(201);
      return o;
    }
    /** Đơn đã hoàn tất, hoa hồng CONFIRMED, chưa chi. */
    async function confirmedOrder(a: { id: string }, subtotal: number) {
      const o = placedEvent({ affiliateId: a.id, rate: 1000, subtotal });
      await publish(o, statusEvent(o, 'COMPLETED', 'CUSTOMER'));
      await waitCommission(o.payload.orderId, 'CONFIRMED');
      return o;
    }
    async function returnOrder(o: EventEnvelope<'ordering.order.placed'>) {
      const ev = statusEvent(o, 'RETURNED');
      await publish(ev);
      await waitProcessed(ev.id);
    }
    const adjustmentOf = (o: EventEnvelope<'ordering.order.placed'>) => prisma.adjustment.findFirstOrThrow({ where: { orderId: o.payload.orderId } });
    const payoutNow = (a: { id: string }) => api('POST', '/payouts', { token: admin(), body: { affiliateId: a.id } });

    it('hoàn sau khi đã chi: hoa hồng giữ PAID, tạo đúng một khoản trừ chờ; sự kiện gửi lặp không tạo thêm', async () => {
      const a = await makeAffiliate();
      const o = await paidOrder(a, 100_000);
      await returnOrder(o);

      expect((await commissionOf(o.payload.orderId))?.status).toBe(CommissionStatusCodec.toCode('PAID'));
      const adj = await adjustmentOf(o);
      expect(adj).toMatchObject({ amount: 10_000n, orderCode: o.payload.code, affiliateId: a.id, status: AdjustmentStatusCodec.toCode('PENDING'), appliedPayoutId: null });
      expect(adj.reason).toContain('hoàn');

      await returnOrder(o); // sự kiện hoàn khác (id khác) cho cùng đơn
      expect(await prisma.adjustment.count({ where: { orderId: o.payload.orderId } })).toBe(1);
    });

    it('CTV thấy khoản trừ, tổng hợp và hoa hồng liên quan; admin lọc theo CTV và trạng thái', async () => {
      const a = await makeAffiliate();
      const o = await paidOrder(a, 100_000);
      await returnOrder(o);

      const mine = await api('GET', '/me/adjustments', { token: a.token });
      expect(mine.status).toBe(200);
      expect(mine.body.data).toHaveLength(1);
      expect(mine.body.data[0]).toMatchObject({ orderCode: o.payload.code, amount: 10_000, status: 'PENDING', appliedPayoutId: null });

      const summary = await api('GET', '/me/commissions/summary', { token: a.token });
      expect(summary.body.data.pendingAdjustments).toEqual({ count: 1, amount: 10_000 });
      expect(summary.body.data.byStatus.PAID.amount).toBe(10_000); // hoa hồng đã chi vẫn ghi đúng lịch sử

      const comm = await api('GET', '/me/commissions', { token: a.token });
      expect(comm.body.data[0].adjustment).toMatchObject({ status: 'PENDING', amount: 10_000 });

      const list = await api('GET', `/adjustments?filter[affiliateId]=${a.id}&filter[status]=PENDING`, { token: admin() });
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(mine.body.data[0].id);
      expect((await api('GET', `/adjustments?filter[affiliateId]=${a.id}&filter[status]=APPLIED`, { token: admin() })).body.data).toHaveLength(0);
    });

    it('đợt chi kế tiếp tự trừ khoản trừ: thực chuyển = hoa hồng - khoản trừ; khoản trừ thành APPLIED gắn đợt chi; đối soát khớp', async () => {
      const a = await makeAffiliate();
      const o1 = await paidOrder(a, 100_000);
      await returnOrder(o1);
      const o2 = await confirmedOrder(a, 300_000); // hoa hồng 30.000

      const p = await payoutNow(a);
      expect(p.status).toBe(201);
      expect(p.body.data).toMatchObject({ totalAmount: 20_000, adjustmentAmount: 10_000 });
      expect(p.body.data.commissions).toEqual([expect.objectContaining({ orderCode: o2.payload.code, amount: 30_000 })]);
      expect(p.body.data.adjustments).toEqual([expect.objectContaining({ orderCode: o1.payload.code, amount: 10_000 })]);

      const adj = await adjustmentOf(o1);
      expect(adj).toMatchObject({ status: AdjustmentStatusCodec.toCode('APPLIED'), appliedPayoutId: p.body.data.id });
      expect(adj.appliedAt).not.toBeNull();

      const recon = await prisma.$queryRawUnsafe<Array<{ diff: bigint }>>(
        `SELECT (coalesce((SELECT sum(amount) FROM commission.commissions WHERE payout_id = p.id), 0) - coalesce((SELECT sum(amount) FROM commission.adjustments WHERE applied_payout_id = p.id), 0)) - p.total_amount AS diff
           FROM commission.payouts p WHERE p.id = $1::uuid`, p.body.data.id,
      );
      expect(Number(recon[0].diff)).toBe(0);

      expect((await api('GET', '/me/commissions/summary', { token: a.token })).body.data.pendingAdjustments).toEqual({ count: 0, amount: 0 });
      // Đã trừ rồi thì không miễn trừ được nữa và không trừ lần hai.
      expect((await api('POST', `/adjustments/${adj.id}/waive`, { token: admin(), body: { reason: 'Muộn rồi' } })).status).toBe(422);
      const o3 = await confirmedOrder(a, 100_000);
      expect((await payoutNow(a)).body.data).toMatchObject({ totalAmount: 10_000, adjustmentAmount: 0 });
      expect(o3.payload.orderId).toBeTruthy();
    });

    it('khoản trừ lớn hơn hoa hồng của đợt thì giữ lại cho đợt sau (không chuyển tiền âm)', async () => {
      const a = await makeAffiliate();
      const o1 = await paidOrder(a, 500_000);
      await returnOrder(o1); // khoản trừ 50.000
      await confirmedOrder(a, 200_000); // hoa hồng 20.000 < 50.000

      const first = await payoutNow(a);
      expect(first.body.data).toMatchObject({ totalAmount: 20_000, adjustmentAmount: 0 });
      expect((await adjustmentOf(o1)).status).toBe(AdjustmentStatusCodec.toCode('PENDING'));
      expect((await api('GET', '/me/commissions/summary', { token: a.token })).body.data.pendingAdjustments).toEqual({ count: 1, amount: 50_000 });

      await confirmedOrder(a, 600_000); // hoa hồng 60.000 >= 50.000
      const second = await payoutNow(a);
      expect(second.body.data).toMatchObject({ totalAmount: 10_000, adjustmentAmount: 50_000 });
      expect((await adjustmentOf(o1)).status).toBe(AdjustmentStatusCodec.toCode('APPLIED'));
    });

    it('trừ theo thứ tự cũ nhất trước, trọn từng khoản khi còn đủ tiền', async () => {
      const a = await makeAffiliate();
      const oA = await paidOrder(a, 300_000);
      await returnOrder(oA); // khoản trừ A = 30.000 (cũ hơn)
      const oB = await paidOrder(a, 100_000);
      await returnOrder(oB); // khoản trừ B = 10.000
      await confirmedOrder(a, 350_000); // hoa hồng 35.000

      const p = await payoutNow(a);
      // A (30.000) trừ được; B (10.000) lớn hơn phần còn lại (5.000) nên để đợt sau.
      expect(p.body.data).toMatchObject({ totalAmount: 5_000, adjustmentAmount: 30_000 });
      expect((await adjustmentOf(oA)).status).toBe(AdjustmentStatusCodec.toCode('APPLIED'));
      expect((await adjustmentOf(oB)).status).toBe(AdjustmentStatusCodec.toCode('PENDING'));
    });

    it('khoản trừ bù đúng hết hoa hồng: đợt chi thực chuyển 0 đồng vẫn tất toán hoa hồng', async () => {
      const a = await makeAffiliate();
      const o1 = await paidOrder(a, 100_000);
      await returnOrder(o1); // khoản trừ 10.000
      const o2 = await confirmedOrder(a, 100_000); // hoa hồng 10.000

      const p = await payoutNow(a);
      expect(p.status).toBe(201);
      expect(p.body.data).toMatchObject({ totalAmount: 0, adjustmentAmount: 10_000 });
      expect((await commissionOf(o2.payload.orderId))?.status).toBe(CommissionStatusCodec.toCode('PAID'));
      expect((await adjustmentOf(o1)).status).toBe(AdjustmentStatusCodec.toCode('APPLIED'));
    });

    it('admin miễn trừ: cần lý do, chỉ miễn được khoản đang chờ, ghi người miễn; đợt chi sau không trừ nữa', async () => {
      const a = await makeAffiliate();
      const o1 = await paidOrder(a, 100_000);
      await returnOrder(o1);
      const adj = await adjustmentOf(o1);
      const adminId = uuidv7();
      const t = tokenFor(adminId, 'ADMIN', 'admin-waive@example.com');

      expect((await api('POST', `/adjustments/${adj.id}/waive`, { token: t, body: {} })).status).toBe(400); // thiếu lý do
      expect((await api('POST', `/adjustments/${adj.id}/waive`, { token: a.token, body: { reason: 'Tự miễn cho mình' } })).status).toBe(403);
      const ok = await api('POST', `/adjustments/${adj.id}/waive`, { token: t, body: { reason: 'Công ty chịu khoản này' } });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ status: 'WAIVED', waivedBy: adminId, waiveReason: 'Công ty chịu khoản này' });
      expect((await api('POST', `/adjustments/${adj.id}/waive`, { token: t, body: { reason: 'Miễn lần hai' } })).status).toBe(422);
      expect((await api('POST', `/adjustments/${uuidv7()}/waive`, { token: t, body: { reason: 'Không có' } })).status).toBe(404);

      await confirmedOrder(a, 100_000);
      expect((await payoutNow(a)).body.data).toMatchObject({ totalAmount: 10_000, adjustmentAmount: 0 });
      expect((await api('GET', '/me/commissions/summary', { token: a.token })).body.data.pendingAdjustments).toEqual({ count: 0, amount: 0 });
    });

    it('đơn hoàn TRƯỚC khi chi: hoa hồng bị hủy như cũ, không phát sinh khoản trừ', async () => {
      const a = await makeAffiliate();
      const o = await confirmedOrder(a, 100_000); // CONFIRMED, chưa chi
      await returnOrder(o);
      expect((await commissionOf(o.payload.orderId))?.status).toBe(CommissionStatusCodec.toCode('CANCELLED'));
      expect(await prisma.adjustment.count({ where: { orderId: o.payload.orderId } })).toBe(0);
    });

    it('phân quyền: admin xem và miễn trừ, CTV chỉ xem khoản của mình', async () => {
      const a = await makeAffiliate();
      const b = await makeAffiliate();
      const o = await paidOrder(a, 100_000);
      await returnOrder(o);
      const adj = await adjustmentOf(o);

      expect((await api('GET', '/adjustments')).status).toBe(401);
      expect((await api('GET', '/adjustments', { token: a.token })).status).toBe(403);
      expect((await api('GET', '/me/adjustments', { token: admin() })).status).toBe(403);
      expect((await api('GET', `/adjustments/${adj.id}`, { token: admin() })).body.data).toMatchObject({ orderCode: o.payload.code, status: 'PENDING' });
      expect((await api('GET', `/me/adjustments/${adj.id}`, { token: a.token })).status).toBe(200);
      expect((await api('GET', `/me/adjustments/${adj.id}`, { token: b.token })).status).toBe(404); // của CTV khác
      expect((await api('GET', '/me/adjustments', { token: b.token })).body.data).toHaveLength(0);
    });
  });

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
        payable: 20_000, pendingAdjustments: { count: 0, amount: 0 },
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
