import { Inject, Injectable } from '@nestjs/common';
import { AppException, parseVnDateRange } from '@phucvi/shared-library/api';
import { CommissionStatusCodec, ConfirmSourceCodec, type CommissionStatus } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { toSafeNumber } from '@phucvi/shared-library/utils';
import type { Commission } from '../../generated/client';
import { AdjustmentStatusCodec } from '@phucvi/shared-library/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionNotifier } from './commission-notifier';

export const COMMISSIONS_SERVICE = Symbol('COMMISSIONS_SERVICE');

type CommissionWithAdjustment = Commission & { adjustment?: { id: string; status: number; amount: bigint } | null };

export const toCommissionView = (c: CommissionWithAdjustment) => ({
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
  /** Khoản trừ phát sinh khi đơn bị hoàn sau lúc hoa hồng đã chi; null nếu không có. Chỉ có khi tải kèm. */
  ...(c.adjustment !== undefined ? { adjustment: c.adjustment ? { id: c.adjustment.id, status: AdjustmentStatusCodec.toName(c.adjustment.status), amount: c.adjustment.amount } : null } : {}),
});

@Injectable()
export class CommissionsService extends PrismaCrudService<CommissionWithAdjustment> {
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
      include: { adjustment: { select: { id: true, status: true, amount: true } } },
    });
  }

  protected override toResponse(c: CommissionWithAdjustment) {
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
    // Khoản trừ chờ sẽ được trừ vào đợt chi kế tiếp (đơn đã hoàn sau khi hoa hồng đã chi).
    const adj = await this.prisma.adjustment.aggregate({ where: { affiliateId, status: AdjustmentStatusCodec.toCode('PENDING') }, _count: { _all: true }, _sum: { amount: true } });
    return { byStatus, payable: byStatus.CONFIRMED.amount, pendingAdjustments: { count: adj._count._all, amount: toSafeNumber(adj._sum.amount ?? 0n) } };
  }

  /**
   * Báo cáo hoa hồng và chi trả theo khoảng ngày [from, to] (hai đầu đều tính, giờ Việt Nam, tối đa 366 ngày).
   * Hoa hồng tính theo ngày phát sinh (createdAt) và chia theo trạng thái hiện tại; chi trả tính theo ngày chi (paidAt).
   */
  async report(fromRaw: unknown, toRaw: unknown) {
    const { from, to, start, end, days } = parseVnDateRange(fromRaw, toRaw, 366);
    const created = { createdAt: { gte: start, lt: end } };
    const notCancelled = { ...created, status: { not: CommissionStatusCodec.toCode('CANCELLED') } };

    const [groups, payouts, topRows, registered, approved] = await Promise.all([
      this.prisma.commission.groupBy({ by: ['status'], where: created, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.payout.aggregate({ where: { paidAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { totalAmount: true, adjustmentAmount: true } }),
      this.prisma.commission.groupBy({ by: ['affiliateId'], where: notCancelled, _count: { _all: true }, _sum: { amount: true, baseAmount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 10 }),
      this.prisma.affiliate.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.affiliate.count({ where: { approvedAt: { gte: start, lt: end } } }),
    ]);

    const names: CommissionStatus[] = ['ESTIMATED', 'CONFIRMED', 'PAID', 'CANCELLED'];
    const byStatus = Object.fromEntries(names.map((n) => [n, { count: 0, amount: 0 }])) as Record<CommissionStatus, { count: number; amount: number }>;
    for (const g of groups) byStatus[CommissionStatusCodec.toName(g.status)] = { count: g._count._all, amount: toSafeNumber(g._sum.amount ?? 0n) };
    const valid = names.filter((n) => n !== 'CANCELLED');

    const owners = await this.prisma.affiliate.findMany({ where: { id: { in: topRows.map((t) => t.affiliateId) } }, select: { id: true, fullName: true, referralCode: true } });
    const byId = new Map(owners.map((o) => [o.id, o]));

    return {
      range: { from, to, days },
      commissions: {
        count: valid.reduce((n, k) => n + byStatus[k].count, 0),
        amount: valid.reduce((n, k) => n + byStatus[k].amount, 0),
        byStatus,
      },
      payouts: {
        count: payouts._count._all,
        /** Số tiền thực chuyển cho CTV (đã trừ khoản trừ). */
        paidAmount: toSafeNumber(payouts._sum.totalAmount ?? 0n),
        adjustmentAmount: toSafeNumber(payouts._sum.adjustmentAmount ?? 0n),
      },
      affiliates: { registered, approved },
      topAffiliates: topRows.map((t) => ({
        affiliateId: t.affiliateId,
        fullName: byId.get(t.affiliateId)?.fullName ?? null,
        referralCode: byId.get(t.affiliateId)?.referralCode ?? null,
        commissions: t._count._all,
        baseAmount: toSafeNumber(t._sum.baseAmount ?? 0n),
        amount: toSafeNumber(t._sum.amount ?? 0n),
      })),
    };
  }
}
