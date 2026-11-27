// Lớp gọi API của backend QUA GATEWAY. Mọi yêu cầu của FE đều đi vào một địa chỉ: `${API_BASE}/...`.
// Mặc định là đường dẫn cùng nguồn `/api`: khi dev, Vite chuyển tiếp `/api` tới gateway (xem vite.config.ts) nên không dính CORS;
// khi chạy thật, Caddy chuyển `/api/*` vào gateway. Cần gọi tới địa chỉ khác thì đặt VITE_API_BASE (vd http://localhost:3000/api).

/** Lỗi từ API hoặc từ mạng. `code` là mã ổn định của backend (VALIDATION_FAILED, CONFLICT, NOT_FOUND, TOO_MANY_REQUESTS...). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Lỗi do mạng hoặc máy chủ chưa sẵn sàng (không có phản hồi, 5xx): thử lại sau có thể được. */
  get isTransient(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

export interface PageMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface ApiResult<T> { data: T; meta?: { pagination?: PageMeta } }

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Access token của người dùng đăng nhập (chưa dùng ở cửa hàng khách). */
  token?: string;
  signal?: AbortSignal;
  /** Thời gian chờ tối đa (ms). Mặc định 15 giây. */
  timeoutMs?: number;
}

export interface ApiOptions {
  baseUrl: string;
  fetch: typeof fetch;
}

const NETWORK_MESSAGE = 'Không kết nối được máy chủ, vui lòng kiểm tra mạng và thử lại.';

/** Gom tín hiệu hủy của người gọi với thời gian chờ, để request treo không làm giao diện treo theo. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function createApi({ baseUrl, fetch: fetchImpl }: ApiOptions) {
  const root = baseUrl.replace(/\/+$/, '');

  return async function api<T>(path: string, req: ApiRequest = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { accept: 'application/json', ...req.headers };
    const raw = typeof Blob !== 'undefined' && req.body instanceof Blob; // tệp (vd ảnh): gửi nguyên, đúng loại của tệp
    if (req.body !== undefined) headers['content-type'] = raw ? (req.body as Blob).type || 'application/octet-stream' : 'application/json';
    if (req.token) headers.authorization = `Bearer ${req.token}`;

    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method: req.method ?? (req.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: req.body === undefined ? undefined : raw ? (req.body as Blob) : JSON.stringify(req.body),
        signal: withTimeout(req.signal, req.timeoutMs ?? 15_000),
      });
    } catch (e) {
      // Người dùng chủ động hủy (chuyển trang...) thì để nguyên lỗi hủy cho nơi gọi bỏ qua.
      if (req.signal?.aborted) throw e;
      throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE);
    }

    const text = await res.text();
    let json: { success?: boolean; data?: T; meta?: ApiResult<T>['meta']; error?: { code?: string; message?: string; details?: unknown }; requestId?: string } | null = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }

    if (!res.ok || json?.success === false) {
      // Phản hồi không phải JSON chuẩn (vd 413 từ Caddy, 502 từ proxy): vẫn trả lỗi có mã rõ ràng.
      throw new ApiError(
        res.status,
        json?.error?.code ?? `HTTP_${res.status}`,
        json?.error?.message ?? (res.status >= 500 ? 'Hệ thống đang bận, vui lòng thử lại sau ít phút.' : `Yêu cầu không thành công (${res.status}).`),
        json?.error?.details,
        json?.requestId ?? res.headers.get('x-request-id') ?? undefined,
      );
    }
    if (!json || json.success !== true) throw new ApiError(res.status, 'BAD_RESPONSE', 'Phản hồi từ máy chủ không đúng định dạng.');
    return { data: json.data as T, meta: json.meta };
  };
}

export const API_BASE: string = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api';

/** Client dùng chung của ứng dụng. */
export const api = createApi({ baseUrl: API_BASE, fetch: (...args) => fetch(...args) });

/** Thông báo thân thiện cho người dùng từ một lỗi bất kỳ. */
export function describeError(e: unknown, fallback = 'Có lỗi xảy ra, vui lòng thử lại.'): string {
  if (e instanceof ApiError) return e.message;
  return fallback;
}
