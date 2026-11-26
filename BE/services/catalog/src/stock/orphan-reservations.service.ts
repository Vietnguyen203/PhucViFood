import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { StockMovementReasonCode } from '@phucvi/shared-library/contracts';
import { DownstreamError } from '@phucvi/shared-library/http';
import { OrderingClient } from '../clients/ordering.client';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';

const PAGE = 500;
const MAX_PAGES = 20;

export interface SweepResult { checked: number; released: string[]; skipped: boolean }

/**
 * Dọn hàng đã giữ cho đơn KHÔNG BAO GIỜ được tạo. Ordering giữ hàng ở catalog trước khi tạo đơn; nếu ordering sập
 * (hoặc bồi hoàn thất bại) đúng giữa hai bước đó thì hàng bị trừ mà không có đơn nào để hủy hay trả. Không có job này
 * phần tồn kho đó mất vĩnh viễn.
 *
 * Cách làm: lấy các lần giữ hàng đủ "tuổi" (mặc định hơn 10 phút, tức chắc chắn ordering đã tạo xong đơn nếu có)
 * mà chưa được trả, hỏi ordering mã nào có đơn thật, trả hàng cho các mã không có.
 * AN TOÀN: chỉ trả hàng khi ordering đã trả lời thành công. Ordering không trả lời thì bỏ lượt, tuyệt đối không đoán
 * (trả nhầm hàng của đơn thật sẽ làm bán quá tồn kho).
 */
@Injectable()
export class OrphanReservationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrphanReservationsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(OrderingClient) private readonly ordering: OrderingClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.orphanSweepEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.orphanSweepIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.runOnce();
      if (r.released.length > 0) this.logger.warn(`Đã trả hàng cho ${r.released.length} đơn không tồn tại ở ordering: ${r.released.join(', ')}`);
    } catch (e) {
      this.logger.error(`Lượt dọn hàng giữ mồ côi lỗi: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /** Tìm các mã đơn đã giữ hàng, chưa được trả, trong khoảng [now - lookback, now - minAge], mới nhất trước. */
  private async candidates(from: Date, to: Date, before: Date | null): Promise<Array<{ orderId: string; firstAt: Date }>> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ order_id: string; first_at: Date }>>(
      `SELECT m.order_id::text AS order_id, min(m.created_at) AS first_at
         FROM catalog.stock_movements m
        WHERE m.reason = $1 AND m.order_id IS NOT NULL AND m.created_at >= $2 AND m.created_at < $3
          AND NOT EXISTS (SELECT 1 FROM catalog.stock_movements r WHERE r.order_id = m.order_id AND r.reason = $4)
        GROUP BY m.order_id
       HAVING ($5::timestamptz IS NULL OR min(m.created_at) < $5)
        ORDER BY min(m.created_at) DESC
        LIMIT ${PAGE}`,
      StockMovementReasonCode.ORDER_PLACED, from, to, StockMovementReasonCode.ORDER_CANCELLED, before,
    );
    return rows.map((r) => ({ orderId: r.order_id, firstAt: r.first_at }));
  }

  /** Một lượt dọn. Trả số đơn đã kiểm tra và danh sách mã đơn đã trả hàng; `skipped` khi ordering không trả lời. */
  async runOnce(now: Date = new Date()): Promise<SweepResult> {
    const to = new Date(now.getTime() - this.config.orphanMinAgeMinutes * 60_000);
    const from = new Date(now.getTime() - this.config.orphanLookbackHours * 3_600_000);
    const released: string[] = [];
    let checked = 0;
    let cursor: Date | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await this.candidates(from, to, cursor);
      if (batch.length === 0) break;
      checked += batch.length;

      let existing: Set<string>;
      try {
        existing = await this.ordering.existingOrderIds(batch.map((b) => b.orderId));
      } catch (e) {
        if (!(e instanceof DownstreamError)) throw e;
        this.logger.warn(`Bỏ lượt dọn hàng giữ mồ côi: ordering không trả lời (${e.reason ?? e.status})`);
        return { checked, released, skipped: true };
      }

      for (const { orderId } of batch) {
        if (existing.has(orderId)) continue;
        const result = await this.prisma.$transaction((tx) => this.stock.releaseInTx(tx, orderId));
        if (result.released && !result.alreadyReleased) released.push(orderId);
      }

      if (batch.length < PAGE) break;
      cursor = batch[batch.length - 1].firstAt;
    }
    return { checked, released, skipped: false };
  }
}
