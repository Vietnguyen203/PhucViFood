import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException, ErrorCode } from '@phucvi/shared-library/api';
import type { AttributionSource } from '@phucvi/shared-library/contracts';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { callDownstream, DownstreamError, type DownstreamTarget } from './downstream';

// ───────── Hợp đồng với service catalog ─────────
export interface ReservedItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}
export interface Reservation { orderId: string; replayed: boolean; items: ReservedItem[]; subtotal: number }

// ───────── Hợp đồng với service affiliate ─────────
export interface AttributionRequest {
  referralCode?: string;
  cookie?: { code: string; channelCode?: string | null; clickedAt: string; maxAgeDays?: number };
  customerPhone: string;
  orderedAt: string;
}
export interface Attribution {
  affiliateId: string | null;
  linkId: string | null;
  channelCode: string | null;
  referralCodeUsed: string | null;
  attributionSource: AttributionSource | null;
  isSelfPurchase: boolean;
  commissionEligible: boolean;
  commissionRateBps: number | null;
  reason: string;
}

// ───────── Hợp đồng với service customer ─────────
export interface CustomerUpsertRequest {
  phone: string;
  fullName: string;
  email?: string;
  province?: string;
  ward?: string;
  addressLine?: string;
  /** Khách đồng ý nhận tư vấn ở bước thanh toán. Service customer ghi nhận thời điểm đồng ý. */
  marketingConsent?: boolean;
  /** Nguồn đầu tiên (chỉ dùng khi tạo khách mới). */
  firstAffiliateId?: string | null;
  firstChannelCode?: string | null;
}
export interface CustomerRef { id: string; phone: string; isNew: boolean }

/** Đổi lỗi gọi service khác thành lỗi trả cho client: lỗi hạ tầng là 503, lỗi nghiệp vụ giữ nguyên mã. */
export function toClientError(e: unknown, whenUnavailable: string): unknown {
  if (!(e instanceof DownstreamError)) return e;
  if (e.status === 409) return AppException.conflict(e.message, e.details);
  if (e.status === 422) return new AppException(ErrorCode.BUSINESS_RULE_VIOLATION, e.message, e.details);
  return AppException.unavailable(whenUnavailable);
}

abstract class BaseClient {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly target: DownstreamTarget;

  constructor(service: string, baseUrl: string, config: AppConfig) {
    this.target = { service, baseUrl, internalKey: config.internalApiKey, timeoutMs: config.downstreamTimeoutMs };
  }

  protected call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return callDownstream<T>(this.target, method, path, body);
  }
}

/** Gọi catalog: giữ hàng và trả hàng. */
@Injectable()
export class CatalogClient extends BaseClient {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super('catalog', config.catalogUrl, config);
  }

  reserve(orderId: string, items: Array<{ productId: string; quantity: number }>): Promise<Reservation> {
    return this.call('POST', '/internal/stock/reserve', { orderId, items });
  }

  release(orderId: string): Promise<{ released: boolean }> {
    return this.call('POST', '/internal/stock/release', { orderId });
  }
}

/** Gọi affiliate: ghi nhận CTV cho đơn, tra CTV theo tài khoản. */
@Injectable()
export class AffiliateClient extends BaseClient {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super('affiliate', config.affiliateUrl, config);
  }

  resolveAttribution(req: AttributionRequest): Promise<Attribution> {
    return this.call('POST', '/internal/attribution/resolve', req);
  }

  /** Trả null nếu tài khoản chưa có hồ sơ CTV. */
  async lookupByUser(userId: string): Promise<{ affiliateId: string; referralCode: string; status: string } | null> {
    try {
      return await this.call('GET', `/internal/affiliates/by-user/${userId}`);
    } catch (e) {
      if (e instanceof DownstreamError && e.status === 404) return null;
      throw e;
    }
  }
}

/** Gọi customer: tìm hoặc tạo khách theo SĐT. */
@Injectable()
export class CustomerClient extends BaseClient {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super('customer', config.customerUrl, config);
  }

  upsert(req: CustomerUpsertRequest): Promise<CustomerRef> {
    return this.call('POST', '/internal/customers/upsert', req);
  }
}
