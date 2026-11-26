import { Inject, Injectable, Logger } from '@nestjs/common';
import { callDownstream, createDownstreamTarget, type DownstreamTarget } from '@phucvi/shared-library/http';
import { APP_CONFIG, AppConfig } from '../config/app-config';

const CHUNK = 500; // giới hạn một lần gọi của ordering

/** Gọi ordering (API nội bộ). Lỗi hạ tầng ném DownstreamError để nơi gọi quyết định (job dọn hàng thì bỏ lượt, không trả hàng). */
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

  /** Trong các mã đơn đã cho, tập mã có đơn thật ở ordering. */
  async existingOrderIds(orderIds: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      // Chỉ đọc, an toàn khi gọi lặp nên được retry.
      const r = await callDownstream<{ existing: string[] }>(this.target, 'POST', '/internal/orders/existence', { orderIds: orderIds.slice(i, i + CHUNK) }, { idempotent: true });
      for (const id of r.existing) existing.add(id);
    }
    return existing;
  }
}
