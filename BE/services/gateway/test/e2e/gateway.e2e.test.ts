import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { setupApp } from '@phucvi/shared-library/api';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AppConfig, loadConfig } from '../../src/config/app-config';
import { SERVICE_NAMES, type ServiceName } from '../../src/proxy/routes';
import { configureGateway } from '../../src/gateway';

/** Service giả: mặc định trả lại những gì nó nhận được để test kiểm tra header, đường dẫn, nội dung. */
interface Fake { name: ServiceName; server: http.Server; url: string; hits: number; handler: http.RequestListener }

const echo = (name: string): http.RequestListener => (req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = JSON.stringify({ success: true, data: { service: name, method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') } });
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': 'http://evil.example', 'x-powered-by': 'Express', vary: 'Origin, Accept-Encoding' });
    res.end(body);
  });
};

const fakes = {} as Record<ServiceName, Fake>;
let app: INestApplication;
let base: string;

async function startFake(name: ServiceName): Promise<Fake> {
  const fake: Fake = { name, hits: 0, handler: echo(name), url: '', server: undefined as never };
  fake.server = http.createServer((req, res) => { fake.hits += 1; fake.handler(req, res); });
  await new Promise<void>((r) => fake.server.listen(0, '127.0.0.1', r));
  fake.url = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}/api`;
  return fake;
}

async function startGateway(overrides: Record<string, string> = {}): Promise<{ app: INestApplication; base: string; config: AppConfig }> {
  const env: Record<string, string> = {
    ...Object.fromEntries(SERVICE_NAMES.map((n) => [`${n.toUpperCase()}_URL`, fakes[n].url])),
    CORS_ORIGINS: 'http://localhost:5173', MAX_BODY_BYTES: '2048', PROXY_TIMEOUT_MS: '600', HEALTH_TIMEOUT_MS: '500',
    RATE_LIMIT_ENABLED: 'false', ...overrides,
  };
  const config = loadConfig(env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
  const a = moduleRef.createNestApplication({ bodyParser: false, logger: false });
  setupApp(a, { globalPrefix: 'api' });
  configureGateway(a, config);
  await a.listen(0, '127.0.0.1');
  return { app: a, base: `http://127.0.0.1:${(a.getHttpServer().address() as AddressInfo).port}/api`, config };
}

const call = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: res.status, headers: res.headers, json, text };
};

beforeAll(async () => {
  for (const n of SERVICE_NAMES) fakes[n] = await startFake(n);
  ({ app, base } = await startGateway());
});

afterAll(async () => {
  await app?.close();
  for (const n of SERVICE_NAMES) await new Promise((r) => fakes[n]?.server.close(r));
});

beforeEach(() => {
  for (const n of SERVICE_NAMES) { fakes[n].hits = 0; fakes[n].handler = echo(n); }
});

describe('định tuyến', () => {
  it.each([
    ['POST', '/auth/login', 'user', '/api/auth/login'],
    ['GET', '/me/commissions/summary', 'affiliate', '/api/me/commissions/summary'],
    ['GET', '/me/adjustments', 'affiliate', '/api/me/adjustments'],
    ['POST', '/adjustments/abc/waive', 'affiliate', '/api/adjustments/abc/waive'],
    ['GET', '/me/stats', 'tracking', '/api/me/stats'],
    ['POST', '/public/tracking/events', 'tracking', '/api/public/tracking/events'],
    ['POST', '/public/referrals/click', 'tracking', '/api/public/referrals/click'],
    ['GET', '/public/referrals/linh01', 'affiliate', '/api/public/referrals/linh01'],
    ['GET', '/public/products/kho-ca-loc', 'catalog', '/api/public/products/kho-ca-loc'],
    ['GET', '/orders/cskh-queue', 'ordering', '/api/orders/cskh-queue'],
    ['GET', '/customers', 'customer', '/api/customers'],
  ])('%s %s đến service %s', async (method, path, service, upstreamPath) => {
    const r = await call(path, { method });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ service, method, url: upstreamPath });
    expect(fakes[service as ServiceName].hits).toBe(1);
    for (const n of SERVICE_NAMES) if (n !== service) expect(fakes[n].hits).toBe(0);
  });

  it('giữ nguyên query (kể cả tiếng Việt đã mã hóa) và gửi nội dung JSON nguyên vẹn', async () => {
    const payload = JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], note: 'Giao giờ hành chính' });
    const r = await call('/public/orders?x=1&q=Nguy%E1%BB%85n', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
    expect(r.json.data.url).toBe('/api/public/orders?x=1&q=Nguy%E1%BB%85n');
    expect(r.json.data.body).toBe(payload);
    expect(r.json.data.service).toBe('ordering');
  });

  it('/internal/* và đường dẫn ngoài bảng định tuyến trả 404 chuẩn và KHÔNG chạm service nào', async () => {
    for (const path of ['/internal/stock/reserve', '/internal/customers/upsert', '/internal/attribution/resolve', '/khong-co', '/orders-x']) {
      const r = await call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(r.status).toBe(404);
      expect(r.json).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    }
    expect(SERVICE_NAMES.reduce((s, n) => s + fakes[n].hits, 0)).toBe(0);
  });

  it('chặn cách viết đường dẫn lách bảng định tuyến', async () => {
    // Gửi đường dẫn thô bằng http.request, vì fetch tự chuẩn hóa `..` trước khi gửi.
    const raw = (path: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      const u = new URL(base);
      const req = http.request({ hostname: u.hostname, port: u.port, path: `/api${path}`, method: 'GET' }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
    for (const path of ['/orders/%2e%2e/internal/stock/reserve', '/orders/../internal/stock/reserve', '/orders//x', '/orders/%2fx']) {
      const r = await raw(path);
      expect(r.status, path).toBe(400);
      expect(JSON.parse(r.body).error.code).toBe('VALIDATION_FAILED');
    }
    expect(SERVICE_NAMES.reduce((s, n) => s + fakes[n].hits, 0)).toBe(0);
  });
});

describe('header', () => {
  it('chuyển Authorization nguyên vẹn; bỏ x-internal-key và X-Forwarded-For giả; đặt IP thật và mã yêu cầu', async () => {
    const r = await call('/customers', {
      headers: { authorization: 'Bearer abc.def.ghi', 'x-internal-key': 'ke-gian', 'x-forwarded-for': '6.6.6.6', 'x-request-id': 'gia mao!' },
    });
    const h = r.json.data.headers;
    expect(h.authorization).toBe('Bearer abc.def.ghi');
    expect(h['x-internal-key']).toBeUndefined();
    expect(h['x-forwarded-for']).toBe('127.0.0.1');
    expect(h['x-request-id']).toMatch(/^[\w.-]{8,64}$/);
    expect(r.headers.get('x-request-id')).toBe(h['x-request-id']);
  });

  it('nhận lại mã yêu cầu hợp lệ của client và chuyển xuống service', async () => {
    const r = await call('/customers', { headers: { 'x-request-id': 'trace-abcdef-123' } });
    expect(r.json.data.headers['x-request-id']).toBe('trace-abcdef-123');
    expect(r.headers.get('x-request-id')).toBe('trace-abcdef-123');
  });

  it('CORS do gateway quyết định: bỏ header CORS và x-powered-by của service, gộp Vary', async () => {
    const r = await call('/public/categories', { headers: { origin: 'http://localhost:5173' } });
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(r.headers.get('x-powered-by')).toBeNull();
    const vary = (r.headers.get('vary') ?? '').split(',').map((s) => s.trim());
    expect(vary).toEqual(expect.arrayContaining(['Origin', 'Accept-Encoding']));
  });

  it('preflight được gateway trả lời, không chạm service', async () => {
    const r = await fetch(`${base}/orders`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(SERVICE_NAMES.reduce((s, n) => s + fakes[n].hits, 0)).toBe(0);
  });

  it('origin lạ không được cho phép', async () => {
    const r = await call('/public/categories', { headers: { origin: 'http://evil.example' } });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('phản hồi', () => {
  it('chuyển nguyên mã lỗi và phong bì lỗi của service (gateway không viết lại)', async () => {
    fakes.catalog.handler = (_req, res) => {
      res.writeHead(422, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Hết hàng' }, requestId: 'x' }));
    };
    const r = await call('/public/products/abc');
    expect(r.status).toBe(422);
    expect(r.json.error).toEqual({ code: 'BUSINESS_RULE_VIOLATION', message: 'Hết hàng' });
  });

  it('chuyển file nhị phân (xlsx) nguyên byte kèm header tải về', async () => {
    const bytes = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7) % 256));
    fakes.customer.handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="khach-hang.xlsx"', 'x-row-count': '12' });
      res.end(bytes);
    };
    const res = await fetch(`${base}/customers/export`, { headers: { origin: 'http://localhost:5173' } });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    expect(res.headers.get('content-disposition')).toContain('khach-hang.xlsx');
    expect(res.headers.get('access-control-expose-headers')).toMatch(/Content-Disposition/i);
  });

  it('chuyển nguyên Set-Cookie nhiều giá trị', async () => {
    fakes.user.handler = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['a=1; HttpOnly', 'b=2; HttpOnly'] }); res.end('{"success":true,"data":{}}'); };
    const r = await call('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r.headers.getSetCookie()).toEqual(['a=1; HttpOnly', 'b=2; HttpOnly']);
  });
});

describe('giới hạn kích thước nội dung', () => {
  it('Content-Length vượt giới hạn: 413, không chạm service', async () => {
    const r = await call('/public/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'x'.repeat(5000) }) });
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('VALIDATION_FAILED');
    expect(fakes.ordering.hits).toBe(0);
  });

  it('gửi dạng chunked vượt giới hạn: cũng 413 (không qua mặt bằng cách bỏ Content-Length)', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const u = new URL(`${base}/public/orders`);
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
      req.on('error', reject);
      for (let i = 0; i < 6; i++) req.write(Buffer.alloc(1024, 97));
      req.end();
    });
    expect(status).toBe(413);
  });

  it('nội dung đúng giới hạn vẫn qua', async () => {
    const r = await call('/public/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'x'.repeat(1500) }) });
    expect(r.status).toBe(200);
  });
});

describe('khi service phía sau lỗi', () => {
  it('không kết nối được: 503 SERVICE_UNAVAILABLE chuẩn, không lộ tên service hay địa chỉ', async () => {
    const dead = await startGateway({ CATALOG_URL: 'http://127.0.0.1:1/api' });
    try {
      const res = await fetch(`${dead.base}/public/categories`);
      const json = await res.json() as { error: { code: string; message: string }; requestId?: string };
      expect(res.status).toBe(503);
      expect(json.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(json)).not.toMatch(/catalog|127\.0\.0\.1/);
      expect(json.requestId).toBeTruthy();
      expect(res.headers.get('retry-after')).toBe('5');
    } finally { await dead.app.close(); }
  });

  it('service treo quá thời gian chờ: 503, và service khác vẫn hoạt động', async () => {
    fakes.ordering.handler = () => { /* không bao giờ trả lời */ };
    const slow = await call('/orders');
    expect(slow.status).toBe(503);
    expect((await call('/customers')).status).toBe(200);
  });

  it('service ngắt kết nối giữa chừng khi đang trả dữ liệu: client bị ngắt, gateway vẫn sống', async () => {
    fakes.customer.handler = (_req, res) => { res.writeHead(200, { 'content-length': '1000' }); res.write('abc'); setTimeout(() => res.socket?.destroy(), 20); };
    await expect(call('/customers')).rejects.toBeTruthy();
    expect((await call('/public/categories')).status).toBe(200);
  });

  it('client bỏ giữa chừng thì gateway hủy yêu cầu phía sau', async () => {
    let aborted = false;
    fakes.customer.handler = (req) => { req.on('close', () => { aborted = true; }); };
    const ac = new AbortController();
    const p = fetch(`${base}/customers`, { signal: ac.signal }).catch(() => 'aborted');
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    expect(await p).toBe('aborted');
    await new Promise((r) => setTimeout(r, 100));
    expect(aborted).toBe(true);
  });
});

describe('health', () => {
  it('GET /health không phụ thuộc service nào', async () => {
    const r = await call('/health');
    expect(r.json).toMatchObject({ success: true, data: { status: 'ok', service: 'gateway' } });
  });

  it('GET /health/services: ok khi tất cả sống, degraded khi có service sập; không lộ địa chỉ', async () => {
    for (const n of SERVICE_NAMES) fakes[n].handler = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"success":true,"data":{"status":"ok"}}'); };
    const ok = await call('/health/services');
    expect(ok.json.data.status).toBe('ok');
    expect(Object.keys(ok.json.data.services).sort()).toEqual([...SERVICE_NAMES].sort());

    const dead = await startGateway({ CUSTOMER_URL: 'http://127.0.0.1:1/api' });
    try {
      const body = await (await fetch(`${dead.base}/health/services`)).json() as { data: { status: string; services: Record<string, { status: string }> } };
      expect(body.data.status).toBe('degraded');
      expect(body.data.services.customer.status).toBe('down');
      expect(body.data.services.user.status).toBe('up');
      expect(JSON.stringify(body)).not.toContain('127.0.0.1');
    } finally { await dead.app.close(); }
  });
});

describe('giới hạn tốc độ (gateway riêng, có bật)', () => {
  it('chặn 429 kèm Retry-After khi vượt hạn mức; đăng nhập chặt hơn; không chạm service khi bị chặn', async () => {
    const g = await startGateway({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_PER_MIN: '6', RATE_LIMIT_AUTH_PER_MIN: '2' });
    const post = () => fetch(`${g.base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    try {
      fakes.user.hits = 0;
      expect((await post()).status).toBe(200);
      expect((await post()).status).toBe(200);
      const blocked = await post();
      expect(blocked.status).toBe(429);
      expect((await blocked.json() as { error: { code: string } }).error.code).toBe('TOO_MANY_REQUESTS');
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(fakes.user.hits).toBe(2);
      // Đường dẫn khác vẫn dùng được vì chỉ đăng nhập bị chặn riêng.
      const other = await fetch(`${g.base}/public/categories`);
      expect(other.status).toBe(200);
      expect(other.headers.get('x-ratelimit-limit')).toBe('6');
    } finally { await g.app.close(); }
  });

  it('không tin X-Forwarded-For khi chưa cấu hình proxy tin cậy (đổi IP giả không né được)', async () => {
    const g = await startGateway({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_PER_MIN: '2' });
    try {
      const get = (xff: string) => fetch(`${g.base}/public/categories`, { headers: { 'x-forwarded-for': xff } });
      expect((await get('1.1.1.1')).status).toBe(200);
      expect((await get('2.2.2.2')).status).toBe(200);
      expect((await get('3.3.3.3')).status).toBe(429);
    } finally { await g.app.close(); }
  });

  it('có proxy tin cậy (TRUST_PROXY_HOPS=1): tính theo IP phía sau proxy, mỗi IP một hạn mức', async () => {
    const g = await startGateway({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_PER_MIN: '2', TRUST_PROXY_HOPS: '1' });
    try {
      // Proxy tin cậy thêm IP thật vào CUỐI danh sách; phần client tự thêm ở đầu bị bỏ qua.
      const get = (real: string) => fetch(`${g.base}/public/categories`, { headers: { 'x-forwarded-for': `6.6.6.6, ${real}` } });
      expect((await get('203.0.113.5')).status).toBe(200);
      expect((await get('203.0.113.5')).status).toBe(200);
      expect((await get('203.0.113.5')).status).toBe(429);
      expect((await get('203.0.113.6')).status).toBe(200);
    } finally { await g.app.close(); }
  });
});
