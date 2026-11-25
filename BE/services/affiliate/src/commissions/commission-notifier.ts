import { Inject, Injectable } from '@nestjs/common';
import { EventTypes, type CommissionStatus } from '@phucvi/shared-library/contracts';
import { OutboxService } from '@phucvi/shared-library/messaging';
import { toSafeNumber } from '@phucvi/shared-library/utils';
import type { Commission, Prisma } from '../../generated/client';

/** Phát sự kiện commission.commission.status_changed vào outbox, trong transaction đang mở. */
@Injectable()
export class CommissionNotifier {
  constructor(@Inject(OutboxService) private readonly outbox: OutboxService) {}

  emit(tx: Prisma.TransactionClient, c: Pick<Commission, 'id' | 'orderId' | 'affiliateId' | 'amount'>, from: CommissionStatus | null, to: CommissionStatus) {
    return this.outbox.add('commission', tx, {
      type: EventTypes.COMMISSION_STATUS_CHANGED, aggregateType: 'Commission', aggregateId: c.id,
      payload: {
        commissionId: c.id, orderId: c.orderId, affiliateId: c.affiliateId, amount: toSafeNumber(c.amount),
        fromStatus: from, toStatus: to,
      },
    });
  }
}
