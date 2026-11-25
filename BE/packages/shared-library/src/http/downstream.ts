import { INTERNAL_KEY_HEADER } from '../auth/internal-key.guard';
import type { CircuitBreaker } from './circuit-breaker';

/** Lý do khi không có phản hồi từ service (status = null). */
export type DownstreamFailureReason = 'timeout' | 'unreachable' | 'circuit_open';

/** Mã `code` của lỗi do mạch đang ngắt (không phải service trả về). */
export const CIRCUIT_OPEN_CODE = 'CIRCUIT_OPEN';

/** Lỗi khi gọi service khác. `status` null nghĩa là không có phản hồi (mạng, hết thời gian chờ, mạch ngắt). */
export class DownstreamError extends Error {
  constructor(
    readonly service: string,
    readonly status: number | null,
    readonly code: string | null,
    message: string,
    readonly details?: unknown,
    readonly reason?: DownstreamFailureReason,
  ) {
    super(message);
    this.name = 'DownstreamError';
  }

  /** Lỗi do chính yêu cầu (4xx), khác với lỗi hạ tầng (không phản hồi, 5xx). */
  get isClientError(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }

  /** Mạch đang ngắt nên chưa hề gọi tới service. */
  get isCircuitOpen(): boolean {
    return this.reason === 'circuit_open';
  }

  /** Service có vấn đề (tính vào breaker): không phản hồi hoặc 5xx. Mạch ngắt không tính (chưa gọi). */
  get isInfrastructureFailure(): boolean {
    if (this.isCircuitOpen) return false;
    return this.status === null || this.status >= 500;
  }

  /**
   * Đáng thử lại: không kết nối được, hoặc 502/503/504 (service tạm thời không xử lý được).
   * KHÔNG retry khi quá thời gian chờ (service đang treo, thử thêm chỉ nhân đôi thời gian chờ và tải) hay 500 (thường là lỗi lặp lại).
   */
  get isRetryable(): boolean {
    return this.reason === 'unreachable' || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

export interface RetryPolicy {
  /** Tổng số lần thử, kể cả lần đầu. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Chỉ để test: thay hàm ngủ và hàm ngẫu nhiên. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface DownstreamTarget {
  service: string;
  baseUrl: string;
  internalKey: string;
  timeoutMs: number;
  /** Ngắt mạch dùng chung cho mọi lời gọi tới service này. Bỏ trống thì không ngắt mạch. */
  breaker?: CircuitBreaker;
  /** Bỏ trống thì không retry. */
  retry?: RetryPolicy;
  logger?: { warn(message: string): void };
}

export interface CallOptions {
  /**
   * Lời gọi an toàn khi lặp lại (cùng kết quả, không tác dụng phụ lần hai). Mặc định: GET là có, POST là không.
   * Chỉ lời gọi idempotent mới được retry; đánh dấu `true` cho POST chỉ khi API phía sau đã idempotent
   * (vd giữ hàng theo orderId, tạo-hoặc-cập-nhật khách theo SĐT, tra cứu bằng POST).
   */
  idempotent?: boolean;
}

/** Một lần gọi, không retry. Mọi lỗi đều là DownstreamError. */
async function callOnce<T>(target: DownstreamTarget, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${target.baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', [INTERNAL_KEY_HEADER]: target.internalKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(target.timeoutMs),
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    throw new DownstreamError(target.service, null, null, `${target.service}: ${timeout ? 'quá thời gian chờ' : 'không kết nối được'}`, undefined, timeout ? 'timeout' : 'unreachable');
  }

  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok || !json?.success) {
    throw new DownstreamError(target.service, res.status, json?.error?.code ?? null, json?.error?.message ?? `${target.service}: lỗi ${res.status}`, json?.error?.details);
  }
  return json.data as T;
}

/** Chờ trước lần thử kế tiếp: lũy thừa của 2 có ngẫu nhiên hóa (full jitter) để nhiều tiến trình không dồn cùng lúc. */
export function retryDelay(policy: RetryPolicy, attempt: number): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.round((policy.random ?? Math.random)() * ceiling);
}

/**
 * Gọi API nội bộ của service khác. Trả `data` của phong bì chuẩn { success, data }.
 * Mọi lỗi đều ném DownstreamError để nơi gọi quyết định xử lý (bồi hoàn, báo 503...).
 *
 * Nếu `target` có breaker: mạch ngắt thì báo lỗi ngay (không gọi). Nếu có retry: lời gọi idempotent được thử lại khi
 * không kết nối được hoặc service trả 502/503/504. Lỗi 4xx là lỗi của yêu cầu: không retry và không tính vào breaker.
 */
export async function callDownstream<T>(target: DownstreamTarget, method: 'GET' | 'POST', path: string, body?: unknown, options: CallOptions = {}): Promise<T> {
  const idempotent = options.idempotent ?? method === 'GET';
  const maxAttempts = idempotent && target.retry ? Math.max(1, target.retry.maxAttempts) : 1;

  for (let attempt = 1; ; attempt++) {
    if (target.breaker && !target.breaker.tryAcquire()) {
      throw new DownstreamError(target.service, null, CIRCUIT_OPEN_CODE, `${target.service}: tạm ngắt kết nối do lỗi liên tiếp`, undefined, 'circuit_open');
    }
    try {
      const data = await callOnce<T>(target, method, path, body);
      target.breaker?.recordSuccess();
      return data;
    } catch (e) {
      if (!(e instanceof DownstreamError)) throw e;
      // 4xx nghĩa là service còn khỏe (chỉ từ chối yêu cầu): tính là thành công với breaker.
      if (e.isInfrastructureFailure) target.breaker?.recordFailure(); else target.breaker?.recordSuccess();

      if (attempt >= maxAttempts || !e.isRetryable || !target.retry) throw e;
      const delay = retryDelay(target.retry, attempt);
      target.logger?.warn(`${target.service}: ${method} ${path.split('?')[0]} lỗi (${e.status ?? e.reason}), thử lại lần ${attempt + 1}/${maxAttempts} sau ${delay}ms`);
      await (target.retry.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))))(delay);
    }
  }
}
