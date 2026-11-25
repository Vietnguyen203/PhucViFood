import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  callDownstream, CircuitBreaker, CIRCUIT_OPEN_CODE, createDownstreamTarget, DownstreamError, readResilienceEnv, retryDelay,
  type DownstreamTarget, type BreakerState,
} from '../src/http';

// ───────── CircuitBreaker ─────────
describe('CircuitBreaker', () => {
  const make = (threshold = 3, openMs = 1000) => {
    let t = 0;
    const changes: string[] = [];
    const breaker = new CircuitBreaker({ failureThreshold: threshold, openMs, now: () => t, onStateChange: (a: BreakerState, b: BreakerState) => changes.push(`${a}>${b}`) });
    return { breaker, advance: (ms: number) => { t += ms; }, changes };
  };
  const fail = (b: CircuitBreaker) => { expect(b.tryAcquire()).toBe(true); b.recordFailure(); };

  it('đủ số lần lỗi liên tiếp thì ngắt mạch và không cho gọi nữa', () => {
    const { breaker, changes } = make();
    fail(breaker); fail(breaker);
    expect(breaker.currentState).toBe('CLOSED');
    fail(breaker);
    expect(breaker.currentState).toBe('OPEN');
    expect(breaker.tryAcquire()).toBe(false);
    expect(changes).toEqual(['CLOSED>OPEN']);
  });

  it('một lần thành công xóa đếm lỗi (chỉ tính lỗi LIÊN TIẾP)', () => {
    const { breaker } = make();
    fail(breaker); fail(breaker);
    breaker.tryAcquire(); breaker.recordSuccess();
    fail(breaker); fail(breaker);
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('hết thời gian ngắt thì chỉ MỘT lời gọi thử được đi qua, các lời gọi khác vẫn bị chặn', () => {
    const { breaker, advance } = make();
    fail(breaker); fail(breaker); fail(breaker);
    advance(999);
    expect(breaker.tryAcquire()).toBe(false);
    advance(1);
    expect(breaker.tryAcquire()).toBe(true); // lời gọi thử
    expect(breaker.currentState).toBe('HALF_OPEN');
    expect(breaker.tryAcquire()).toBe(false); // đang có lời gọi thử
  });

  it('lời gọi thử thành công thì đóng mạch', () => {
    const { breaker, advance, changes } = make();
    fail(breaker); fail(breaker); fail(breaker);
    advance(1000);
    breaker.tryAcquire(); breaker.recordSuccess();
    expect(breaker.currentState).toBe('CLOSED');
    expect(breaker.tryAcquire()).toBe(true);
    expect(changes).toEqual(['CLOSED>OPEN', 'OPEN>HALF_OPEN', 'HALF_OPEN>CLOSED']);
  });

  it('lời gọi thử lỗi thì ngắt lại và tính lại thời gian ngắt từ đầu', () => {
    const { breaker, advance } = make();
    fail(breaker); fail(breaker); fail(breaker);
    advance(1000);
    breaker.tryAcquire(); breaker.recordFailure();
    expect(breaker.currentState).toBe('OPEN');
    advance(999);
    expect(breaker.tryAcquire()).toBe(false);
    advance(1);
    expect(breaker.tryAcquire()).toBe(true);
  });
});

describe('retryDelay', () => {
  const policy = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 500 };
  it('tăng gấp đôi mỗi lần, chặn trên bởi maxDelayMs', () => {
    const at = (attempt: number) => retryDelay({ ...policy, random: () => 1 }, attempt);
    expect([at(1), at(2), at(3), at(4), at(5)]).toEqual([100, 200, 400, 500, 500]);
  });
  it('ngẫu nhiên hóa trong khoảng [0, trần]', () => {
    expect(retryDelay({ ...policy, random: () => 0 }, 3)).toBe(0);
    expect(retryDelay({ ...policy, random: () => 0.5 }, 3)).toBe(200);
  });
});

describe('readResilienceEnv', () => {
  it('mặc định và đọc từ môi trường', () => {
    const problems: string[] = [];
    expect(readResilienceEnv({}, problems)).toEqual({ retryAttempts: 3, retryBaseDelayMs: 100, breakerThreshold: 5, breakerOpenMs: 10_000 });
    expect(readResilienceEnv({ DOWNSTREAM_RETRY_ATTEMPTS: '1', DOWNSTREAM_BREAKER_OPEN_MS: '2000' }, problems)).toMatchObject({ retryAttempts: 1, breakerOpenMs: 2000 });
    expect(problems).toEqual([]);
  });
  it('báo mọi giá trị sai vào danh sách lỗi', () => {
    const problems: string[] = [];
    readResilienceEnv({ DOWNSTREAM_RETRY_ATTEMPTS: '0', DOWNSTREAM_RETRY_BASE_MS: 'x', DOWNSTREAM_BREAKER_THRESHOLD: '0', DOWNSTREAM_BREAKER_OPEN_MS: '10' }, problems);
    expect(problems).toHaveLength(4);
  });
});

// ───────── callDownstream với máy chủ thật ─────────
type Handler = (req: IncomingMessage, res: ServerResponse, hit: number) => void;
const okJson = (res: ServerResponse, data: unknown = { v: 1 }) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data })); };
const errJson = (res: ServerResponse, status: number, code = 'X') => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: false, error: { code, message: 'lỗi' } })); };

describe('callDownstream: retry và circuit breaker', () => {
  let server: Server;
  let url = '';
  let hits = 0;
  let handler: Handler = (_q, res) => okJson(res);
  const sleeps: number[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => { hits += 1; handler(req, res, hits); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });
  beforeEach(() => { hits = 0; sleeps.length = 0; handler = (_q, res) => okJson(res); });

  /** Đích có retry (không ngủ thật, ghi lại thời gian chờ) và breaker dùng đồng hồ giả. */
  const target = (over: { attempts?: number; threshold?: number; openMs?: number; baseUrl?: string; timeoutMs?: number } = {}) => {
    let t = 0;
    const t0 = createDownstreamTarget({ service: 'catalog', baseUrl: over.baseUrl ?? url, internalKey: 'k'.repeat(24), timeoutMs: over.timeoutMs ?? 1000 },
      { retryAttempts: over.attempts ?? 3, retryBaseDelayMs: 100, breakerThreshold: over.threshold ?? 5, breakerOpenMs: over.openMs ?? 10_000 });
    t0.breaker = new CircuitBreaker({ failureThreshold: over.threshold ?? 5, openMs: over.openMs ?? 10_000, now: () => t });
    t0.retry = { ...t0.retry!, random: () => 1, sleep: async (ms) => { sleeps.push(ms); } };
    return { t: t0, advance: (ms: number) => { t += ms; } };
  };
  const call = (t: DownstreamTarget, method: 'GET' | 'POST' = 'GET', opts?: { idempotent?: boolean }) => callDownstream<{ v: number }>(t, method, '/x', method === 'POST' ? {} : undefined, opts);
  const failWith = (e: unknown) => e as DownstreamError;

  it('không có breaker/retry (đích cũ) thì một lần gọi, hành vi như trước', async () => {
    handler = (_q, res) => errJson(res, 503);
    const bare: DownstreamTarget = { service: 'catalog', baseUrl: url, internalKey: 'k'.repeat(24), timeoutMs: 1000 };
    await expect(call(bare)).rejects.toMatchObject({ status: 503 });
    expect(hits).toBe(1);
  });

  it('GET gặp 503 hai lần rồi ổn: tự thử lại và thành công, thời gian chờ tăng dần', async () => {
    handler = (_q, res, hit) => (hit <= 2 ? errJson(res, 503) : okJson(res));
    await expect(call(target().t)).resolves.toEqual({ v: 1 });
    expect(hits).toBe(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('hết số lần thử thì ném lỗi cuối cùng', async () => {
    handler = (_q, res) => errJson(res, 503);
    await expect(call(target({ attempts: 3 }).t)).rejects.toMatchObject({ status: 503 });
    expect(hits).toBe(3);
    expect(sleeps).toHaveLength(2);
  });

  it('không kết nối được (cổng đóng): thử lại đủ số lần rồi báo unreachable', async () => {
    const err = failWith(await call(target({ baseUrl: 'http://127.0.0.1:1/api' }).t).catch((e) => e));
    expect(err).toBeInstanceOf(DownstreamError);
    expect(err).toMatchObject({ status: null, reason: 'unreachable' });
    expect(sleeps).toHaveLength(2);
  });

  it('POST không đánh dấu idempotent thì KHÔNG retry; đánh dấu thì retry', async () => {
    handler = (_q, res, hit) => (hit === 1 ? errJson(res, 503) : okJson(res));
    await expect(call(target().t, 'POST')).rejects.toMatchObject({ status: 503 });
    expect(hits).toBe(1);

    hits = 0;
    await expect(call(target().t, 'POST', { idempotent: true })).resolves.toEqual({ v: 1 });
    expect(hits).toBe(2);
  });

  it('GET đánh dấu idempotent:false thì không retry', async () => {
    handler = (_q, res) => errJson(res, 503);
    await expect(call(target().t, 'GET', { idempotent: false })).rejects.toMatchObject({ status: 503 });
    expect(hits).toBe(1);
  });

  it('lỗi 4xx: không retry, và KHÔNG tính vào breaker (service vẫn khỏe)', async () => {
    handler = (_q, res) => errJson(res, 409, 'CONFLICT');
    const { t } = target({ threshold: 3 });
    for (let i = 0; i < 10; i++) await expect(call(t)).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(hits).toBe(10);
    expect(t.breaker!.currentState).toBe('CLOSED');
  });

  it('lỗi 500: không retry nhưng tính vào breaker', async () => {
    handler = (_q, res) => errJson(res, 500);
    const { t } = target({ threshold: 2 });
    await expect(call(t)).rejects.toMatchObject({ status: 500 });
    await expect(call(t)).rejects.toMatchObject({ status: 500 });
    expect(hits).toBe(2);
    expect(t.breaker!.currentState).toBe('OPEN');
  });

  it('quá thời gian chờ: không retry (tránh nhân đôi thời gian chờ), nhưng tính vào breaker', async () => {
    handler = () => { /* treo */ };
    const { t } = target({ timeoutMs: 150, threshold: 1 });
    const err = failWith(await call(t).catch((e) => e));
    expect(err).toMatchObject({ status: null, reason: 'timeout' });
    expect(hits).toBe(1);
    expect(sleeps).toEqual([]);
    expect(t.breaker!.currentState).toBe('OPEN');
  });

  it('mạch ngắt thì báo lỗi ngay, KHÔNG chạm service, mã CIRCUIT_OPEN, status null, không retry', async () => {
    handler = (_q, res) => errJson(res, 503);
    const { t } = target({ attempts: 2, threshold: 2 }); // 1 lời gọi = 2 lần thử = 2 lỗi -> ngắt
    await expect(call(t)).rejects.toMatchObject({ status: 503 });
    expect(t.breaker!.currentState).toBe('OPEN');
    hits = 0; sleeps.length = 0;

    const err = failWith(await call(t).catch((e) => e));
    expect(err).toMatchObject({ status: null, code: CIRCUIT_OPEN_CODE, reason: 'circuit_open' });
    expect(err.isCircuitOpen).toBe(true);
    expect(err.isClientError).toBe(false);
    expect(hits).toBe(0);
    expect(sleeps).toEqual([]);
  });

  it('breaker mở giữa chừng thì dừng retry ngay', async () => {
    handler = (_q, res) => errJson(res, 503);
    const { t } = target({ attempts: 5, threshold: 2 });
    const err = failWith(await call(t).catch((e) => e));
    expect(hits).toBe(2); // lần 3 bị chặn bởi mạch
    expect(err.isCircuitOpen).toBe(true);
  });

  it('hết thời gian ngắt: lời gọi thử thành công thì đóng mạch, dùng lại bình thường', async () => {
    handler = (_q, res) => errJson(res, 500);
    const { t, advance } = target({ threshold: 1, openMs: 5000 });
    await expect(call(t)).rejects.toMatchObject({ status: 500 });
    expect(t.breaker!.currentState).toBe('OPEN');

    handler = (_q, res) => okJson(res);
    advance(5000);
    await expect(call(t)).resolves.toEqual({ v: 1 });
    expect(t.breaker!.currentState).toBe('CLOSED');
    await expect(call(t)).resolves.toEqual({ v: 1 });
  });

  it('hết thời gian ngắt nhưng service vẫn lỗi: ngắt lại, các lời gọi sau lại bị chặn', async () => {
    handler = (_q, res) => errJson(res, 500);
    const { t, advance } = target({ threshold: 1, openMs: 5000 });
    await call(t).catch(() => undefined);
    advance(5000);
    await expect(call(t)).rejects.toMatchObject({ status: 500 }); // lời gọi thử
    hits = 0;
    await expect(call(t)).rejects.toMatchObject({ code: CIRCUIT_OPEN_CODE });
    expect(hits).toBe(0);
  });

  it('mỗi đích một breaker: service này ngắt mạch không ảnh hưởng service kia', async () => {
    handler = (_q, res) => errJson(res, 500);
    const a = target({ threshold: 1 }).t;
    const b = target({ threshold: 1 }).t;
    await call(a).catch(() => undefined);
    expect(a.breaker!.currentState).toBe('OPEN');
    expect(b.breaker!.currentState).toBe('CLOSED');
  });

  it('ghi log khi thử lại', async () => {
    handler = (_q, res, hit) => (hit === 1 ? errJson(res, 503) : okJson(res));
    const warns: string[] = [];
    const { t } = target();
    t.logger = { warn: (m) => warns.push(m) };
    await call(t);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/catalog.*thử lại lần 2\/3/);
  });
});
