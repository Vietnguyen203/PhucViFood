export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Số lần lỗi hạ tầng LIÊN TIẾP để ngắt mạch. */
  failureThreshold: number;
  /** Thời gian ngắt (ms) trước khi cho gọi thử một lần. */
  openMs: number;
  now?: () => number;
  onStateChange?: (from: BreakerState, to: BreakerState) => void;
}

/**
 * Ngắt mạch cho một service phía sau.
 * - CLOSED: gọi bình thường, đếm lỗi liên tiếp; đủ ngưỡng thì chuyển OPEN.
 * - OPEN: không gọi, báo lỗi ngay (không phải chờ hết thời gian chờ). Hết `openMs` thì chuyển HALF_OPEN.
 * - HALF_OPEN: chỉ MỘT lời gọi thử được đi qua; thành công thì về CLOSED, lỗi thì về OPEN (tính lại thời gian).
 * Gọi `recordSuccess`/`recordFailure` đúng một lần sau mỗi lần `tryAcquire` trả true.
 */
export class CircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  private readonly now: () => number;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.now = opts.now ?? Date.now;
  }

  get currentState(): BreakerState { return this.state; }

  tryAcquire(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (this.now() - this.openedAt < this.opts.openMs) return false;
      this.transition('HALF_OPEN');
    }
    if (this.probing) return false; // đã có một lời gọi thử đang chạy
    this.probing = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.probing = false;
    if (this.state !== 'CLOSED') this.transition('CLOSED');
  }

  recordFailure(): void {
    this.probing = false;
    if (this.state === 'HALF_OPEN') return this.open();
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold) this.open();
  }

  private open(): void {
    this.openedAt = this.now();
    this.failures = 0;
    this.transition('OPEN');
  }

  private transition(to: BreakerState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.opts.onStateChange?.(from, to);
  }
}
