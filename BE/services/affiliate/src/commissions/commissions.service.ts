import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { CommissionStatusCodec, ConfirmSourceCodec, type CommissionStatus } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { toSafeNumber } from '@phucvi/shared-library/utils';
import type { Commission } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionNotifier } from './commission-notifier';

export const COMMISSIONS_SERVICE = Symbol('COMMISSIONS_SERVICE');

export const toCommissionView = (c: Commission) => ({
  id: c.id,
  orderId: c.orderId,
  orderCode: c.orderCode,
  affiliateId: c.affiliateId,
  linkId: c.linkId,
  channelCode: c.channelCode,
  /** Tỷ lệ chốt tại thời điểm đặt (bps). */
  rateBps: c.rateBps,
  /** Tổng giá sản phẩm, không gồm phí ship. */
  baseAmount: c.baseAmount,
  amount: c.amount,
  status: CommissionStatusCodec.toName(c.status),
  confirmedAt: c.confirmedAt,
  confirmedBy: ConfirmSourceCodec.toNameOrNull(c.confirmedBy),
  paidAt: c.paidAt,
  payoutId: c.payoutId,
  cancelledAt: c.cancelledAt,
  cancelReason: c.cancelReason,
  createdAt: c.createdAt,
});

@Injectable()
export class CommissionsService extends PrismaCrudService<Commission> {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CommissionNotifier) private readonly notifier: CommissionNotifier,
  ) {
    super(prisma.commission, {
      label: 'Hoa hồng',
      sortableFields: ['createdAt', 'amount', 'status', 'orderCode'],
      filterableFields: {
        status: { codec: CommissionStatusCodec }, affiliateId: 'uuid', orderCode: 'string', channelCode: 'string', createdAt: 'date',
      },
      searchableFields: ['orderCode'],
    });
  }

  protected override toResponse(c: Commission) {
    return toCommissionView(c);
  }

  /**
   * Admin chuyển ESTIMATED sang CONFIRMED sau khi CSKH xử lý (khách không tự xác nhận nhận hàng).
   * Không tự xác nhận theo ngày.
   */
  async confirmByAdmin(id: string) {
    const current = await this.findOrThrow(id);
    const from = CommissionStatusCodec.toName(current.status);
    if (from !== 'ESTIMATED') throw AppException.businessRule(`Chỉ xác nhận được hoa hồng đang ở trạng thái ESTIMATED (hiện là ${from})`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.commission.updateMany({
        where: { id, status: current.status },
        data: { status: CommissionStatusCodec.toCode('CONFIRMED'), confirmedAt: new Date(), confirmedBy: ConfirmSourceCodec.toCode('ADMIN') },
      });
      if (claimed.count === 0) throw AppException.conflict('Trạng thái hoa hồng vừa được thay đổi, vui lòng tải lại');
      const fresh = await tx.commission.findUniqueOrThrow({ where: { id } });
      await this.notifier.emit(tx, fresh, from, 'CONFIRMED');
      return fresh;
    });
    return toCommissionView(updated);
  }

  /** Tổng hợp theo trạng thái của một CTV. `payable` là phần đã xác nhận, chờ admin chi trả. */
  async summary(affiliateId: string) {
    const groups = await this.prisma.commission.groupBy({ by: ['status'], where: { affiliateId }, _count: { _all: true }, _sum: { amount: true } });
    const names: CommissionStatus[] = ['ESTIMATED', 'CONFIRMED', 'PAID', 'CANCELLED'];
    const byStatus = Object.fromEntries(names.map((n) => [n, { count: 0, amount: 0 }])) as Record<CommissionStatus, { count: number; amount: number }>;
    for (const g of groups) byStatus[CommissionStatusCodec.toName(g.status)] = { count: g._count._all, amount: toSafeNumber(g._sum.amount ?? 0n) };
    return { byStatus, payable: byStatus.CONFIRMED.amount };
  }
}
