// Máy chủ HTTP giả đóng vai catalog, affiliate, customer cho test của ordering.
// Cài đặt đúng hợp đồng API nội bộ (phong bì { success, data | error }, khóa x-internal-key) và cho phép giả lập
// lỗi, treo, hết hàng để kiểm tra các nhánh bồi hoàn của ordering.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

export interface FakeProduct { id: string; name: string; sku: string; unit: string; price: number; stock: number; available?: boolean }
export interface FakeAffiliate { id: string; code: string; rate: number; phone: string; expired?: boolean; linkId?: string | null }
export type Mode = 'ok' | 'down' | 'hang';

export class FakeDownstream {
  private server!: Server;
  url = '';

  readonly key: string;
  mode: Record<'catalog' | 'affiliate' | 'customer', Mode> = { catalog: 'ok', affiliate: 'ok', customer: 'ok' };

  readonly products = new Map<string, FakeProduct>();
  readonly reservations = new Map<string, { items: Array<{ productId: string; quantity: number }>; released: boolean }>();
  readonly affiliates = new Map<string, FakeAffiliate>(); // theo mã giới thiệu
  readonly userToAffiliate = new Map<string, string>();
  readonly customers = new Map<string, string>(); // SĐT -> id

  calls = { reserve: 0, release: 0, resolve: 0, upsert: 0, lookup: 0 };
  lastResolve: Record<string, any> | null = null;
  lastUpsert: Record<string, any> | null = null;

  constructor(key: string) { this.key = key; }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  addProduct(p: Partial<FakeProduct> & { price: number; stock: number }): FakeProduct {
    const id = randomUUID();
    const product: FakeProduct = { id, name: `IT Sản phẩm ${id.slice(0, 6)}`, sku: `SKU-${id.slice(0, 6)}`, unit: 'hộp 500g', available: true, ...p };
    this.products.set(product.id, product);
    return product;
  }

  addAffiliate(a: Partial<FakeAffiliate> & { code: string }): FakeAffiliate {
    const aff: FakeAffiliate = { id: randomUUID(), rate: 1000, phone: `+849${Math.floor(10000000 + Math.random() * 89999999)}`, linkId: null, ...a };
    this.affiliates.set(aff.code, aff);
    return aff;
  }

  stockOf(productId: string): number { return this.products.get(productId)!.stock; }

  reset(): void {
    this.mode = { catalog: 'ok', affiliate: 'ok', customer: 'ok' };
    this.calls = { reserve: 0, release: 0, resolve: 0, upsert: 0, lookup: 0 };
    this.lastResolve = null;
    this.lastUpsert = null;
  }

  // ───────── Xử lý yêu cầu ─────────
  private send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }
  private ok(res: ServerResponse, data: unknown) { this.send(res, 200, { success: true, data }); }
  private fail(res: ServerResponse, status: number, code: string, message: string, details?: unknown) {
    this.send(res, status, { success: false, error: { code, message, ...(details ? { details } : {}) } });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : {};
    const url = req.url ?? '';
    const service = url.startsWith('/catalog/') ? 'catalog' : url.startsWith('/affiliate/') ? 'affiliate' : 'customer';

    if (req.headers['x-internal-key'] !== this.key) return this.fail(res, 401, 'UNAUTHORIZED', 'Thiếu hoặc sai khóa nội bộ');
    if (this.mode[service] === 'down') return this.fail(res, 500, 'INTERNAL_ERROR', 'Lỗi hệ thống');
    if (this.mode[service] === 'hang') await new Promise((r) => setTimeout(r, 4000));

    if (url.endsWith('/internal/stock/reserve')) return this.reserve(res, body);
    if (url.endsWith('/internal/stock/release')) return this.release(res, body);
    if (url.endsWith('/internal/attribution/resolve')) return this.resolve(res, body);
    if (url.includes('/internal/affiliates/by-user/')) return this.lookup(res, url.split('/').pop()!);
    if (url.endsWith('/internal/customers/upsert')) return this.upsert(res, body);
    return this.fail(res, 404, 'NOT_FOUND', `Không có route ${url}`);
  }

  private snapshot(orderId: string, items: Array<{ productId: string; quantity: number }>, replayed: boolean) {
    const rows = items.map((i) => {
      const p = this.products.get(i.productId)!;
      return { productId: i.productId, name: p.name, sku: p.sku, unit: p.unit, unitPrice: p.price, quantity: i.quantity, lineTotal: p.price * i.quantity };
    });
    return { orderId, replayed, items: rows, subtotal: rows.reduce((s, r) => s + r.lineTotal, 0) };
  }

  private reserve(res: ServerResponse, body: { orderId: string; items: Array<{ productId: string; quantity: number }> }) {
    this.calls.reserve++;
    const existing = this.reservations.get(body.orderId);
    if (existing) return this.ok(res, this.snapshot(body.orderId, existing.items, true)); // idempotent theo đơn

    const unavailable = body.items.filter((i) => !this.products.get(i.productId)?.available);
    if (unavailable.length) {
      return this.fail(res, 422, 'BUSINESS_RULE_VIOLATION', 'Có sản phẩm không còn được bán', unavailable.map((i) => ({ productId: i.productId, reason: 'NOT_AVAILABLE' })));
    }
    const insufficient = body.items.filter((i) => this.products.get(i.productId)!.stock < i.quantity);
    if (insufficient.length) {
      return this.fail(res, 409, 'CONFLICT', 'Không đủ tồn kho', insufficient.map((i) => ({ productId: i.productId, requested: i.quantity, available: this.products.get(i.productId)!.stock })));
    }
    for (const i of body.items) this.products.get(i.productId)!.stock -= i.quantity;
    this.reservations.set(body.orderId, { items: body.items, released: false });
    return this.ok(res, this.snapshot(body.orderId, body.items, false));
  }

  private release(res: ServerResponse, body: { orderId: string }) {
    this.calls.release++;
    const r = this.reservations.get(body.orderId);
    if (!r) return this.ok(res, { released: false, reason: 'NO_RESERVATION' });
    if (r.released) return this.ok(res, { released: true, alreadyReleased: true });
    for (const i of r.items) this.products.get(i.productId)!.stock += i.quantity;
    r.released = true;
    return this.ok(res, { released: true, alreadyReleased: false });
  }

  private resolve(res: ServerResponse, body: { referralCode?: string; cookie?: { code: string; channelCode?: string | null }; customerPhone: string }) {
    this.calls.resolve++;
    this.lastResolve = body;
    const typed = body.referralCode?.toLowerCase();
    const code = typed ?? body.cookie?.code?.toLowerCase() ?? null;
    const source = typed ? 'CODE' : 'LINK';
    const channelCode = body.cookie?.channelCode ?? null;
    const aff = code ? this.affiliates.get(code) : undefined;
    const guest = (reason: string) => this.ok(res, {
      affiliateId: null, linkId: null, channelCode: null, referralCodeUsed: code, attributionSource: null,
      isSelfPurchase: false, commissionEligible: false, commissionRateBps: null, reason,
    });
    if (!aff) return guest('NO_AFFILIATE');
    if (aff.expired) return guest('OUT_OF_CONTRACT');
    const self = aff.phone === body.customerPhone;
    return this.ok(res, {
      affiliateId: aff.id, linkId: aff.linkId ?? null, channelCode, referralCodeUsed: code, attributionSource: source,
      isSelfPurchase: self, commissionEligible: !self, commissionRateBps: self ? null : aff.rate, reason: self ? 'SELF_PURCHASE' : 'OK',
    });
  }

  private lookup(res: ServerResponse, userId: string) {
    this.calls.lookup++;
    const id = this.userToAffiliate.get(userId);
    if (!id) return this.fail(res, 404, 'NOT_FOUND', 'Tài khoản này chưa có hồ sơ cộng tác viên');
    return this.ok(res, { affiliateId: id, referralCode: 'x', status: 'ACTIVE' });
  }

  private upsert(res: ServerResponse, body: { phone: string }) {
    this.calls.upsert++;
    this.lastUpsert = body;
    const isNew = !this.customers.has(body.phone);
    if (isNew) this.customers.set(body.phone, randomUUID());
    return this.ok(res, { id: this.customers.get(body.phone), phone: body.phone, isNew });
  }
}
