import { CircuitBreaker } from './circuit-breaker';
import type { DownstreamTarget } from './downstream';

export interface ResilienceConfig {
  /** Tổng số lần thử cho lời gọi an toàn khi lặp lại (1 = không retry). */
  retryAttempts: number;
  /** Thời gian chờ cơ sở giữa các lần thử (ms), tăng gấp đôi mỗi lần, có ngẫu nhiên hóa. */
  retryBaseDelayMs: number;
  /** Số lần lỗi hạ tầng liên tiếp để ngắt mạch. */
  breakerThreshold: number;
  /** Thời gian ngắt mạch (ms). */
  breakerOpenMs: number;
}

export const DEFAULT_RESILIENCE: ResilienceConfig = { retryAttempts: 3, retryBaseDelayMs: 100, breakerThreshold: 5, breakerOpenMs: 10_000 };

/** Đọc cấu hình từ môi trường; sai thì thêm vào `problems` (để loadConfig gom lỗi một lượt) và dùng giá trị mặc định. */
export function readResilienceEnv(env: Record<string, string | undefined>, problems: string[]): ResilienceConfig {
  const int = (key: string, def: number, min: number, max: number): number => {
    const n = Number(env[key] ?? def);
    if (!Number.isInteger(n) || n < min || n > max) { problems.push(`${key} phải là số nguyên từ ${min} đến ${max}`); return def; }
    return n;
  };
  return {
    retryAttempts: int('DOWNSTREAM_RETRY_ATTEMPTS', DEFAULT_RESILIENCE.retryAttempts, 1, 5),
    retryBaseDelayMs: int('DOWNSTREAM_RETRY_BASE_MS', DEFAULT_RESILIENCE.retryBaseDelayMs, 10, 5_000),
    breakerThreshold: int('DOWNSTREAM_BREAKER_THRESHOLD', DEFAULT_RESILIENCE.breakerThreshold, 1, 1_000),
    breakerOpenMs: int('DOWNSTREAM_BREAKER_OPEN_MS', DEFAULT_RESILIENCE.breakerOpenMs, 500, 300_000),
  };
}

export interface TargetLogger { log(message: string): void; warn(message: string): void }

/**
 * Tạo đích gọi cho MỘT service phía sau, kèm retry và circuit breaker.
 * Mỗi service một đích (một breaker), dùng chung cho mọi lời gọi tới service đó trong tiến trình.
 */
export function createDownstreamTarget(
  base: Pick<DownstreamTarget, 'service' | 'baseUrl' | 'internalKey' | 'timeoutMs'>,
  resilience: ResilienceConfig = DEFAULT_RESILIENCE,
  logger?: TargetLogger,
): DownstreamTarget {
  return {
    ...base,
    breaker: new CircuitBreaker({
      failureThreshold: resilience.breakerThreshold,
      openMs: resilience.breakerOpenMs,
      onStateChange: (from, to) => {
        const msg = `Mạch tới ${base.service}: ${from} -> ${to}`;
        if (to === 'CLOSED') logger?.log(msg); else logger?.warn(msg);
      },
    }),
    retry: { maxAttempts: resilience.retryAttempts, baseDelayMs: resilience.retryBaseDelayMs, maxDelayMs: 2_000 },
    logger,
  };
}
