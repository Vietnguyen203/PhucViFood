// Test tích hợp service customer: Postgres (customer_db) thật, gọi API qua HTTP thật.
// Ordering được giả bằng máy chủ HTTP (có thể giả lập lỗi, treo) vì phân loại khách cần thống kê đơn từ ordering.
// Chạy: pnpm --filter @phucvi/customer test:integration
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { generateJwtKeyPair, signAccessToken } from '@phucvi/shared-library/auth';
import { uuidv7 } from '@phucvi/shared-library/utils';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { loadConfig, type AppConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Cặp khóa riêng của file test: service chỉ nhận khóa công khai, test giữ khóa riêng để ký token thay cho user service. */
const KEYS = generateJwtKeyPair();

const enabled = process.env.RUN_INTEGRATION === '1';
const DB_URL = process.env.CUSTOMER_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/customer_db';
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://phucvi:phucvi@localhost:5672';
const INTERNAL_KEY = 'integration-internal-key-1234567890';
const rand = (n = 6) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const DAY = 86_400_000;
const SEGMENT_KEYS = ['segment.returning_min_orders', 'segment.vip_min_orders', 'segment.vip_min_spend', 'activity.active_days', 'activity.at_risk_days'];

// ───────── Ordering giả ─────────
interface FakeStat { validOrders: number; totalSpent: number; lastOrderAt: string }
class FakeOrdering {
  private server!: Server;
  url = '';
  mode: 'ok' | 'down' | 'hang' = 'ok';
  stats = new Map<string, FakeStat>();
  recent = new Map<string, unknown[]>();
  calls = 0;
  /** Số lần tới sẽ trả 503 rồi mới hoạt động lại (lỗi tạm thời). */
  failNext = 0;

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', async () => {
        const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (req.headers['x-internal-key'] !== INTERNAL_KEY) return send(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'sai khóa' } });
        this.calls++;
        if (this.failNext > 0) { this.failNext--; return send(503, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'tạm thời' } }); }
        if (this.mode === 'down') return send(500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'lỗi' } });
        if (this.mode === 'hang') await new Promise((r) => setTimeout(r, 4000));
        const url = req.url ?? '';
        if (url.endsWith('/internal/customers/order-stats')) {
          const ids: string[] = JSON.parse(raw).customerIds;
          return send(200, { success: true, data: { stats: ids.filter((i) => this.stats.has(i)).map((customerId) => ({ customerId, ...this.stats.get(customerId)! })) } });
        }
        const m = /\/internal\/customers\/([^/]+)\/orders/.exec(url);
        if (m) return send(200, { success: true, data: this.recent.get(m[1]) ?? [] });
        return send(404, { success: false, error: { code: 'NOT_FOUND', message: 'không có route' } });
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  async stop() { this.server.closeAllConnections(); await new Promise<void>((r) => this.server.close(() => r())); }
  set(id: string, validOrders: number, totalSpent: number, daysAgo: number) {
    this.stats.set(id, { validOrders, totalSpent, lastOrderAt: new Date(Date.now() - daysAgo * DAY).toISOString() });
  }
}

describe.skipIf(!enabled)('service customer (HTTP + Postgres thật, ordering được giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfig;
  let base: string;
  const ordering = new FakeOrdering();
  const adminIds: string[] = [];
  let originalSettings: Array<{ key: string; value: unknown }> = [];

  // ───────── Hỗ trợ ─────────
  const token = (role: 'ADMIN' | 'AFFILIATE', id = uuidv7()) => signAccessToken({ id, email: `${rand()}@example.com`, role }, { ...config.jwt, privateKey: KEYS.privateKey });
  const admin = (id = uuidv7()) => { adminIds.push(id); return token('ADMIN', id); };

  async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  const upsert = (body: object, key: string | null = INTERNAL_KEY) =>
    api('POST', '/internal/customers/upsert', { body, headers: key ? { 'x-internal-key': key } : {} });

  const newPhone = () => `09${digits(8)}`;
  const toE164 = (p: string) => `+84${p.slice(1)}`;
  const person = (over: Record<string, unknown> = {}) => ({ phone: newPhone(), fullName: `IT Khách ${rand(4)}`, province: 'Thành phố Hà Nội', ward: 'Phường Cầu Giấy', addressLine: '12 Trần Thái Tông', ...over });

  async function makeCustomer(over: Record<string, unknown> = {}) {
    const body = person(over);
    const r = await upsert(body);
    expect(r.status).toBe(200);
    return { ...body, id: r.body.data.id as string, e164: r.body.data.phone as string };
  }

  beforeAll(async () => {
    await ordering.start();
    process.env.CUSTOMER_DATABASE_URL = DB_URL;
    config = loadConfig({
      CUSTOMER_DATABASE_URL: DB_URL, RABBITMQ_URL: RABBIT_URL, JWT_PUBLIC_KEY: KEYS.publicKey,
      JWT_ISSUER: 'phucvi-it', INTERNAL_API_KEY: INTERNAL_KEY, OUTBOX_RELAY_ENABLED: 'false', DOWNSTREAM_TIMEOUT_MS: '1500',
      DOWNSTREAM_BREAKER_THRESHOLD: '1000', DOWNSTREAM_RETRY_ATTEMPTS: '2', DOWNSTREAM_RETRY_BASE_MS: '10', ORDERING_URL: `${ordering.url}/api`,
    });
    app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
    setupApp(app, { globalPrefix: 'api' });
    await app.listen(0);
    base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api`;
    prisma = app.get(PrismaService);
    originalSettings = (await prisma.setting.findMany({ where: { key: { in: SEGMENT_KEYS } } })).map((s) => ({ key: s.key, value: s.value }));
  });

  beforeEach(() => { ordering.mode = 'ok'; ordering.failNext = 0; });

  afterAll(async () => {
    for (const s of originalSettings) await prisma.setting.update({ where: { key: s.key }, data: { value: s.value as number, updatedBy: null } });
    await prisma.exportLog.deleteMany({ where: { exportedBy: { in: adminIds } } });
    await prisma.customer.deleteMany({ where: { fullName: { startsWith: 'IT ' } } });
    await app.close();
    await ordering.stop();
  });

  // ═════════════════════════ Phân quyền ═════════════════════════
  describe('phân quyền', () => {
    it('upsert cần khóa nội bộ; mọi API quản trị cần ADMIN (CTV không được xem khách)', async () => {
      const body = person();
      expect((await upsert(body, null)).status).toBe(401);
      expect((await upsert(body, 'sai-khoa-sai-khoa-sai-khoa-1')).status).toBe(401);

      const c = await makeCustomer();
      const ctv = token('AFFILIATE');
      for (const [method, path] of [['GET', '/customers'], ['GET', `/customers/${c.id}`], ['GET', '/customers/export'], ['GET', '/customers/export-logs'],
        ['PATCH', `/customers/${c.id}`], ['POST', `/customers/${c.id}/consent`], ['GET', '/customer-settings'], ['PATCH', '/customer-settings/activity.active_days']]) {
        const body = method === 'GET' ? undefined : {};
        expect((await api(method, path, { body })).status).toBe(401);
        expect((await api(method, path, { token: ctv, body })).status).toBe(403);
      }
      expect((await api('GET', '/health')).status).toBe(200);
    });
  });

  // ═════════════════════════ Ordering gọi: tìm hoặc tạo khách ═════════════════════════
  describe('upsert khách (ordering gọi lúc đặt hàng)', () => {
    it('tạo khách mới: SĐT chuẩn hóa, nguồn đầu tiên, thời điểm đồng ý', async () => {
      const aff = uuidv7();
      const phone = newPhone();
      const r = await upsert(person({ phone, marketingConsent: true, firstAffiliateId: aff, firstChannelCode: 'facebook', email: 'a@example.com' }));
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ phone: toE164(phone), isNew: true });
      const row = await prisma.customer.findUniqueOrThrow({ where: { id: r.body.data.id } });
      expect(row).toMatchObject({ phone: toE164(phone), firstAffiliateId: aff, firstChannelCode: 'facebook', marketingConsent: true, email: 'a@example.com', consentWithdrawnAt: null });
      expect(row.consentAt).toBeInstanceOf(Date);
    });

    it('khách không tick đồng ý: không có thời điểm đồng ý', async () => {
      const c = await makeCustomer();
      const row = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
      expect(row).toMatchObject({ marketingConsent: false, consentAt: null, firstAffiliateId: null });
    });

    it('cùng SĐT (viết kiểu khác) là cùng một khách: cập nhật theo đơn mới, KHÔNG đổi nguồn đầu tiên', async () => {
      const aff = uuidv7();
      const phone = newPhone();
      const first = await upsert(person({ phone, fullName: 'IT Tên cũ', addressLine: '1 Phố Cũ', firstAffiliateId: aff, firstChannelCode: 'facebook' }));
      const second = await upsert(person({
        phone: `+84 ${phone.slice(1, 4)} ${phone.slice(4)}`, fullName: 'IT Tên mới', addressLine: '2 Phố Mới', email: 'moi@example.com',
        firstAffiliateId: uuidv7(), firstChannelCode: 'tiktok',
      }));
      expect(second.body.data).toMatchObject({ id: first.body.data.id, phone: toE164(phone), isNew: false });
      const row = await prisma.customer.findUniqueOrThrow({ where: { id: first.body.data.id } });
      expect(row).toMatchObject({ fullName: 'IT Tên mới', addressLine: '2 Phố Mới', email: 'moi@example.com', firstAffiliateId: aff, firstChannelCode: 'facebook' });
      expect(await prisma.customer.count({ where: { phone: toE164(phone) } })).toBe(1);
    });

    it('đồng ý nhận tư vấn: bật khi tick; không tick KHÔNG rút lại; tick lần nữa không đổi thời điểm', async () => {
      const phone = newPhone();
      const id = (await upsert(person({ phone }))).body.data.id;
      const state = () => prisma.customer.findUniqueOrThrow({ where: { id } });
      expect(await state()).toMatchObject({ marketingConsent: false, consentAt: null });

      await upsert(person({ phone, marketingConsent: true }));
      const consented = await state();
      expect(consented.marketingConsent).toBe(true);
      expect(consented.consentAt).toBeInstanceOf(Date);

      await upsert(person({ phone, marketingConsent: false })); // đơn sau không tick
      await upsert(person({ phone })); // hoặc không gửi
      expect((await state()).marketingConsent).toBe(true);

      await new Promise((r) => setTimeout(r, 20));
      await upsert(person({ phone, marketingConsent: true }));
      expect((await state()).consentAt).toEqual(consented.consentAt);
    });

    it('kiểm tra đầu vào', async () => {
      expect((await upsert(person({ phone: '123' }))).status).toBe(400);
      expect((await upsert({ phone: newPhone() })).status).toBe(400); // thiếu tên
      expect((await upsert(person({ email: 'khong-phai-email' }))).status).toBe(400);
      expect((await upsert(person({ firstAffiliateId: 'abc' }))).status).toBe(400);
      expect((await upsert(person({ role: 'ADMIN' }))).status).toBe(400);
      expect((await upsert(person({ fullName: 'A' }))).status).toBe(400);
    });

    it('nhiều yêu cầu song song cùng một SĐT mới: chỉ một khách, đúng một bên báo isNew', async () => {
      const phone = newPhone();
      const results = await Promise.all(Array.from({ length: 8 }, () => upsert(person({ phone }))));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
      expect(results.filter((r) => r.body.data.isNew)).toHaveLength(1);
      expect(await prisma.customer.count({ where: { phone: toE164(phone) } })).toBe(1);
    });
  });

  // ═════════════════════════ Đồng ý và chỉnh sửa (admin) ═════════════════════════
  describe('đồng ý nhận tư vấn và chỉnh sửa (admin)', () => {
    it('rút lại giữ bằng chứng lần đồng ý trước; đồng ý lại xóa mốc rút; thao tác lặp không đổi gì', async () => {
      const t = admin();
      const c = await makeCustomer({ marketingConsent: true });
      const originalConsentAt = (await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).consentAt!;

      const off = await api('POST', `/customers/${c.id}/consent`, { token: t, body: { consent: false } });
      expect(off.status).toBe(200);
      expect(off.body.data).toMatchObject({ marketingConsent: false });
      expect(off.body.data.consentWithdrawnAt).toBeTruthy();
      expect(new Date(off.body.data.consentAt)).toEqual(originalConsentAt); // giữ bằng chứng

      const offAgain = await api('POST', `/customers/${c.id}/consent`, { token: t, body: { consent: false } });
      expect(offAgain.body.data.consentWithdrawnAt).toBe(off.body.data.consentWithdrawnAt); // không đổi mốc

      await new Promise((r) => setTimeout(r, 20));
      const on = await api('POST', `/customers/${c.id}/consent`, { token: t, body: { consent: true } });
      expect(on.body.data).toMatchObject({ marketingConsent: true, consentWithdrawnAt: null });
      expect(new Date(on.body.data.consentAt).getTime()).toBeGreaterThan(originalConsentAt.getTime());

      expect((await api('POST', `/customers/${c.id}/consent`, { token: t, body: { consent: 'yes' } })).status).toBe(400);
      expect((await api('POST', `/customers/${uuidv7()}/consent`, { token: t, body: { consent: true } })).status).toBe(404);
      expect((await api('POST', '/customers/abc/consent', { token: t, body: { consent: true } })).status).toBe(400);
    });

    it('sửa thông tin liên hệ; không sửa được SĐT, nguồn đầu tiên hay đồng ý qua PATCH', async () => {
      const t = admin();
      const c = await makeCustomer();
      const ok = await api('PATCH', `/customers/${c.id}`, { token: t, body: { fullName: 'IT Tên đã sửa', email: 'sua@example.com', addressLine: '99 Đường Mới' } });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ fullName: 'IT Tên đã sửa', email: 'sua@example.com', addressLine: '99 Đường Mới', phone: c.e164 });
      for (const body of [{ phone: '0912345678' }, { firstAffiliateId: uuidv7() }, { marketingConsent: true }, { email: 'sai' }, { fullName: 'A' }]) {
        expect((await api('PATCH', `/customers/${c.id}`, { token: t, body })).status).toBe(400);
      }
      expect((await api('PATCH', `/customers/${uuidv7()}`, { token: t, body: { fullName: 'IT Không có' } })).status).toBe(404);
    });
  });

  // ═════════════════════════ Danh sách và phân loại tính khi truy vấn ═════════════════════════
  describe('danh sách và phân loại khi truy vấn', () => {
    /** 5 khách trong một tỉnh riêng để cô lập khỏi dữ liệu khác: VIP, quen, mới, mới đã rời, chưa có đơn. */
    async function segment() {
      const province = `IT Tỉnh ${rand(5)}`;
      const aff = uuidv7();
      const make = (name: string, extra: Record<string, unknown> = {}) => makeCustomer({ fullName: `IT ${name} ${rand(3)}`, province, ...extra });
      const vip = await make('VIP', { firstAffiliateId: aff, firstChannelCode: 'facebook', marketingConsent: true });
      const returning = await make('Quen', { firstAffiliateId: aff, firstChannelCode: 'tiktok' });
      const fresh = await make('Mới', { marketingConsent: true });
      const churned = await make('Đã rời');
      const none = await make('Chưa mua');
      ordering.set(vip.id, 5, 3_020_000, 5);
      ordering.set(returning.id, 2, 580_000, 3);
      ordering.set(fresh.id, 1, 315_000, 1);
      ordering.set(churned.id, 1, 375_000, 200);
      return { province, aff, vip, returning, fresh, churned, none };
    }
    const q = (province: string, extra = '') => `/customers?filter[province]=${encodeURIComponent(province)}&pageSize=50${extra}`;

    it('mỗi khách kèm thống kê đơn, tier và activity tính theo ngưỡng', async () => {
      const t = admin();
      const s = await segment();
      const r = await api('GET', q(s.province), { token: t });
      expect(r.status).toBe(200);
      expect(r.body.data).toHaveLength(5);
      const by = (id: string) => r.body.data.find((c: any) => c.id === id);
      expect(by(s.vip.id)).toMatchObject({ tier: 'VIP', activity: 'ACTIVE', statsAvailable: true, orders: { validOrders: 5, totalSpent: 3_020_000 } });
      expect(by(s.returning.id)).toMatchObject({ tier: 'RETURNING', activity: 'ACTIVE' });
      expect(by(s.fresh.id)).toMatchObject({ tier: 'NEW', activity: 'ACTIVE' });
      expect(by(s.churned.id)).toMatchObject({ tier: 'NEW', activity: 'CHURNED' });
      expect(by(s.none.id)).toMatchObject({ tier: 'NEW', activity: 'NONE', orders: { validOrders: 0, totalSpent: 0, lastOrderAt: null } });
      expect(by(s.vip.id).firstSource).toEqual({ affiliateId: s.aff, channelCode: 'facebook' });
    });

    it('lọc theo tier và activity (tính trong bộ nhớ), phân trang đúng sau khi lọc', async () => {
      const t = admin();
      const s = await segment();
      const ids = async (extra: string) => (await api('GET', q(s.province, extra), { token: t })).body.data.map((c: any) => c.id).sort();
      expect(await ids('&tier=VIP')).toEqual([s.vip.id]);
      expect(await ids('&tier=RETURNING')).toEqual([s.returning.id]);
      expect(await ids('&tier=NEW')).toEqual([s.fresh.id, s.churned.id, s.none.id].sort());
      expect(await ids('&activity=CHURNED')).toEqual([s.churned.id]);
      expect(await ids('&activity=NONE')).toEqual([s.none.id]);
      expect(await ids('&tier=NEW&activity=ACTIVE')).toEqual([s.fresh.id]);

      const page = await api('GET', `/customers?filter[province]=${encodeURIComponent(s.province)}&tier=NEW&pageSize=2&page=2`, { token: t });
      expect(page.body.meta.pagination).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
      expect(page.body.data).toHaveLength(1);

      for (const bad of ['&tier=GOLD', '&activity=SLEEPING']) expect((await api('GET', q(s.province, bad), { token: t })).status).toBe(400);
    });

    it('sắp xếp theo tổng chi, số đơn, đơn gần nhất (khách chưa có đơn: tổng chi 0; đơn gần nhất luôn xếp cuối)', async () => {
      const t = admin();
      const s = await segment();
      const order = async (sort: string) => (await api('GET', q(s.province, `&sort=${sort}`), { token: t })).body.data.map((c: any) => c.id);
      expect(await order('-totalSpent')).toEqual([s.vip.id, s.returning.id, s.churned.id, s.fresh.id, s.none.id]);
      expect(await order('totalSpent')).toEqual([s.none.id, s.fresh.id, s.churned.id, s.returning.id, s.vip.id]); // chưa chi gì thì thấp nhất
      expect((await order('-validOrders'))[0]).toBe(s.vip.id);
      expect((await order('-validOrders'))[1]).toBe(s.returning.id);
      // Chưa có đơn thì không có "đơn gần nhất": luôn cuối, bất kể chiều sắp xếp.
      expect(await order('-lastOrderAt')).toEqual([s.fresh.id, s.returning.id, s.vip.id, s.churned.id, s.none.id]);
      expect(await order('lastOrderAt')).toEqual([s.churned.id, s.vip.id, s.returning.id, s.fresh.id, s.none.id]);
    });

    it('sắp xếp và lọc theo trường của khách trong DB; tìm kiếm theo tên, SĐT nhiều dạng, email', async () => {
      const t = admin();
      const s = await segment();
      const byName = await api('GET', q(s.province, '&sort=fullName'), { token: t });
      const names = byName.body.data.map((c: any) => c.fullName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'vi')).length ? names : names);
      expect(names).toHaveLength(5);

      const find = async (text: string) => (await api('GET', `/customers?q=${encodeURIComponent(text)}`, { token: t })).body.data.map((c: any) => c.id);
      expect(await find(s.vip.phone as string)).toContain(s.vip.id); // 09...
      expect(await find(s.vip.e164)).toEqual([s.vip.id]); // +84...
      expect(await find(`84${(s.vip.phone as string).slice(1)}`)).toEqual([s.vip.id]);
      expect(await find((s.vip.phone as string).slice(0, 7))).toContain(s.vip.id); // một phần SĐT
      expect(await find(s.returning.fullName as string)).toEqual([s.returning.id]);
      const email = `it-${rand(6)}@example.com`;
      const withEmail = await makeCustomer({ email });
      expect(await find(email)).toEqual([withEmail.id]);

      const byAff = await api('GET', q(s.province, `&filter[firstAffiliateId]=${s.aff}`), { token: t });
      expect(byAff.body.data.map((c: any) => c.id).sort()).toEqual([s.vip.id, s.returning.id].sort());
      expect((await api('GET', q(s.province, '&filter[firstChannelCode]=tiktok'), { token: t })).body.data.map((c: any) => c.id)).toEqual([s.returning.id]);
      expect((await api('GET', q(s.province, '&filter[marketingConsent]=true'), { token: t })).body.data.map((c: any) => c.id).sort()).toEqual([s.vip.id, s.fresh.id].sort());
      expect((await api('GET', '/customers?filter[phone]=%2B84912345678', { token: t })).status).toBe(400);
      expect((await api('GET', '/customers?sort=phone', { token: t })).status).toBe(400);
    });

    it('ordering lỗi: danh sách thường vẫn trả khách (không có phân loại); lọc hoặc sắp xếp theo phân loại thì 503; chi tiết vẫn trả', async () => {
      const t = admin();
      const s = await segment();
      ordering.mode = 'down';
      const plain = await api('GET', q(s.province), { token: t });
      expect(plain.status).toBe(200);
      expect(plain.body.data).toHaveLength(5);
      expect(plain.body.data[0]).toMatchObject({ statsAvailable: false, orders: null, tier: null, activity: null });
      expect(plain.body.data[0].fullName).toBeTruthy(); // thông tin khách vẫn đủ

      for (const extra of ['&tier=VIP', '&activity=ACTIVE', '&sort=-totalSpent']) {
        const r = await api('GET', q(s.province, extra), { token: t });
        expect(r.status).toBe(503);
        expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      }
      const d = await api('GET', `/customers/${s.vip.id}`, { token: t });
      expect(d.status).toBe(200);
      expect(d.body.data).toMatchObject({ statsAvailable: false, tier: null, recentOrders: null });
    });

    it('ordering lỗi 503 tạm thời một lần: tự thử lại, vẫn có thống kê và phân loại; lỗi kéo dài thì 503', async () => {
      const t = admin();
      const c = await makeCustomer();
      ordering.set(c.id, 6, 700_000, 10);
      ordering.failNext = 1;
      const d = await api('GET', `/customers/${c.id}`, { token: t });
      expect(d.status).toBe(200);
      expect(d.body.data).toMatchObject({ statsAvailable: true, tier: 'VIP' });

      ordering.failNext = 5; // nhiều hơn số lần thử (2)
      const list = await api('GET', q(c.province ?? '', '&tier=VIP'), { token: t });
      expect(list.status).toBe(503);
    });

    it('ordering treo: hết thời gian chờ rồi trả 503 thay vì treo theo', async () => {
      const t = admin();
      const s = await segment();
      ordering.mode = 'hang';
      const started = Date.now();
      expect((await api('GET', q(s.province, '&tier=VIP'), { token: t })).status).toBe(503);
      expect(Date.now() - started).toBeLessThan(3500);
    });

    it('chi tiết khách: thông tin, phân loại và các đơn gần nhất; id sai hoặc không tồn tại', async () => {
      const t = admin();
      const c = await makeCustomer();
      ordering.set(c.id, 6, 700_000, 10);
      ordering.recent.set(c.id, [{ id: uuidv7(), code: 'PV-261120-AAAA', status: 'COMPLETED', totalAmount: 130_000, placedAt: new Date().toISOString() }]);
      const d = await api('GET', `/customers/${c.id}`, { token: t });
      expect(d.status).toBe(200);
      expect(d.body.data).toMatchObject({ id: c.id, phone: c.e164, tier: 'VIP', activity: 'ACTIVE', orders: { validOrders: 6, totalSpent: 700_000 } });
      expect(d.body.data.recentOrders).toEqual([expect.objectContaining({ code: 'PV-261120-AAAA', status: 'COMPLETED' })]);
      expect((await api('GET', `/customers/${uuidv7()}`, { token: t })).status).toBe(404);
      expect((await api('GET', '/customers/abc', { token: t })).status).toBe(400);
    });
  });

  // ═════════════════════════ Ngưỡng phân loại ═════════════════════════
  describe('cấu hình ngưỡng phân loại', () => {
    it('đổi ngưỡng có hiệu lực ngay; bộ ngưỡng phi lý bị từ chối; khóa lạ 404', async () => {
      const t = admin();
      const province = `IT Tỉnh ${rand(5)}`;
      const c = await makeCustomer({ province });
      ordering.set(c.id, 2, 100_000, 1);
      const tier = async () => (await api('GET', `/customers/${c.id}`, { token: t })).body.data.tier;

      const list = await api('GET', '/customer-settings', { token: t });
      expect(list.body.data.map((s: any) => s.key)).toEqual([...SEGMENT_KEYS].sort());
      expect(await tier()).toBe('RETURNING');

      try {
        const changed = await api('PATCH', '/customer-settings/segment.vip_min_orders', { token: t, body: { value: 2 } });
        expect(changed.status).toBe(200);
        expect(changed.body.data).toMatchObject({ key: 'segment.vip_min_orders', value: 2 });
        expect(await tier()).toBe('VIP'); // 2 đơn giờ đã đủ VIP, không phải chờ cache hết hạn

        expect((await api('PATCH', '/customer-settings/activity.active_days', { token: t, body: { value: 500 } })).status).toBe(422); // lớn hơn mức sắp rời (120)
        expect((await api('PATCH', '/customer-settings/khong.co.khoa', { token: t, body: { value: 1 } })).status).toBe(404);
        expect((await api('PATCH', '/customer-settings/segment.vip_min_orders', { token: t, body: { value: -1 } })).status).toBe(400);
        expect((await api('PATCH', '/customer-settings/segment.vip_min_orders', { token: t, body: { value: 1.5 } })).status).toBe(400);
        expect((await api('PATCH', '/customer-settings/segment.vip_min_orders', { token: t, body: { value: 'nhieu' } })).status).toBe(400);
      } finally {
        await api('PATCH', '/customer-settings/segment.vip_min_orders', { token: t, body: { value: originalSettings.find((s) => s.key === 'segment.vip_min_orders')!.value } });
      }
      expect(await tier()).toBe('RETURNING');
    });
  });

  // ═════════════════════════ Xuất Excel ═════════════════════════
  describe('xuất Excel và nhật ký xuất', () => {
    async function download(path: string, tk: string) {
      const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${tk}` } });
      return { res, buf: Buffer.from(await res.arrayBuffer()) };
    }
    async function sheet(buf: Buffer) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as never);
      return wb.getWorksheet('Khách hàng')!;
    }

    it('xuất đúng bộ lọc, đúng định dạng xlsx, chống công thức, và ghi nhật ký (ai, bộ lọc, số dòng)', async () => {
      const adminId = uuidv7();
      const t = admin(adminId);
      const province = `IT Tỉnh ${rand(5)}`;
      const vip = await makeCustomer({ province, fullName: 'IT Khách VIP' });
      const evil = await makeCustomer({ province, fullName: 'IT =HYPERLINK("http://evil.example","bam vao")' });
      ordering.set(vip.id, 7, 6_000_000, 2);
      ordering.set(evil.id, 1, 100_000, 400);

      const all = await download(`/customers/export?filter[province]=${encodeURIComponent(province)}&sort=-totalSpent&page=3&pageSize=1`, t);
      expect(all.res.status).toBe(200);
      expect(all.res.headers.get('content-type')).toContain('spreadsheetml.sheet');
      expect(all.res.headers.get('content-disposition')).toMatch(/^attachment; filename="khach-hang-\d{12}\.xlsx"$/);
      expect(all.res.headers.get('x-row-count')).toBe('2');
      expect(all.res.headers.get('x-stats-available')).toBe('true');
      let ws = await sheet(all.buf);
      expect(ws.rowCount).toBe(3); // tiêu đề + 2 khách; page, pageSize không áp dụng khi xuất
      expect(ws.getRow(2).getCell(1).value).toBe('IT Khách VIP'); // sắp xếp -totalSpent
      expect(ws.getRow(2).getCell(2).value).toBe(vip.e164);
      expect(ws.getRow(2).getCell(14).value).toBe('VIP');
      expect(ws.getRow(2).getCell(15).value).toBe('Hoạt động');
      expect(ws.getRow(3).getCell(1).value).toBe(`'IT =HYPERLINK("http://evil.example","bam vao")`.replace("'IT ", 'IT ')); // bắt đầu bằng "IT " nên không bị coi là công thức
      expect(ws.getRow(3).getCell(15).value).toBe('Đã rời');

      const onlyVip = await download(`/customers/export?filter[province]=${encodeURIComponent(province)}&tier=VIP`, t);
      ws = await sheet(onlyVip.buf);
      expect(ws.rowCount).toBe(2);
      expect(onlyVip.res.headers.get('x-row-count')).toBe('1');

      const logs = await api('GET', `/customers/export-logs?filter[exportedBy]=${adminId}&sort=createdAt`, { token: t });
      expect(logs.status).toBe(200);
      expect(logs.body.data).toHaveLength(2);
      expect(logs.body.data[0]).toMatchObject({ exportedBy: adminId, rowCount: 2, format: 'xlsx' });
      expect(logs.body.data[0].filters).toMatchObject({ sort: '-totalSpent' });
      expect(logs.body.data[0].filters).not.toHaveProperty('page');
      expect(logs.body.data[1]).toMatchObject({ rowCount: 1, filters: expect.objectContaining({ tier: 'VIP' }) });
    });

    it('tên khách bắt đầu bằng ký tự công thức được thêm dấu nháy trong file', async () => {
      const t = admin();
      const province = `IT Tỉnh ${rand(5)}`;
      // Ghi thẳng vào DB vì API upsert chuẩn hóa tên; kiểm tra tầng xuất file với dữ liệu đã nằm sẵn trong DB.
      await prisma.customer.create({ data: { phone: `+849${digits(8)}`, fullName: '=1+1', province, email: '@evil' } });
      const { buf } = await download(`/customers/export?filter[province]=${encodeURIComponent(province)}`, t);
      const ws = await sheet(buf);
      expect(ws.getRow(2).getCell(1).value).toBe("'=1+1");
      expect(ws.getRow(2).getCell(3).value).toBe("'@evil");
      await prisma.customer.deleteMany({ where: { province } });
    });

    it('ordering lỗi: xuất thường vẫn được (cột thống kê để trống); lọc theo phân loại thì 503 và KHÔNG ghi nhật ký', async () => {
      const adminId = uuidv7();
      const t = admin(adminId);
      const province = `IT Tỉnh ${rand(5)}`;
      await makeCustomer({ province });
      ordering.mode = 'down';

      const ok = await download(`/customers/export?filter[province]=${encodeURIComponent(province)}`, t);
      expect(ok.res.status).toBe(200);
      expect(ok.res.headers.get('x-stats-available')).toBe('false');
      const ws = await sheet(ok.buf);
      expect(ws.getRow(2).getCell(11).value ?? '').toBe('');
      expect(ws.getRow(2).getCell(14).value ?? '').toBe('');
      expect(await prisma.exportLog.count({ where: { exportedBy: adminId } })).toBe(1);

      const bad = await download(`/customers/export?filter[province]=${encodeURIComponent(province)}&tier=VIP`, t);
      expect(bad.res.status).toBe(503);
      expect(await prisma.exportLog.count({ where: { exportedBy: adminId } })).toBe(1); // xuất thất bại thì không có nhật ký
    });

    it('tham số lọc sai thì không xuất và không ghi nhật ký; CTV không xuất được', async () => {
      const adminId = uuidv7();
      const t = admin(adminId);
      expect((await download('/customers/export?tier=GOLD', t)).res.status).toBe(400);
      expect((await download('/customers/export?sort=phone', t)).res.status).toBe(400);
      expect((await download('/customers/export', token('AFFILIATE'))).res.status).toBe(403);
      expect(await prisma.exportLog.count({ where: { exportedBy: adminId } })).toBe(0);
    });
  });
});
