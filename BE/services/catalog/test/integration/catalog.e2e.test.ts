// Test tích hợp service catalog: Postgres (catalog_db) + RabbitMQ thật, gọi API qua HTTP thật.
// Chạy: pnpm --filter @phucvi/catalog test:integration
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as amqp from 'amqplib';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { generateJwtKeyPair, signAccessToken } from '@phucvi/shared-library/auth';
import { createEnvelope, EventTypes, StockMovementReasonCode, type EventEnvelope } from '@phucvi/shared-library/contracts';
import { RabbitMqClient } from '@phucvi/shared-library/messaging';
import { uuidv7 } from '@phucvi/shared-library/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { loadConfig, type AppConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrphanReservationsService } from '../../src/stock/orphan-reservations.service';

/** Cặp khóa riêng của file test: service chỉ nhận khóa công khai, test giữ khóa riêng để ký token thay cho user service. */
const KEYS = generateJwtKeyPair();

const enabled = process.env.RUN_INTEGRATION === '1';
const DB_URL = process.env.CATALOG_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/catalog_db';
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://phucvi:phucvi@localhost:5672';
const INTERNAL_KEY = 'integration-internal-key-1234567890';
const rand = (n = 6) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');


// ───────── Ordering giả: chỉ trả lời "mã đơn nào có thật" ─────────
class FakeOrdering {
  private server!: Server;
  url = '';
  mode: 'ok' | 'down' = 'ok';
  readonly orders = new Set<string>();
  calls = 0;

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (req.headers['x-internal-key'] !== INTERNAL_KEY) return send(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'sai khóa' } });
        this.calls++;
        if (this.mode === 'down') return send(500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'lỗi' } });
        if (req.url?.endsWith('/internal/orders/existence')) {
          const ids: string[] = JSON.parse(raw).orderIds;
          return send(200, { success: true, data: { existing: ids.filter((i) => this.orders.has(i)) } });
        }
        return send(404, { success: false, error: { code: 'NOT_FOUND', message: 'không có route' } });
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  async stop() { this.server.closeAllConnections(); await new Promise<void>((r) => this.server.close(() => r())); }
}

describe.skipIf(!enabled)('service catalog (HTTP + Postgres + RabbitMQ thật)', () => {
  const ordering = new FakeOrdering();
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfig;
  let base: string;
  let publisher: RabbitMqClient;
  let rawConn: Awaited<ReturnType<typeof amqp.connect>>;
  const publishedEventIds: string[] = [];

  // ───────── Hỗ trợ ─────────
  const token = (role: 'ADMIN' | 'AFFILIATE') => signAccessToken({ id: uuidv7(), email: `${rand()}@example.com`, role }, { ...config.jwt, privateKey: KEYS.privateKey });
  const admin = () => token('ADMIN');
  const internal = { 'x-internal-key': INTERNAL_KEY };

  async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  const reserve = (orderId: string, items: Array<{ productId: string; quantity: number }>) =>
    api('POST', '/internal/stock/reserve', { body: { orderId, items }, headers: internal });
  const release = (orderId: string) => api('POST', '/internal/stock/release', { body: { orderId }, headers: internal });

  async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, what: string, ms = 10_000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - start > ms) throw new Error(`Hết thời gian chờ: ${what}`);
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  async function dbCategory(over: { isActive?: boolean; sortOrder?: number } = {}) {
    const key = rand();
    return prisma.category.create({ data: { name: `IT ${key}`, slug: `it-${key}`, isActive: over.isActive ?? true, sortOrder: over.sortOrder ?? 0 } });
  }
  async function dbProduct(over: { categoryId?: string; price?: number; originalPrice?: number; stock?: number; visible?: boolean; deleted?: boolean } = {}) {
    const key = rand();
    const categoryId = over.categoryId ?? (await dbCategory()).id;
    return prisma.product.create({
      data: {
        categoryId, name: `IT sản phẩm ${key}`, slug: `it-${key}`, sku: `IT-${key}`, unit: 'hộp 500g',
        price: BigInt(over.price ?? 100_000), originalPrice: over.originalPrice ? BigInt(over.originalPrice) : null,
        stockQuantity: over.stock ?? 10, isVisible: over.visible ?? true, deletedAt: over.deleted ? new Date() : null,
      },
    });
  }
  const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQuantity;
  const movementsOf = (orderId: string) => prisma.stockMovement.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });

  const statusEvent = (orderId: string, to: 'CANCELLED' | 'COMPLETED' | 'RETURNED'): EventEnvelope<'ordering.order.status_changed'> =>
    createEnvelope({
      type: EventTypes.ORDER_STATUS_CHANGED, source: 'ordering', aggregateType: 'Order', aggregateId: orderId,
      payload: { orderId, code: `IT-${rand(6).toUpperCase()}`, fromStatus: null, toStatus: to, actorType: 'ADMIN', actorId: null, at: new Date().toISOString(), receivedBy: null },
    });
  const waitProcessed = (eventId: string) => waitFor(async () => {
    const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM catalog.inbox_events WHERE message_id = $1::uuid`, eventId);
    return Number(r[0].n) > 0;
  }, `sự kiện ${eventId} được xử lý`);

  beforeAll(async () => {
    await ordering.start();
    process.env.CATALOG_DATABASE_URL = DB_URL;
    config = loadConfig({
      CATALOG_DATABASE_URL: DB_URL, RABBITMQ_URL: RABBIT_URL, JWT_PUBLIC_KEY: KEYS.publicKey,
      JWT_ISSUER: 'phucvi-it', INTERNAL_API_KEY: INTERNAL_KEY, CATALOG_EVENT_QUEUE: `catalog.it.${rand(8)}`, OUTBOX_RELAY_ENABLED: 'false',
      ORDERING_URL: `${ordering.url}/api`, ORPHAN_SWEEP_ENABLED: 'false', // test gọi runOnce() trực tiếp
      DOWNSTREAM_TIMEOUT_MS: '1500', DOWNSTREAM_BREAKER_THRESHOLD: '1000', DOWNSTREAM_RETRY_ATTEMPTS: '2', DOWNSTREAM_RETRY_BASE_MS: '10',
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
    await prisma.$executeRawUnsafe(`DELETE FROM catalog.stock_movements WHERE product_id IN (SELECT id FROM catalog.products WHERE slug LIKE 'it-%')`);
    await prisma.$executeRawUnsafe(`DELETE FROM catalog.products WHERE slug LIKE 'it-%'`);
    await prisma.$executeRawUnsafe(`DELETE FROM catalog.categories WHERE slug LIKE 'it-%'`);
    await prisma.$executeRawUnsafe(`DELETE FROM catalog.inbox_events WHERE message_id = ANY($1::uuid[])`, publishedEventIds);
    const ch = await rawConn.createChannel();
    await ch.deleteQueue(config.eventQueue).catch(() => undefined);
    await ch.deleteQueue(`${config.eventQueue}.dlq`).catch(() => undefined);
    await rawConn.close();
    await ordering.stop();
    await publisher.close();
    await app.close();
  });

  // ═════════════════════════ Phân quyền ═════════════════════════
  describe('phân quyền', () => {
    it('xem hàng công khai; quản trị cần ADMIN; API nội bộ cần khóa', async () => {
      expect((await api('GET', '/public/categories')).status).toBe(200);
      expect((await api('GET', '/public/products')).status).toBe(200);
      expect((await api('GET', '/health')).status).toBe(200);

      expect((await api('GET', '/products')).status).toBe(401);
      expect((await api('GET', '/products', { token: token('AFFILIATE') })).status).toBe(403);
      expect((await api('POST', '/categories', { token: token('AFFILIATE'), body: { name: 'x' } })).status).toBe(403);
      expect((await api('POST', `/products/${uuidv7()}/stock-adjustments`, { token: token('AFFILIATE'), body: { delta: 1, note: 'abc' } })).status).toBe(403);

      const body = { orderId: uuidv7(), items: [{ productId: uuidv7(), quantity: 1 }] };
      expect((await api('POST', '/internal/stock/reserve', { body })).status).toBe(401);
      expect((await api('POST', '/internal/stock/reserve', { body, headers: { 'x-internal-key': 'sai-khoa-sai-khoa-sai-khoa-1' } })).status).toBe(401);
      expect((await api('POST', '/internal/stock/release', { body: { orderId: uuidv7() } })).status).toBe(401);
    });
  });

  // ═════════════════════════ Khách xem hàng ═════════════════════════
  describe('khách xem hàng (công khai)', () => {
    it('danh mục: chỉ danh mục đang bật, theo thứ tự sortOrder', async () => {
      const a = await dbCategory({ sortOrder: 9100 });
      const b = await dbCategory({ sortOrder: 9050 });
      const off = await dbCategory({ isActive: false, sortOrder: 9000 });
      const list = (await api('GET', '/public/categories')).body.data as Array<{ id: string }>;
      const ids = list.map((c) => c.id);
      expect(ids).toContain(a.id);
      expect(ids).not.toContain(off.id);
      expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id)); // 9050 trước 9100
    });

    it('sản phẩm: chỉ hiển thị, chưa xóa, thuộc danh mục bật; không lộ số tồn kho', async () => {
      const cat = await dbCategory();
      const visible = await dbProduct({ categoryId: cat.id, price: 180_000, originalPrice: 200_000, stock: 7 });
      const outOfStock = await dbProduct({ categoryId: cat.id, stock: 0 });
      await dbProduct({ categoryId: cat.id, visible: false });
      await dbProduct({ categoryId: cat.id, deleted: true });
      const offCat = await dbCategory({ isActive: false });
      const inOffCat = await dbProduct({ categoryId: offCat.id });

      const r = await api('GET', `/public/products?filter[categoryId]=${cat.id}&sort=-price`);
      expect(r.status).toBe(200);
      expect(r.body.data.map((p: any) => p.id).sort()).toEqual([visible.id, outOfStock.id].sort());
      const v = r.body.data.find((p: any) => p.id === visible.id);
      expect(v).toMatchObject({ price: 180_000, originalPrice: 200_000, discountPercent: 10, inStock: true, category: { id: cat.id } });
      expect(r.body.data.find((p: any) => p.id === outOfStock.id).inStock).toBe(false);
      expect(JSON.stringify(r.body)).not.toMatch(/stockQuantity|deletedAt|isVisible/);
      expect((await api('GET', `/public/products?filter[categoryId]=${offCat.id}`)).body.data).toEqual([]);
      expect((await api('GET', `/public/products/${inOffCat.slug}`)).status).toBe(404);
    });

    it('lọc theo khoảng giá, tìm kiếm, sắp xếp, phân trang; query sai bị từ chối', async () => {
      const cat = await dbCategory();
      const [p1, p2, p3] = [await dbProduct({ categoryId: cat.id, price: 50_000 }), await dbProduct({ categoryId: cat.id, price: 150_000 }), await dbProduct({ categoryId: cat.id, price: 250_000 })];
      const range = await api('GET', `/public/products?filter[categoryId]=${cat.id}&filter[price][gte]=100000&filter[price][lte]=200000`);
      expect(range.body.data.map((p: any) => p.id)).toEqual([p2.id]);

      const page = await api('GET', `/public/products?filter[categoryId]=${cat.id}&sort=price&page=2&pageSize=2`);
      expect(page.body.meta.pagination).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
      expect(page.body.data.map((p: any) => p.id)).toEqual([p3.id]);

      const found = await api('GET', `/public/products?q=${encodeURIComponent(p1.name)}`);
      expect(found.body.data.map((p: any) => p.id)).toEqual([p1.id]);

      expect((await api('GET', '/public/products?sort=stockQuantity')).status).toBe(400); // không cho sắp theo tồn kho
      expect((await api('GET', '/public/products?filter[isVisible]=false')).status).toBe(400); // không cho lọc ẩn hiện
      expect((await api('GET', '/public/products?filter[categoryId]=abc')).status).toBe(400);
    });

    it('chi tiết theo slug (không phân biệt hoa thường); ẩn hoặc đã xóa thì 404', async () => {
      const p = await dbProduct();
      const r = await api('GET', `/public/products/${p.slug.toUpperCase()}`);
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ id: p.id, unit: 'hộp 500g', inStock: true });
      expect((await api('GET', `/public/products/${(await dbProduct({ visible: false })).slug}`)).status).toBe(404);
      expect((await api('GET', `/public/products/${(await dbProduct({ deleted: true })).slug}`)).status).toBe(404);
      expect((await api('GET', '/public/products/khong-co-san-pham-nay')).status).toBe(404);
    });
  });

  // ═════════════════════════ Admin: danh mục ═════════════════════════
  describe('admin: danh mục', () => {
    it('tạo (slug tự sinh không dấu), trùng slug, sửa, tắt, xóa', async () => {
      const t = admin();
      const key = rand(5);
      const created = await api('POST', '/categories', { token: t, body: { name: `IT ${key} Hải sản khô`, sortOrder: 5 } });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ slug: `it-${key}-hai-san-kho`, sortOrder: 5, isActive: true });
      const id = created.body.data.id;

      expect((await api('POST', '/categories', { token: t, body: { name: 'Trùng', slug: `it-${key}-hai-san-kho` } })).status).toBe(409);
      expect((await api('POST', '/categories', { token: t, body: { name: 'Sai slug', slug: 'Sai Slug!' } })).status).toBe(400);
      expect((await api('POST', '/categories', { token: t, body: { name: '' } })).status).toBe(400);

      // Tên trùng gốc thì slug tự thêm số.
      const second = await api('POST', '/categories', { token: t, body: { name: `IT ${key} Hải sản khô` } });
      expect(second.body.data.slug).toBe(`it-${key}-hai-san-kho-2`);

      expect((await api('PATCH', `/categories/${id}`, { token: t, body: { isActive: false, name: `IT ${key} Đã tắt` } })).body.data).toMatchObject({ isActive: false, name: `IT ${key} Đã tắt` });
      expect((await api('PATCH', `/categories/${id}`, { token: t, body: { slug: second.body.data.slug } })).status).toBe(409);
      expect((await api('GET', `/categories?q=it-${key}&filter[isActive]=false`, { token: t })).body.data.map((c: any) => c.id)).toEqual([id]);

      expect((await api('DELETE', `/categories/${id}`, { token: t })).status).toBe(200); // danh mục trống xóa được
      expect((await api('GET', `/categories/${id}`, { token: t })).status).toBe(404);
    });

    it('không xóa được danh mục còn sản phẩm', async () => {
      const p = await dbProduct();
      const r = await api('DELETE', `/categories/${p.categoryId}`, { token: admin() });
      expect(r.status).toBe(409);
      expect(r.body.error.message).toContain('còn sản phẩm');
    });
  });

  // ═════════════════════════ Admin: sản phẩm ═════════════════════════
  describe('admin: sản phẩm', () => {
    it('tạo sản phẩm: slug tự sinh, giảm giá, tồn đầu kỳ ghi vào sổ cái', async () => {
      const t = admin();
      const cat = await dbCategory();
      const key = rand(5);
      const r = await api('POST', '/products', {
        token: t,
        body: { categoryId: cat.id, name: `IT ${key} Khô cá lóc`, sku: `IT-${key}`, unit: 'gói 500g', price: 220_000, originalPrice: 250_000, stockQuantity: 80, imageUrl: 'https://cdn.example.com/kcl.jpg' },
      });
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({
        slug: `it-${key}-kho-ca-loc`, price: 220_000, originalPrice: 250_000, discountPercent: 12, stockQuantity: 80, isVisible: true, category: { id: cat.id },
      });
      const moves = await prisma.stockMovement.findMany({ where: { productId: r.body.data.id } });
      expect(moves).toHaveLength(1);
      expect(moves[0]).toMatchObject({ delta: 80, reason: StockMovementReasonCode.ADMIN_ADJUSTMENT, note: 'Tồn đầu kỳ' });
    });

    it('kiểm tra dữ liệu: giá gốc thấp hơn giá bán, danh mục không có, SKU và slug trùng, trường lạ', async () => {
      const t = admin();
      const cat = await dbCategory();
      const base = { categoryId: cat.id, name: `IT ${rand(5)} sp`, price: 100_000 };
      expect((await api('POST', '/products', { token: t, body: { ...base, originalPrice: 90_000 } })).status).toBe(400);
      expect((await api('POST', '/products', { token: t, body: { ...base, categoryId: uuidv7() } })).status).toBe(400);
      expect((await api('POST', '/products', { token: t, body: { ...base, price: -5 } })).status).toBe(400);
      expect((await api('POST', '/products', { token: t, body: { ...base, deletedAt: '2020-01-01' } })).status).toBe(400);

      const first = await api('POST', '/products', { token: t, body: { ...base, sku: `IT-${rand(5)}` } });
      expect(first.status).toBe(201);
      const dupSku = await api('POST', '/products', { token: t, body: { ...base, name: `IT ${rand(5)} khac`, sku: first.body.data.sku } });
      expect(dupSku.status).toBe(409);
      expect(dupSku.body.error.message).toContain('SKU');
      const dupSlug = await api('POST', '/products', { token: t, body: { ...base, name: `IT ${rand(5)} khac`, slug: first.body.data.slug } });
      expect(dupSlug.status).toBe(409);
    });

    it('sửa sản phẩm: đổi giá, kiểm tra giá gốc theo giá mới; không sửa được tồn kho', async () => {
      const t = admin();
      const p = await dbProduct({ price: 100_000, originalPrice: 120_000, stock: 5 });
      const ok = await api('PATCH', `/products/${p.id}`, { token: t, body: { price: 110_000, isVisible: false } });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ price: 110_000, isVisible: false, discountPercent: 8 });
      expect((await api('PATCH', `/products/${p.id}`, { token: t, body: { price: 130_000 } })).status).toBe(400); // giá gốc 120.000 < 130.000
      expect((await api('PATCH', `/products/${p.id}`, { token: t, body: { originalPrice: 100_000 } })).status).toBe(400);
      expect((await api('PATCH', `/products/${p.id}`, { token: t, body: { stockQuantity: 999 } })).status).toBe(400);
      expect((await api('PATCH', `/products/${p.id}`, { token: t, body: { categoryId: uuidv7() } })).status).toBe(400);
      expect(await stockOf(p.id)).toBe(5);
      expect((await api('PATCH', `/products/${uuidv7()}`, { token: t, body: { price: 1 } })).status).toBe(404);
    });

    it('danh sách admin thấy cả sản phẩm ẩn, lọc theo tồn kho; xóa mềm làm sản phẩm biến mất khỏi mọi nơi', async () => {
      const t = admin();
      const cat = await dbCategory();
      const hidden = await dbProduct({ categoryId: cat.id, visible: false, stock: 0 });
      const shown = await dbProduct({ categoryId: cat.id, stock: 9 });

      const all = await api('GET', `/products?filter[categoryId]=${cat.id}&sort=stockQuantity`, { token: t });
      expect(all.body.data.map((p: any) => p.id)).toEqual([hidden.id, shown.id]);
      expect(all.body.data[1].stockQuantity).toBe(9); // admin thấy tồn kho chính xác
      expect((await api('GET', `/products?filter[categoryId]=${cat.id}&filter[stockQuantity]=0`, { token: t })).body.data.map((p: any) => p.id)).toEqual([hidden.id]);

      const del = await api('DELETE', `/products/${shown.id}`, { token: t });
      expect(del.body.data).toEqual({ id: shown.id, deleted: true });
      expect((await api('GET', `/products/${shown.id}`, { token: t })).status).toBe(404);
      expect((await api('GET', `/public/products/${shown.slug}`)).status).toBe(404);
      expect((await api('DELETE', `/products/${shown.id}`, { token: t })).status).toBe(404);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: shown.id } })).deletedAt).toBeInstanceOf(Date); // dữ liệu vẫn còn cho đơn cũ
    });
  });

  // ═════════════════════════ Admin: điều chỉnh tồn kho ═════════════════════════
  describe('admin: điều chỉnh tồn kho và sổ cái', () => {
    it('nhập thêm, giảm, không cho âm; mọi thay đổi có dòng trong sổ cái kèm người thực hiện', async () => {
      const adminUserId = uuidv7();
      const t = signAccessToken({ id: adminUserId, email: 'a@example.com', role: 'ADMIN' }, { ...config.jwt, privateKey: KEYS.privateKey });
      const p = await dbProduct({ stock: 10 });
      const other = await dbProduct({ stock: 10 });

      const up = await api('POST', `/products/${p.id}/stock-adjustments`, { token: t, body: { delta: 5, note: 'Nhập thêm lô mới' } });
      expect(up.status).toBe(201);
      expect(up.body.data).toMatchObject({ stockQuantity: 15, movement: { delta: 5, reason: 'ADMIN_ADJUSTMENT', note: 'Nhập thêm lô mới', createdBy: adminUserId } });
      expect((await api('POST', `/products/${p.id}/stock-adjustments`, { token: t, body: { delta: -3, note: 'Hàng hỏng' } })).body.data.stockQuantity).toBe(12);

      const tooMuch = await api('POST', `/products/${p.id}/stock-adjustments`, { token: t, body: { delta: -13, note: 'Giảm quá tay' } });
      expect(tooMuch.status).toBe(422);
      expect(await stockOf(p.id)).toBe(12);

      expect((await api('POST', `/products/${p.id}/stock-adjustments`, { token: t, body: { delta: 0, note: 'Không đổi' } })).status).toBe(400);
      expect((await api('POST', `/products/${p.id}/stock-adjustments`, { token: t, body: { delta: 5 } })).status).toBe(400); // thiếu lý do
      expect((await api('POST', `/products/${uuidv7()}/stock-adjustments`, { token: t, body: { delta: 1, note: 'abc' } })).status).toBe(404);
      expect((await api('POST', `/products/${(await dbProduct({ deleted: true })).id}/stock-adjustments`, { token: t, body: { delta: 1, note: 'abc' } })).status).toBe(404);

      const history = await api('GET', `/products/${p.id}/stock-movements?sort=createdAt`, { token: t });
      expect(history.body.data.map((m: any) => m.delta)).toEqual([5, -3]);
      expect(history.body.meta.pagination.total).toBe(2);
      expect((await api('GET', `/products/${other.id}/stock-movements`, { token: t })).body.data).toEqual([]); // không lẫn sản phẩm khác
      expect((await api('GET', `/products/${p.id}/stock-movements?filter[reason]=ORDER_PLACED`, { token: t })).body.data).toEqual([]);
      expect((await api('GET', `/products/${p.id}/stock-movements?filter[reason]=3`, { token: t })).status).toBe(400);
    });
  });

  // ═════════════════════════ Giữ hàng cho đơn ═════════════════════════
  describe('giữ hàng (internal/stock/reserve)', () => {
    it('trừ tồn, trả snapshot (tên, giá, tổng), ghi sổ cái; gộp dòng trùng sản phẩm', async () => {
      const p1 = await dbProduct({ price: 220_000, stock: 10 });
      const p2 = await dbProduct({ price: 85_000, stock: 5 });
      const orderId = uuidv7();
      const r = await reserve(orderId, [{ productId: p1.id, quantity: 2 }, { productId: p2.id, quantity: 1 }, { productId: p1.id, quantity: 1 }]);
      expect(r.status).toBe(200);
      expect(r.body.data.replayed).toBe(false);
      expect(r.body.data.subtotal).toBe(220_000 * 3 + 85_000);
      const item1 = r.body.data.items.find((i: any) => i.productId === p1.id);
      expect(item1).toMatchObject({ name: p1.name, sku: p1.sku, unit: 'hộp 500g', unitPrice: 220_000, quantity: 3, lineTotal: 660_000 });
      expect(await stockOf(p1.id)).toBe(7);
      expect(await stockOf(p2.id)).toBe(4);
      const moves = await movementsOf(orderId);
      expect(moves.map((m) => [m.productId, m.delta, m.reason]).sort()).toEqual(
        [[p1.id, -3, 1], [p2.id, -1, 1]].sort(),
      );
    });

    it('gọi lại cùng đơn: trả bản phát lại, không trừ thêm; nội dung khác thì 409', async () => {
      const p = await dbProduct({ stock: 10 });
      const orderId = uuidv7();
      expect((await reserve(orderId, [{ productId: p.id, quantity: 2 }])).body.data.replayed).toBe(false);
      const again = await reserve(orderId, [{ productId: p.id, quantity: 2 }]);
      expect(again.status).toBe(200);
      expect(again.body.data.replayed).toBe(true);
      expect(await stockOf(p.id)).toBe(8);
      expect((await reserve(orderId, [{ productId: p.id, quantity: 3 }])).status).toBe(409);
      expect(await stockOf(p.id)).toBe(8);
    });

    it('thiếu tồn kho: 409 kèm số còn lại, và KHÔNG sản phẩm nào bị trừ (tất cả hoặc không gì cả)', async () => {
      const enough = await dbProduct({ stock: 10 });
      const short = await dbProduct({ stock: 2 });
      const orderId = uuidv7();
      const r = await reserve(orderId, [{ productId: enough.id, quantity: 5 }, { productId: short.id, quantity: 3 }]);
      expect(r.status).toBe(409);
      expect(r.body.error.details).toEqual([{ productId: short.id, requested: 3, available: 2 }]);
      expect(await stockOf(enough.id)).toBe(10);
      expect(await stockOf(short.id)).toBe(2);
      expect(await movementsOf(orderId)).toHaveLength(0);
    });

    it('sản phẩm không còn bán (ẩn, đã xóa, danh mục tắt, không tồn tại): 422 kèm danh sách', async () => {
      const hidden = await dbProduct({ visible: false });
      const deleted = await dbProduct({ deleted: true });
      const offCat = await dbProduct({ categoryId: (await dbCategory({ isActive: false })).id });
      const ghost = uuidv7();
      const ok = await dbProduct({ stock: 5 });
      const r = await reserve(uuidv7(), [{ productId: ok.id, quantity: 1 }, ...[hidden.id, deleted.id, offCat.id, ghost].map((productId) => ({ productId, quantity: 1 }))]);
      expect(r.status).toBe(422);
      expect(r.body.error.details.map((d: any) => d.productId).sort()).toEqual([hidden.id, deleted.id, offCat.id, ghost].sort());
      expect(await stockOf(ok.id)).toBe(5);
    });

    it('dữ liệu sai: không có dòng, số lượng 0, productId sai, thiếu orderId', async () => {
      const p = await dbProduct();
      expect((await reserve(uuidv7(), [])).status).toBe(400);
      expect((await reserve(uuidv7(), [{ productId: p.id, quantity: 0 }])).status).toBe(400);
      expect((await reserve(uuidv7(), [{ productId: 'abc', quantity: 1 }])).status).toBe(400);
      expect((await api('POST', '/internal/stock/reserve', { body: { items: [{ productId: p.id, quantity: 1 }] }, headers: internal })).status).toBe(400);
    });

    it('nhiều đơn đặt song song: không bao giờ bán quá tồn kho', async () => {
      const p = await dbProduct({ stock: 3 });
      const results = await Promise.all(Array.from({ length: 12 }, () => reserve(uuidv7(), [{ productId: p.id, quantity: 1 }])));
      expect(results.filter((r) => r.status === 200)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      expect(await stockOf(p.id)).toBe(0); // không âm
      expect(await prisma.stockMovement.count({ where: { productId: p.id, reason: StockMovementReasonCode.ORDER_PLACED } })).toBe(3);
    });

    it('nhiều đơn song song cùng lấy nhiều sản phẩm theo thứ tự khác nhau: không deadlock, không âm', async () => {
      const a = await dbProduct({ stock: 4 });
      const b = await dbProduct({ stock: 4 });
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
        reserve(uuidv7(), i % 2 ? [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }] : [{ productId: b.id, quantity: 1 }, { productId: a.id, quantity: 1 }])));
      const ok = results.filter((r) => r.status === 200).length;
      expect(ok).toBe(4);
      expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true); // không có 500
      expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([0, 0]);
    });

    it('cùng một đơn gọi song song nhiều lần: chỉ trừ một lần', async () => {
      const p = await dbProduct({ stock: 10 });
      const orderId = uuidv7();
      const results = await Promise.all(Array.from({ length: 6 }, () => reserve(orderId, [{ productId: p.id, quantity: 2 }])));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.filter((r) => r.body.data.replayed === false)).toHaveLength(1);
      expect(await stockOf(p.id)).toBe(8);
      expect(await movementsOf(orderId)).toHaveLength(1);
    });
  });

  // ═════════════════════════ Trả hàng ═════════════════════════
  // ═════════════════════════ Dọn hàng giữ cho đơn không tồn tại ═════════════════════════
  describe('dọn hàng giữ cho đơn không bao giờ được tạo', () => {
    const sweeper = () => app.get(OrphanReservationsService);
    const ageMovements = (orderIds: string[], minutes: number) =>
      prisma.$executeRawUnsafe(`UPDATE catalog.stock_movements SET created_at = now() - make_interval(mins => $1::int) WHERE order_id = ANY($2::uuid[])`, minutes, orderIds);
    const reserved = async (qty = 3) => {
      const p = await dbProduct({ stock: 10 });
      const orderId = uuidv7();
      expect((await reserve(orderId, [{ productId: p.id, quantity: qty }])).status).toBe(200);
      return { p, orderId };
    };

    it('trả hàng cho đơn không có ở ordering; giữ nguyên đơn có thật và đơn còn quá mới', async () => {
      const orphan = await reserved();
      const legit = await reserved();
      const young = await reserved(); // vừa giữ hàng: ordering có thể đang tạo đơn, chưa được đụng tới
      ordering.orders.add(legit.orderId);
      await ageMovements([orphan.orderId, legit.orderId], 20);

      const r = await sweeper().runOnce();
      expect(r.skipped).toBe(false);
      expect(r.released).toContain(orphan.orderId);
      expect(r.released).not.toContain(legit.orderId);
      expect(r.released).not.toContain(young.orderId);

      expect(await stockOf(orphan.p.id)).toBe(10); // đã trả đủ
      expect(await stockOf(legit.p.id)).toBe(7); // vẫn đang giữ cho đơn thật
      expect(await stockOf(young.p.id)).toBe(7);
      const moves = await movementsOf(orphan.orderId);
      expect(moves.map((m) => m.reason)).toEqual([StockMovementReasonCode.ORDER_PLACED, StockMovementReasonCode.ORDER_CANCELLED]);
    });

    it('lượt sau không trả lại lần hai và không xét lại đơn đã trả', async () => {
      const orphan = await reserved();
      await ageMovements([orphan.orderId], 20);
      expect((await sweeper().runOnce()).released).toContain(orphan.orderId);
      expect((await sweeper().runOnce()).released).not.toContain(orphan.orderId);
      expect(await stockOf(orphan.p.id)).toBe(10);
      expect((await movementsOf(orphan.orderId)).filter((m) => m.reason === StockMovementReasonCode.ORDER_CANCELLED)).toHaveLength(1);
    });

    it('ordering không trả lời: bỏ lượt, KHÔNG trả hàng (không đoán); ordering sống lại thì trả', async () => {
      const orphan = await reserved();
      await ageMovements([orphan.orderId], 20);

      ordering.mode = 'down';
      const down = await sweeper().runOnce();
      expect(down.skipped).toBe(true);
      expect(down.released).toEqual([]);
      expect(await stockOf(orphan.p.id)).toBe(7);

      ordering.mode = 'ok';
      expect((await sweeper().runOnce()).released).toContain(orphan.orderId);
      expect(await stockOf(orphan.p.id)).toBe(10);
    });

    it('chỉ xét trong khoảng thời gian gần đây: lần giữ hàng cũ hơn 24 giờ không bị đụng', async () => {
      const old = await reserved();
      await ageMovements([old.orderId], 25 * 60);
      expect((await sweeper().runOnce()).released).not.toContain(old.orderId);
      expect(await stockOf(old.p.id)).toBe(7);
    });

    it('đơn đã được trả hàng bằng đường thường (hủy đơn) thì không xét nữa', async () => {
      const x = await reserved();
      await ageMovements([x.orderId], 20);
      expect((await release(x.orderId)).status).toBe(200);
      const before = ordering.calls;
      const r = await sweeper().runOnce();
      expect(r.released).not.toContain(x.orderId);
      expect(await stockOf(x.p.id)).toBe(10);
      expect(ordering.calls).toBeGreaterThanOrEqual(before); // có thể hỏi ordering về đơn khác, nhưng không về đơn này
    });
  });

  describe('trả hàng (internal/stock/release và sự kiện đơn hủy)', () => {
    it('trả hàng về kho, idempotent; đơn chưa giữ hàng thì không làm gì', async () => {
      const p = await dbProduct({ stock: 10 });
      const orderId = uuidv7();
      await reserve(orderId, [{ productId: p.id, quantity: 4 }]);
      expect(await stockOf(p.id)).toBe(6);

      expect((await release(orderId)).body.data).toEqual({ released: true, alreadyReleased: false });
      expect(await stockOf(p.id)).toBe(10);
      expect((await release(orderId)).body.data).toEqual({ released: true, alreadyReleased: true });
      expect(await stockOf(p.id)).toBe(10); // không cộng lần hai
      expect((await movementsOf(orderId)).map((m) => m.delta)).toEqual([-4, 4]);

      expect((await release(uuidv7())).body.data).toEqual({ released: false, reason: 'NO_RESERVATION' });
    });

    it('nhiều yêu cầu trả hàng song song: chỉ cộng một lần', async () => {
      const p = await dbProduct({ stock: 10 });
      const orderId = uuidv7();
      await reserve(orderId, [{ productId: p.id, quantity: 5 }]);
      const results = await Promise.all(Array.from({ length: 6 }, () => release(orderId)));
      expect(results.every((r) => r.status === 200 && r.body.data.released === true)).toBe(true);
      expect(await stockOf(p.id)).toBe(10);
      expect(await prisma.stockMovement.count({ where: { orderId, reason: StockMovementReasonCode.ORDER_CANCELLED } })).toBe(1);
    });

    it('sự kiện đơn bị HỦY từ RabbitMQ trả hàng; gửi lặp không cộng hai lần; hoàn tất hoặc bị trả thì không tự nhập kho', async () => {
      const p = await dbProduct({ stock: 10 });
      const cancelled = uuidv7();
      const completed = uuidv7();
      const returned = uuidv7();
      for (const id of [cancelled, completed, returned]) await reserve(id, [{ productId: p.id, quantity: 2 }]);
      expect(await stockOf(p.id)).toBe(4);

      const evCompleted = statusEvent(completed, 'COMPLETED');
      const evReturned = statusEvent(returned, 'RETURNED');
      const evCancelled = statusEvent(cancelled, 'CANCELLED');
      // Consumer xử lý tuần tự theo thứ tự gửi, nên khi tin HỦY (gửi cuối) xong thì hai tin trước đã xử lý xong.
      for (const e of [evCompleted, evReturned, evCancelled]) { publishedEventIds.push(e.id); await publisher.publish(e); }
      await waitProcessed(evCancelled.id);

      await waitFor(async () => (await stockOf(p.id)) === 6, 'tồn kho được trả về sau khi đơn hủy');
      await publisher.publish(evCancelled); // gửi lặp
      await new Promise((r) => setTimeout(r, 500));
      expect(await stockOf(p.id)).toBe(6); // chỉ trả đơn bị hủy (2), đơn hoàn tất và đơn bị trả giữ nguyên
      expect(await prisma.stockMovement.count({ where: { orderId: cancelled, reason: StockMovementReasonCode.ORDER_CANCELLED } })).toBe(1);
      expect(await prisma.stockMovement.count({ where: { orderId: { in: [completed, returned] }, reason: StockMovementReasonCode.ORDER_CANCELLED } })).toBe(0);
    });
  });
});
