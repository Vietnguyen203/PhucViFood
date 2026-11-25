import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CommissionStatusCodec, ConfirmSourceCodec, EventTypes, type EventEnvelope, type OrderPlacedPayload, type OrderStatusChangedPayload,
} from '@phucvi/shared-library/contracts';
import { InboxService } from '@phucvi/shared-library/messaging';
import { calculateCommission, uuidv7 } from '@phucvi/shared-library/utils';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionNotifier } from './commission-notifier';

const CONSUMER = 'commission-order-events';

/**
 * Tạo và cập nhật hoa hồng theo sự kiện đơn hàng:
 * - ordering.order.placed        -> ESTIMATED (chỉ khi đơn gắn CTV hợp lệ, không phải tự mua)
 * - status_changed COMPLETED     -> CONFIRMED (khách xác nhận nhận hàng, hoặc admin chuyển sau khi CSKH xử lý)
 * - status_changed CANCELLED/RETURNED -> CANCELLED
 * Xử lý idempotent: sự kiện gửi lặp không tạo trùng hay đổi trạng thái hai lần (inbox + order_id UNIQUE).
 */
@Injectable()
export class CommissionEventsService {
  private readonly logger = new Logger('CommissionEvents');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(CommissionNotifier) private readonly notifier: CommissionNotifier,
  ) {}

  async handle(event: EventEnvelope): Promise<void> {
    if (event.type === EventTypes.ORDER_PLACED) {
      await this.once(event, (tx) => this.onOrderPlaced(tx, event.payload as OrderPlacedPayload));
    } else if (event.type === EventTypes.ORDER_STATUS_CHANGED) {
      await this.once(event, (tx) => this.onStatusChanged(tx, event.payload as OrderStatusChangedPayload));
    }
    // Các sự kiện khác không liên quan hoa hồng.
  }

  private once(event: EventEnvelope, fn: (tx: Prisma.TransactionClient) => Promise<void>) {
    return this.prisma.$transaction((tx) => this.inbox.processOnce('commission', tx, event.id, CONSUMER, () => fn(tx)));
  }

  private async onOrderPlaced(tx: Prisma.TransactionClient, p: OrderPlacedPayload): Promise<void> {
    if (!p.affiliateId || p.isSelfPurchase || p.commissionRateBps === null) return; // vãng lai hoặc tự mua: không hoa hồng

    const affiliate = await tx.affiliate.findUnique({ where: { id: p.affiliateId }, select: { id: true } });
    if (!affiliate) {
      this.logger.warn(`Đơn ${p.code} gắn CTV ${p.affiliateId} không tồn tại; bỏ qua hoa hồng`);
      return;
    }

    const id = uuidv7();
    const amount = calculateCommission(p.subtotalAmount, p.commissionRateBps); // trên giá sản phẩm, không gồm ship
    const created = await tx.commission.createMany({
      data: [{
        id, orderId: p.orderId, orderCode: p.code, affiliateId: p.affiliateId, linkId: p.linkId, channelCode: p.channelCode,
        rateBps: p.commissionRateBps, baseAmount: BigInt(p.subtotalAmount), amount: BigInt(amount),
        status: CommissionStatusCodec.toCode('ESTIMATED'),
      }],
      skipDuplicates: true, // order_id UNIQUE: đơn đã có hoa hồng thì không tạo lại
    });
    if (created.count === 1) {
      await this.notifier.emit(tx, { id, orderId: p.orderId, affiliateId: p.affiliateId, amount: BigInt(amount) }, null, 'ESTIMATED');
    }
  }

  private async onStatusChanged(tx: Prisma.TransactionClient, p: OrderStatusChangedPayload): Promise<void> {
    const commission = await tx.commission.findUnique({ where: { orderId: p.orderId } });
    if (!commission) return; // đơn vãng lai hoặc tự mua
    const from = CommissionStatusCodec.toName(commission.status);
    const at = new Date(p.at);

    if (p.toStatus === 'COMPLETED' && from === 'ESTIMATED') {
      await this.move(tx, commission, from, 'CONFIRMED', {
        confirmedAt: at, confirmedBy: ConfirmSourceCodec.toCode(p.receivedBy ?? 'CUSTOMER'),
      });
    } else if (p.toStatus === 'CANCELLED' || p.toStatus === 'RETURNED') {
      if (from === 'ESTIMATED' || from === 'CONFIRMED') {
        await this.move(tx, commission, from, 'CANCELLED', {
          cancelledAt: at, cancelReason: p.toStatus === 'CANCELLED' ? 'Đơn bị hủy' : 'Đơn bị hoàn',
        });
      } else if (from === 'PAID') {
        // Đã chi trả rồi mới hoàn: không tự đổi trạng thái, admin xử lý tay (quy tắc demo).
        this.logger.warn(`Đơn ${p.code} bị ${p.toStatus} nhưng hoa hồng ${commission.id} đã PAID: cần xử lý tay`);
      }
    }
  }

  private async move(
    tx: Prisma.TransactionClient,
    c: { id: string; orderId: string; affiliateId: string; amount: bigint; status: number },
    from: 'ESTIMATED' | 'CONFIRMED',
    to: 'CONFIRMED' | 'CANCELLED',
    data: Prisma.CommissionUpdateManyMutationInput,
  ): Promise<void> {
    const claimed = await tx.commission.updateMany({ where: { id: c.id, status: c.status }, data: { ...data, status: CommissionStatusCodec.toCode(to) } });
    if (claimed.count === 1) await this.notifier.emit(tx, c, from, to);
  }
}
