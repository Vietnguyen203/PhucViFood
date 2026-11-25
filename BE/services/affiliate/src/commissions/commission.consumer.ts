import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventTypes } from '@phucvi/shared-library/contracts';
import { RABBITMQ_CLIENT, RabbitMqClient } from '@phucvi/shared-library/messaging';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { CommissionEventsService } from './commission-events.service';

/** Đăng ký nhận sự kiện đơn hàng. RabbitMqClient tự bắt đầu consumer ngay khi kết nối xong. */
@Injectable()
export class CommissionConsumer implements OnApplicationBootstrap {
  constructor(
    @Inject(RABBITMQ_CLIENT) private readonly rabbit: RabbitMqClient,
    @Inject(CommissionEventsService) private readonly events: CommissionEventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbit.subscribe({
      queue: this.config.eventQueue,
      routingKeys: [EventTypes.ORDER_PLACED, EventTypes.ORDER_STATUS_CHANGED],
      handler: (event) => this.events.handle(event),
      // Xử lý TUẦN TỰ: sự kiện của cùng một đơn (placed rồi COMPLETED) phải được xử lý đúng thứ tự.
      // Nếu cho chạy song song, COMPLETED có thể tới trước khi hoa hồng được tạo và bị bỏ sót.
      prefetch: 1,
    });
  }
}
