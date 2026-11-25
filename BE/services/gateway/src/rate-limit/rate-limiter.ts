import type { RateLimitConfig } from '../config/app-config';

const MINUTE = 60_000;
/** Số khóa tối đa giữ trong bộ nhớ; đầy thì bỏ khóa cũ nhất để không bị làm tràn bộ nhớ bằng nhiều IP giả. */
const MAX_KEYS = 200_000;

export interface RateRule {
  name: string;
  limit: number;
  windowMs: number;
  match: (method: string, path: string) => boolean;
}

export interface RateResult {
  allowed: boolean;
  /** Giới hạn của luật chặt nhất đang áp dụng. */
  limit: number;
  remaining: number;
  /** Chỉ có ý nghĩa khi bị chặn: số giây phải chờ. */
  retryAfterSec: number;
}

interface Counter { count: number; resetAt: number }

/**
 * Giới hạn tốc độ theo IP, cửa sổ cố định, lưu trong bộ nhớ (một gateway).
 * Mỗi yêu cầu tính vào MỌI luật khớp; chỉ khi tất cả còn chỗ mới được đếm, nên yêu cầu bị chặn không làm cạn hạn mức của luật khác.
 */
export class RateLimiter {
  private readonly counters = new Map<string, Counter>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly rules: RateRule[], private readonly now: () => number = Date.now) {
    this.sweeper = setInterval(() => this.sweep(), MINUTE);
    this.sweeper.unref();
  }

  check(ip: string, method: string, path: string): RateResult {
    const t = this.now();
    const active = this.rules.filter((r) => r.match(method, path)).map((rule) => ({ rule, counter: this.counterFor(rule, ip, t) }));
    if (!active.length) return { allowed: true, limit: Infinity, remaining: Infinity, retryAfterSec: 0 };

    const blocked = active.filter(({ rule, counter }) => counter.count >= rule.limit);
    if (blocked.length) {
      const wait = Math.max(...blocked.map(({ counter }) => counter.resetAt - t));
      const tight = blocked[0].rule;
      return { allowed: false, limit: tight.limit, remaining: 0, retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) };
    }

    let tightest = { limit: Infinity, remaining: Infinity };
    for (const { rule, counter } of active) {
      counter.count += 1;
      const remaining = rule.limit - counter.count;
      if (remaining < tightest.remaining) tightest = { limit: rule.limit, remaining };
    }
    return { allowed: true, ...tightest, retryAfterSec: 0 };
  }

  stop(): void { clearInterval(this.sweeper); }

  private counterFor(rule: RateRule, ip: string, t: number): Counter {
    const key = `${rule.name}|${ip}`;
    let c = this.counters.get(key);
    if (!c || c.resetAt <= t) {
      if (!c && this.counters.size >= MAX_KEYS) this.evict(t);
      c = { count: 0, resetAt: t + rule.windowMs };
      this.counters.set(key, c);
    }
    return c;
  }

  private evict(t: number): void {
    this.sweep(t);
    if (this.counters.size >= MAX_KEYS) {
      const oldest = this.counters.keys().next().value;
      if (oldest !== undefined) this.counters.delete(oldest);
    }
  }

  private sweep(t: number = this.now()): void {
    for (const [key, c] of this.counters) if (c.resetAt <= t) this.counters.delete(key);
  }
}

const isPost = (m: string) => m === 'POST';

/** Các luật mặc định của hệ thống (đường dẫn tính sau `/api`). */
export function buildRules(cfg: RateLimitConfig): RateRule[] {
  return [
    { name: 'global', limit: cfg.globalPerMin, windowMs: MINUTE, match: () => true },
    {
      name: 'auth', limit: cfg.authPerMin, windowMs: MINUTE,
      match: (m, p) => isPost(m) && (p === '/auth/login' || p === '/auth/register' || p === '/auth/refresh'),
    },
    {
      name: 'public-write', limit: cfg.publicWritePerMin, windowMs: MINUTE,
      match: (m, p) => isPost(m) && (p === '/public/orders' || p === '/public/referrals/click' || p.startsWith('/public/tracking/')),
    },
    {
      name: 'lookup', limit: cfg.lookupPerMin, windowMs: MINUTE,
      match: (_m, p) => p.startsWith('/public/orders/'),
    },
  ];
}
