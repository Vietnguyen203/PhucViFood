import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { callDownstream, createDownstreamTarget, type DownstreamTarget } from '@phucvi/shared-library/http';
import type { CustomerOrderStats } from '@phucvi/shared-library/utils';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export interface RecentOrder { id: string; code: string; status: string; totalAmount: number; placedAt: string }

const CHUNK = 500; // giới hạn một lần gọi của ordering

/** Gọi ordering (API nội bộ) để lấy thống kê đơn theo khách. */
@Injectable()
export class OrderingClient {
  private readonly target: DownstreamTarget;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.target = createDownstreamTarget(
      { service: 'ordering', baseUrl: config.orderingUrl, internalKey: config.internalApiKey, timeoutMs: config.downstreamTimeoutMs },
      config.downstreamResilience,
      new Logger(OrderingClient.name),
    );
  }

  /** Thống kê theo khách. Khách không có đơn hợp lệ không có trong Map (nghĩa là 0 đơn). Lỗi thì ném DownstreamError. */
  async orderStats(customerIds: string[]): Promise<Map<string, CustomerOrderStats>> {
    const out = new Map<string, CustomerOrderStats>();
    const chunks: string[][] = [];
    for (let i = 0; i < customerIds.length; i += CHUNK) chunks.push(customerIds.slice(i, i + CHUNK));
    const results = await Promise.all(chunks.map((ids) =>
      callDownstream<{ stats: Array<{ customerId: string; validOrders: number; totalSpent: number; lastOrderAt: string }> }>(
        this.target, 'POST', '/internal/customers/order-stats', { customerIds: ids }, { idempotent: true }))); // chỉ đọc
    for (const r of results) {
      for (const s of r.stats) out.set(s.customerId, { validOrders: s.validOrders, totalSpent: s.totalSpent, lastOrderAt: new Date(s.lastOrderAt) });
    }
    return out;
  }

  recentOrders(customerId: string, limit = 10): Promise<RecentOrder[]> {
    return callDownstream<RecentOrder[]>(this.target, 'GET', `/internal/customers/${customerId}/orders?limit=${limit}`);
  }
}

export const statsUnavailable = () => AppException.unavailable('Không lấy được thống kê đơn hàng, vui lòng thử lại');
