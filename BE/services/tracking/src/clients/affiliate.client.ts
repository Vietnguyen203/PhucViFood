import { Inject, Injectable, Logger } from '@nestjs/common';
import { callDownstream, createDownstreamTarget, DownstreamError, type DownstreamTarget } from '@phucvi/shared-library/http';
import { APP_CONFIG, AppConfig } from '../config/app-config';

/** Kết quả hỏi affiliate về một mã giới thiệu (kèm kênh). Mã không dùng được thì `valid:false`. */
export type ReferralContext =
  | { valid: false }
  | { valid: true; affiliateId: string; referralCode: string; linkId: string | null; cookieDays: number };

export interface AffiliateRef { affiliateId: string; referralCode: string; status: string }

const POSITIVE_TTL_MS = 60_000;
/** Mã sai/chưa duyệt chỉ nhớ ngắn: CTV vừa được duyệt không phải chờ lâu mới có lượt bấm được ghi. */
const NEGATIVE_TTL_MS = 10_000;
const MAX_ENTRIES = 5_000;

/** Nhớ tạm kết quả tra mã để mỗi lượt bấm/sự kiện không phải gọi affiliate. Chỉ giữ trong bộ nhớ tiến trình. */
export class ContextCache {
  private readonly map = new Map<string, { value: ReferralContext; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): ReferralContext | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) { this.map.delete(key); return undefined; }
    return hit.value;
  }

  set(key: string, value: ReferralContext): void {
    if (this.map.size >= MAX_ENTRIES) this.map.delete(this.map.keys().next().value as string); // bỏ mục cũ nhất
    this.map.set(key, { value, expiresAt: this.now() + (value.valid ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });
  }

  get size(): number { return this.map.size; }
}

/** Gọi affiliate (API nội bộ). Lỗi hạ tầng ném DownstreamError để nơi gọi quyết định (click: 503, sự kiện: bỏ qua). */
@Injectable()
export class AffiliateClient {
  private readonly target: DownstreamTarget;
  private readonly cache = new ContextCache();

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.target = createDownstreamTarget(
      { service: 'affiliate', baseUrl: config.affiliateUrl, internalKey: config.internalApiKey, timeoutMs: config.downstreamTimeoutMs },
      config.downstreamResilience,
      new Logger(AffiliateClient.name),
    );
  }

  /** Mã (đã chuẩn hóa chữ thường) và kênh có thuộc CTV còn hiệu lực không; kèm link theo kênh và số ngày cookie. */
  async referralContext(code: string, channelCode: string | null): Promise<ReferralContext> {
    const key = `${code}|${channelCode ?? ''}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    // Chỉ đọc, không ghi gì: an toàn khi gọi lặp nên được retry.
    const result = await callDownstream<ReferralContext>(this.target, 'POST', '/internal/referrals/context', { code, channel: channelCode ?? undefined }, { idempotent: true });
    this.cache.set(key, result);
    return result;
  }

  /** Hồ sơ CTV của tài khoản đăng nhập; null nếu chưa có hồ sơ. */
  async byUser(userId: string): Promise<AffiliateRef | null> {
    try {
      return await callDownstream<AffiliateRef>(this.target, 'GET', `/internal/affiliates/by-user/${userId}`);
    } catch (e) {
      if (e instanceof DownstreamError && e.status === 404) return null;
      throw e;
    }
  }
}
