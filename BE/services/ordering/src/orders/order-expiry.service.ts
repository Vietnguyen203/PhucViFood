import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { OrderStatusCodec, PaymentMethodCodec, PaymentStatusCodec } from '@phucvi/shared-library/contracts';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

/** Số đơn xử lý tối đa mỗi lượt chạy; còn dư thì lượt sau xử lý tiếp. */
const BATCH = 100;

export const EXPIRED_PAYMENT_REASON = 'Quá hạn thanh toán, hệ thống tự hủy đơn';

/**
 * Tự hủy đơn chuyển khoản quá hạn thanh toán. Không có job này thì đơn chuyển khoản không ai trả tiền
 * sẽ giữ hàng mãi. Hủy đơn phát sự kiện order.status_changed, catalog trả hàng về kho và affiliate hủy hoa hồng dự kiến,
 * y như khi khách hoặc admin hủy.
 *
 * Chạy an toàn khi có nhiều bản sao ordering: mỗi lần hủy là một lần chuyển trạng thái có điều kiện (đơn đã đổi trạng thái
 * thì lần chuyển báo xung đột và bị bỏ qua), nên không hủy hai lần hay đè lên đơn vừa được thanh toán.
 */
@Injectable()
export class OrderExpiryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.orderExpiryEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.orderExpiryIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // lượt trước chưa xong thì bỏ qua lượt này
    this.running = true;
    try {
      const n = await this.runOnce();
      if (n > 0) this.logger.log(`Đã hủy ${n} đơn chuyển khoản quá hạn thanh toán`);
    } catch (e) {
      this.logger.error(`Lượt hủy đơn quá hạn lỗi: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Hủy các đơn: chuyển khoản, chưa thanh toán, còn PLACED hoặc CONFIRMED (chưa giao vận chuyển), đã qua `payment_due_at`.
   * Trả số đơn đã hủy.
   */
  async runOnce(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: {
        paymentMethod: PaymentMethodCodec.toCode('BANK_QR'),
        paymentStatus: PaymentStatusCodec.toCode('UNPAID'),
        status: { in: [OrderStatusCodec.toCode('PLACED'), OrderStatusCodec.toCode('CONFIRMED')] },
        paymentDueAt: { lt: now },
      },
      orderBy: { paymentDueAt: 'asc' },
      take: BATCH,
    });

    let cancelled = 0;
    for (const order of due) {
      try {
        await this.orders.transition(order, 'CANCELLED', { type: 'SYSTEM', id: null }, { reason: EXPIRED_PAYMENT_REASON });
        cancelled++;
      } catch (e) {
        // Đơn vừa được thanh toán hoặc đổi trạng thái ở nơi khác: bỏ qua, lần sau chọn lại nếu vẫn thỏa điều kiện.
        if (e instanceof AppException) { this.logger.debug(`Bỏ qua đơn ${order.code}: ${e.message}`); continue; }
        this.logger.error(`Hủy đơn quá hạn ${order.code} lỗi: ${e instanceof Error ? e.message : e}`);
      }
    }
    return cancelled;
  }
}
