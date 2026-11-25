import { INTERNAL_KEY_HEADER } from '../auth/internal-key.guard';

/** Lỗi khi gọi service khác. `status` null nghĩa là không có phản hồi (mạng, hết thời gian chờ). */
export class DownstreamError extends Error {
  constructor(
    readonly service: string,
    readonly status: number | null,
    readonly code: string | null,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DownstreamError';
  }

  /** Lỗi do chính yêu cầu (4xx), khác với lỗi hạ tầng (không phản hồi, 5xx). */
  get isClientError(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }
}

export interface DownstreamTarget {
  service: string;
  baseUrl: string;
  internalKey: string;
  timeoutMs: number;
}

/**
 * Gọi API nội bộ của service khác. Trả `data` của phong bì chuẩn { success, data }.
 * Mọi lỗi đều ném DownstreamError để nơi gọi quyết định xử lý (bồi hoàn, báo 503...).
 */
export async function callDownstream<T>(target: DownstreamTarget, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${target.baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', [INTERNAL_KEY_HEADER]: target.internalKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(target.timeoutMs),
    });
  } catch (e) {
    const reason = e instanceof Error && e.name === 'TimeoutError' ? 'quá thời gian chờ' : 'không kết nối được';
    throw new DownstreamError(target.service, null, null, `${target.service}: ${reason}`);
  }

  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok || !json?.success) {
    throw new DownstreamError(target.service, res.status, json?.error?.code ?? null, json?.error?.message ?? `${target.service}: lỗi ${res.status}`, json?.error?.details);
  }
  return json.data as T;
}
