import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventTypes, type OrderStatusChangedPayload } from '@phucvi/shared-library/contracts';
import { InboxService, RABBITMQ_CLIENT, RabbitMqClient } from '@phucvi/shared-library/messaging';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';

const CONSUMER = 'catalog-stock-release';

/**
 * Trả hàng về kho khi đơn bị HỦY. Đơn bị TRẢ (RETURNED) không tự nhập lại kho vì hàng trả phải kiểm tra;
 * admin điều chỉnh tay (POST /products/:id/stock-adjustments).
 */
@Injectable()
export class StockConsumer implements OnApplicationBootstrap {
  constructor(
    @Inject(RABBITMQ_CLIENT) private readonly rabbit: RabbitMqClient,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbit.subscribe({
      queue: this.config.eventQueue,
      routingKeys: [EventTypes.ORDER_STATUS_CHANGED],
      prefetch: 1,
      handler: async (event) => {
        const p = event.payload as OrderStatusChangedPayload;
        if (p.toStatus !== 'CANCELLED') return;
        await this.prisma.$transaction((tx) =>
          this.inbox.processOnce('catalog', tx, event.id, CONSUMER, () => this.stock.releaseInTx(tx, p.orderId)),
        );
      },
    });
  }
}
