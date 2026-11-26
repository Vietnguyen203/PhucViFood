// Test tích hợp service tracking: Postgres (tracking_db) thật, gọi API qua HTTP thật.
// Affiliate được giả bằng máy chủ HTTP (giả lập lỗi, treo) vì tracking hỏi affiliate để kiểm tra mã và tra CTV theo tài khoản.
// Chạy: pnpm --filter @phucvi/tracking test:integration
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { signAccessToken } from '@phucvi/shared-library/auth';
import { uuidv7 } from '@phucvi/shared-library/utils';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { loadConfig, type AppConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';

const enabled = process.env.RUN_INTEGRATION === '1';
const DB_URL = process.env.TRACKING_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/tracking_db';
const INTERNAL_KEY = 'integration-internal-key-1234567890';
const rand = (n = 6) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');
const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString();

// ───────── Affiliate giả ─────────
interface FakeAffiliate { id: string; code: string; userId: string; links: Map<string, string>; valid: boolean }
class FakeAffiliateService {
  private server!: Server;
  url = '';
  mode: 'ok' | 'down' | 'hang' = 'ok';
  failNext = 0;
  cookieDays = 30;
  calls = { context: 0, byUser: 0 };
  lastContext: Record<string, unknown> | null = null;
  readonly byCode = new Map<string, FakeAffiliate>();
  readonly byUserId = new Map<string, FakeAffiliate>();

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', async () => {
        const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (req.headers['x-internal-key'] !== INTERNAL_KEY) return send(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'sai khóa' } });
        const url = req.url ?? '';
        if (url.endsWith('/internal/referrals/context')) this.calls.context++;
        if (url.includes('/internal/affiliates/by-user/')) this.calls.byUser++;
        if (this.failNext > 0) { this.failNext--; return send(503, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'tạm thời' } }); }
        if (this.mode === 'down') return send(500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'lỗi' } });
        if (this.mode === 'hang') await new Promise((r) => setTimeout(r, 4000));

        if (url.endsWith('/internal/referrals/context')) {
          const body = JSON.parse(raw) as { code: string; channel?: string };
          this.lastContext = body;
          const a = this.byCode.get(body.code);
          if (!a || !a.valid) return send(200, { success: true, data: { valid: false } });
          return send(200, { success: true, data: { valid: true, affiliateId: a.id, referralCode: a.code, linkId: (body.channel && a.links.get(body.channel)) || null, cookieDays: this.cookieDays } });
        }
        const m = /\/internal\/affiliates\/by-user\/([^/]+)$/.exec(url);
        if (m) {
          const a = this.byUserId.get(m[1]);
          if (!a) return send(404, { success: false, error: { code: 'NOT_FOUND', message: 'chưa có hồ sơ' } });
          return send(200, { success: true, data: { affiliateId: a.id, referralCode: a.code, status: 'ACTIVE' } });
        }
        return send(404, { success: false, error: { code: 'NOT_FOUND', message: 'không có route' } });
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  async stop() { this.server.closeAllConnections(); await new Promise<void>((r) => this.server.close(() => r())); }

  add(over: Omit<Partial<FakeAffiliate>, 'links'> & { links?: Record<string, string> } = {}): FakeAffiliate {
    const { links, ...rest } = over;
    const a: FakeAffiliate = { id: uuidv7(), code: `it${rand(8)}`, userId: uuidv7(), valid: true, ...rest, links: new Map(Object.entries(links ?? {})) };
    this.byCode.set(a.code, a);
    this.byUserId.set(a.userId, a);
    return a;
  }
}

describe.skipIf(!enabled)('service tracking (HTTP + Postgres thật, affiliate được giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfig;
  let base: string;
  const affiliate = new FakeAffiliateService();
  const affiliateIds: string[] = [];

  const track = (over?: Omit<Partial<FakeAffiliate>, 'links'> & { links?: Record<string, string> }) => { const a = affiliate.add(over); affiliateIds.push(a.id); return a; };
  const token = (role: 'ADMIN' | 'AFFILIATE', id = uuidv7()) => signAccessToken({ id, email: `${rand()}@example.com`, role }, config.jwt);

  async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  const click = (body: object, headers: Record<string, string> = {}) => api('POST', '/public/referrals/click', { body, headers });
  const event = (body: object) => api('POST', '/public/tracking/events', { body });
  const clickRows = (affiliateId: string) => prisma.referralClick.findMany({ where: { affiliateId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    await affiliate.start();
    process.env.TRACKING_DATABASE_URL = DB_URL;
    config = loadConfig({
      TRACKING_DATABASE_URL: DB_URL, JWT_ACCESS_SECRET: 'integration-test-secret-integration-test-secret', JWT_ISSUER: 'phucvi-it',
      INTERNAL_API_KEY: INTERNAL_KEY, DOWNSTREAM_TIMEOUT_MS: '1500', AFFILIATE_URL: `${affiliate.url}/api`,
      // Nhiều test cố ý làm affiliate lỗi liên tiếp: nâng ngưỡng để mạch không ngắt chéo giữa các test. Retry giữ 2 lần, chờ ngắn.
      DOWNSTREAM_BREAKER_THRESHOLD: '1000', DOWNSTREAM_RETRY_ATTEMPTS: '2', DOWNSTREAM_RETRY_BASE_MS: '10',
    });
    app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
    setupApp(app, { globalPrefix: 'api' });
    await app.listen(0);
    base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api`;
    prisma = app.get(PrismaService);
  });

  beforeEach(() => { affiliate.mode = 'ok'; affiliate.failNext = 0; affiliate.cookieDays = 30; });

  afterAll(async () => {
    await prisma.referralClick.deleteMany({ where: { affiliateId: { in: affiliateIds } } });
    await prisma.trackingEvent.deleteMany({ where: { affiliateId: { in: affiliateIds } } });
    await app.close();
    await affiliate.stop();
  });

  // ═════════════════════════ Phân quyền ═════════════════════════
  describe('phân quyền', () => {
    it('click và sự kiện công khai (không cần đăng nhập); thống kê cần đăng nhập và vai trò AFFILIATE (admin cũng không xem được)', async () => {
      const a = track();
      expect((await click({ code: a.code, landingPath: '/r/x' })).status).toBe(200);
      expect((await event({ code: a.code, visitorId: uuidv7(), type: 'PRODUCT_VIEW' })).status).toBe(200);
      expect((await api('GET', '/me/stats')).status).toBe(401);
      expect((await api('GET', '/me/stats', { token: token('ADMIN') })).status).toBe(403);
    });
  });

  // ═════════════════════════ Lượt bấm link ═════════════════════════
  describe('bấm link giới thiệu', () => {
    it('ghi lượt bấm và trả cookie; mã không phân biệt hoa thường; gắn link theo kênh do affiliate báo', async () => {
      const linkId = uuidv7();
      const a = track({ links: { tiktok: linkId } });

      const r = await click({ code: a.code.toUpperCase(), channel: 'TikTok', landingPath: `/r/${a.code}?c=tiktok` }, { 'user-agent': 'IT-agent' });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ valid: true, cookie: { code: a.code, channelCode: 'tiktok', maxAgeDays: 30 } });
      expect(r.body.data.visitorId).toMatch(/^[0-9a-f-]{36}$/);
      expect(Date.now() - new Date(r.body.data.cookie.clickedAt).getTime()).toBeLessThan(10_000);
      expect(affiliate.lastContext).toEqual({ code: a.code, channel: 'tiktok' }); // chuẩn hóa trước khi hỏi affiliate

      const [row] = await clickRows(a.id);
      expect(row).toMatchObject({ affiliateId: a.id, linkId, channelCode: 'tiktok', visitorId: r.body.data.visitorId, landingPath: `/r/${a.code}?c=tiktok`, userAgent: 'IT-agent', ipHash: null });
    });

    it('số ngày cookie lấy từ cấu hình của affiliate', async () => {
      affiliate.cookieDays = 45;
      const a = track();
      expect((await click({ code: a.code, landingPath: '/r/x' })).body.data.cookie.maxAgeDays).toBe(45);
    });

    it('bấm lại với cùng visitorId giữ nguyên visitorId; kênh chưa có link thì linkId null', async () => {
      const a = track({ links: { facebook: uuidv7() } });
      const first = await click({ code: a.code, channel: 'facebook', landingPath: '/r/x' });
      const again = await click({ code: a.code, channel: 'zalo', visitorId: first.body.data.visitorId, landingPath: '/r/x' });
      expect(again.body.data.visitorId).toBe(first.body.data.visitorId);
      const rows = await clickRows(a.id);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.channelCode === 'zalo')!.linkId).toBeNull();
    });

    it('mã không hợp lệ, CTV chưa duyệt, bị khóa hoặc hết hợp đồng (affiliate báo valid:false): không ghi, không cấp cookie', async () => {
      const a = track({ valid: false });
      const r = await click({ code: a.code, landingPath: '/r/x' });
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({ valid: false });
      expect((await click({ code: 'khongco123', landingPath: '/r/x' })).body.data).toEqual({ valid: false });
      expect(await prisma.referralClick.count({ where: { affiliateId: a.id } })).toBe(0);
    });

    it('dữ liệu sai: thiếu landingPath, visitorId sai, trường lạ đều 400 và không gọi affiliate', async () => {
      const a = track();
      const before = affiliate.calls.context;
      expect((await click({ code: a.code })).status).toBe(400);
      expect((await click({ code: a.code, landingPath: '/r/x', visitorId: 'abc' })).status).toBe(400);
      expect((await click({ code: a.code, landingPath: '/r/x', affiliateId: uuidv7() })).status).toBe(400);
      expect(affiliate.calls.context).toBe(before);
    });

    it('nhớ tạm kết quả tra mã: bấm lặp không gọi lại affiliate; mã sai cũng được nhớ ngắn hạn', async () => {
      const a = track({ links: { facebook: uuidv7() } });
      const before = affiliate.calls.context;
      await click({ code: a.code, channel: 'facebook', landingPath: '/r/x' });
      await click({ code: a.code, channel: 'facebook', landingPath: '/r/x' });
      await click({ code: a.code.toUpperCase(), channel: 'Facebook', landingPath: '/r/x' });
      expect(affiliate.calls.context - before).toBe(1);
      expect(await prisma.referralClick.count({ where: { affiliateId: a.id } })).toBe(3); // vẫn ghi đủ ba lượt

      await click({ code: a.code, channel: 'tiktok', landingPath: '/r/x' }); // kênh khác: hỏi lại
      expect(affiliate.calls.context - before).toBe(2);

      const bad = `sai${rand(8)}`;
      await click({ code: bad, landingPath: '/r/x' });
      await click({ code: bad, landingPath: '/r/x' });
      expect(affiliate.calls.context - before).toBe(3);
    });
  });

  // ═════════════════════════ Khi affiliate lỗi ═════════════════════════
  describe('affiliate lỗi hoặc chậm', () => {
    it('click: affiliate lỗi thì 503, không ghi, không cấp cookie (chưa xác nhận được mã)', async () => {
      const a = track();
      affiliate.mode = 'down';
      const r = await click({ code: a.code, landingPath: '/r/x' });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(await prisma.referralClick.count({ where: { affiliateId: a.id } })).toBe(0);
    });

    it('click: lỗi 503 tạm thời một lần thì tự thử lại và thành công; lỗi kéo dài quá số lần thử thì 503', async () => {
      const a = track();
      affiliate.failNext = 1;
      expect((await click({ code: a.code, landingPath: '/r/x' })).status).toBe(200);
      expect(await prisma.referralClick.count({ where: { affiliateId: a.id } })).toBe(1);

      const b = track();
      affiliate.failNext = 5; // nhiều hơn số lần thử (2)
      expect((await click({ code: b.code, landingPath: '/r/x' })).status).toBe(503);
    });

    it('click: affiliate treo thì hết thời gian chờ rồi 503, không treo theo', async () => {
      const a = track();
      affiliate.mode = 'hang';
      const started = Date.now();
      expect((await click({ code: a.code, landingPath: '/r/x' })).status).toBe(503);
      expect(Date.now() - started).toBeLessThan(3500); // DOWNSTREAM_TIMEOUT_MS = 1500
    });

    it('sự kiện: affiliate lỗi thì bỏ qua êm (recorded:false, vẫn 200) để không làm hỏng việc mua hàng', async () => {
      const a = track();
      affiliate.mode = 'down';
      const r = await event({ code: a.code, visitorId: uuidv7(), type: 'ADD_TO_CART' });
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({ recorded: false });
      expect(await prisma.trackingEvent.count({ where: { affiliateId: a.id } })).toBe(0);
    });

    it('thống kê: affiliate lỗi thì 503', async () => {
      const a = track();
      affiliate.mode = 'down';
      const r = await api('GET', '/me/stats', { token: token('AFFILIATE', a.userId) });
      expect(r.status).toBe(503);
    });
  });

  // ═════════════════════════ Tương tác ═════════════════════════
  describe('ghi tương tác', () => {
    it('ghi từng loại; loại lưu dạng số trong DB; mã sai thì bỏ qua; loại lạ 400', async () => {
      const a = track();
      const visitorId = uuidv7();
      const productId = uuidv7();
      const ev = await event({ code: a.code.toUpperCase(), visitorId, type: 'ADD_TO_CART', productId, channel: 'Facebook' });
      expect(ev.body.data).toEqual({ recorded: true });
      const row = await prisma.trackingEvent.findFirstOrThrow({ where: { affiliateId: a.id } });
      expect(row).toMatchObject({ type: 2, visitorId, productId, channelCode: 'facebook' }); // ADD_TO_CART = 2

      for (const [i, type] of (['PRODUCT_VIEW', 'CHECKOUT_START'] as const).entries()) {
        expect((await event({ code: a.code, visitorId, type })).body.data).toEqual({ recorded: true });
        expect((await prisma.trackingEvent.findMany({ where: { affiliateId: a.id }, orderBy: { createdAt: 'asc' } }))[i + 1].type).toBe(type === 'PRODUCT_VIEW' ? 1 : 3);
      }
      expect((await event({ code: 'khongco123', visitorId, type: 'PRODUCT_VIEW' })).body.data).toEqual({ recorded: false });
      expect((await event({ code: a.code, visitorId, type: 'HACK' })).status).toBe(400);
    });

    it('CTV không còn hiệu lực (valid:false): không ghi tương tác', async () => {
      const a = track({ valid: false });
      expect((await event({ code: a.code, visitorId: uuidv7(), type: 'PRODUCT_VIEW' })).body.data).toEqual({ recorded: false });
      expect(await prisma.trackingEvent.count({ where: { affiliateId: a.id } })).toBe(0);
    });
  });

  // ═════════════════════════ Thống kê ═════════════════════════
  describe('thống kê của CTV', () => {
    it('đếm lượt bấm, người xem duy nhất và sự kiện theo kênh; chỉ tính của chính mình', async () => {
      const a = track();
      const other = track();
      const visitorId = uuidv7();
      for (const v of [visitorId, uuidv7(), visitorId]) await click({ code: a.code, channel: 'facebook', visitorId: v, landingPath: '/r/x' });
      await click({ code: a.code, channel: 'tiktok', landingPath: '/r/x' });
      await click({ code: other.code, channel: 'facebook', landingPath: '/r/x' }); // của CTV khác
      await event({ code: a.code, visitorId, type: 'ADD_TO_CART', productId: uuidv7(), channel: 'facebook' });
      await event({ code: other.code, visitorId, type: 'ADD_TO_CART', channel: 'facebook' });

      const stats = await api('GET', '/me/stats', { token: token('AFFILIATE', a.userId) });
      expect(stats.status).toBe(200);
      expect(stats.body.data.clicks).toMatchObject({ total: 4, uniqueVisitors: 3 });
      expect(stats.body.data.clicks.byChannel).toEqual([
        { channelCode: 'facebook', clicks: 3, visitors: 2 },
        { channelCode: 'tiktok', clicks: 1, visitors: 1 },
      ]);
      expect(stats.body.data.events).toEqual([{ channelCode: 'facebook', type: 'ADD_TO_CART', count: 1 }]);
    });

    it('lọc theo khoảng ngày; khoảng sai thì 400', async () => {
      const a = track();
      await click({ code: a.code, landingPath: '/r/x' });
      const t = token('AFFILIATE', a.userId);
      const future = await api('GET', `/me/stats?from=${encodeURIComponent(day(1))}&to=${encodeURIComponent(day(2))}`, { token: t });
      expect(future.body.data.clicks.total).toBe(0);
      expect((await api('GET', '/me/stats?from=khongphaingay', { token: t })).status).toBe(400);
      expect((await api('GET', `/me/stats?from=${encodeURIComponent(day(1))}`, { token: t })).status).toBe(400); // from sau to (mặc định là bây giờ)
    });

    it('tài khoản chưa có hồ sơ CTV: 404', async () => {
      const r = await api('GET', '/me/stats', { token: token('AFFILIATE') });
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('NOT_FOUND');
    });
  });

  it('GET /health công khai', async () => {
    const r = await api('GET', '/health');
    expect(r.body.data).toMatchObject({ status: 'ok', service: 'tracking' });
  });
});
