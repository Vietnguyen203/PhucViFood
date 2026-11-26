import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, describeError } from './api';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {}));
  const api = createApi({ baseUrl: 'http://gw/api/', fetch: fetchMock as unknown as typeof fetch });
  return { api, fetchMock };
}

describe('createApi: thành công', () => {
  it('bóc phong bì { success, data, meta } và ghép địa chỉ (bỏ dấu / thừa ở cuối base)', async () => {
    const { api, fetchMock } = setup(() => json({ success: true, data: [{ id: 1 }], meta: { pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1 } } }));
    const r = await api<Array<{ id: number }>>('/public/products');
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.meta?.pagination?.total).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://gw/api/public/products');
  });

  it('GET mặc định; có body thì POST, gửi JSON và content-type; token thành Bearer; header tùy ý được giữ', async () => {
    const { api, fetchMock } = setup(() => json({ success: true, data: null }));
    await api('/x');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['content-type']).toBeUndefined();

    await api('/y', { body: { a: 1 }, token: 'abc', headers: { 'idempotency-key': 'k-12345678' } });
    const init = fetchMock.mock.calls[1][1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer abc', 'idempotency-key': 'k-12345678', accept: 'application/json' });
  });
});

describe('createApi: lỗi', () => {
  it('phong bì lỗi của backend thành ApiError có mã, thông điệp, chi tiết và mã yêu cầu', async () => {
    const { api } = setup(() => json({ success: false, error: { code: 'CONFLICT', message: 'Không đủ tồn kho', details: [{ productId: 'p1', available: 2 }] }, requestId: 'req-1' }, { status: 409 }));
    const e = await api('/public/orders', { body: {} }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: 'CONFLICT', message: 'Không đủ tồn kho', requestId: 'req-1', details: [{ productId: 'p1', available: 2 }] });
    expect(e.isTransient).toBe(false);
  });

  it('phản hồi không phải JSON chuẩn (vd 413 từ Caddy) vẫn ra lỗi có mã HTTP_<status>', async () => {
    const { api } = setup(() => new Response('Request Entity Too Large', { status: 413 }));
    expect(await api('/x', { body: {} }).catch((x) => x)).toMatchObject({ status: 413, code: 'HTTP_413' });
  });

  it('5xx là lỗi tạm thời và có thông điệp thân thiện; 429 cũng tạm thời', async () => {
    const { api } = setup((url) => (url.endsWith('/busy') ? new Response('', { status: 429 }) : new Response('Bad Gateway', { status: 502 })));
    const e502 = await api('/x').catch((x) => x);
    expect(e502).toMatchObject({ status: 502, code: 'HTTP_502' });
    expect(e502.isTransient).toBe(true);
    expect(e502.message).toMatch(/thử lại/);
    expect((await api('/busy').catch((x) => x)).isTransient).toBe(true);
  });

  it('mất mạng thành ApiError NETWORK (status 0, tạm thời)', async () => {
    const { api } = setup(() => { throw new TypeError('fetch failed'); });
    const e = await api('/x').catch((x) => x);
    expect(e).toMatchObject({ status: 0, code: 'NETWORK' });
    expect(e.isTransient).toBe(true);
  });

  it('quá thời gian chờ thì hủy và báo NETWORK, không treo', async () => {
    const { api } = setup((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const started = Date.now();
    const e = await api('/slow', { timeoutMs: 40 }).catch((x) => x);
    expect(e).toMatchObject({ code: 'NETWORK' });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('người dùng chủ động hủy (chuyển trang) thì ném nguyên lỗi hủy để nơi gọi bỏ qua, không báo lỗi mạng', async () => {
    const ctl = new AbortController();
    const { api } = setup((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const p = api('/x', { signal: ctl.signal }).catch((x) => x);
    ctl.abort();
    const e = await p;
    expect(e).not.toBeInstanceOf(ApiError);
    expect((e as DOMException).name).toBe('AbortError');
  });

  it('200 nhưng không đúng phong bì thì BAD_RESPONSE', async () => {
    const { api } = setup(() => json({ hello: 'world' }));
    expect(await api('/x').catch((x) => x)).toMatchObject({ code: 'BAD_RESPONSE' });
  });
});

describe('describeError', () => {
  it('lấy thông điệp của ApiError; lỗi khác dùng câu mặc định', () => {
    expect(describeError(new ApiError(400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ'))).toBe('Dữ liệu không hợp lệ');
    expect(describeError(new Error('lỗi nội bộ lộ ra'))).toBe('Có lỗi xảy ra, vui lòng thử lại.');
    expect(describeError(null, 'Tùy chỉnh')).toBe('Tùy chỉnh');
  });
});
