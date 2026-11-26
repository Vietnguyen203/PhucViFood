import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { AdjustmentStatusCodec } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { toSafeNumber } from '@phucvi/shared-library/utils';
import type { Adjustment } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { WaiveAdjustmentDto } from './dto';

export const ADJUSTMENTS_SERVICE = Symbol('ADJUSTMENTS_SERVICE');

export const toAdjustmentView = (a: Adjustment) => ({
  id: a.id,
  commissionId: a.commissionId,
  orderId: a.orderId,
  orderCode: a.orderCode,
  affiliateId: a.affiliateId,
  /** Số tiền sẽ bị trừ (luôn dương): bằng hoa hồng đã chi cho đơn bị hoàn. */
  amount: a.amount,
  reason: a.reason,
  status: AdjustmentStatusCodec.toName(a.status),
  appliedPayoutId: a.appliedPayoutId,
  appliedAt: a.appliedAt,
  waivedAt: a.waivedAt,
  waivedBy: a.waivedBy,
  waiveReason: a.waiveReason,
  createdAt: a.createdAt,
});

/**
 * Khoản trừ vào hoa hồng của CTV khi đơn bị hoàn SAU KHI hoa hồng đã chi trả. Tiền đã chuyển nên không thu lại ngay;
 * khoản trừ được ghi nhận (PENDING) và tự trừ vào đợt chi kế tiếp (xem PayoutsService), hoặc admin miễn trừ (WAIVED).
 * Khoản trừ do consumer sự kiện đơn hàng tạo (xem CommissionEventsService), không có API tạo tay.
 */
@Injectable()
export class AdjustmentsService extends PrismaCrudService<Adjustment> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.adjustment, {
      label: 'Khoản trừ hoa hồng',
      sortableFields: ['createdAt', 'amount', 'status', 'orderCode'],
      filterableFields: { status: { codec: AdjustmentStatusCodec }, affiliateId: 'uuid', orderCode: 'string', createdAt: 'date' },
      searchableFields: ['orderCode'],
    });
  }

  protected override toResponse(a: Adjustment) {
    return toAdjustmentView(a);
  }

  /** Admin miễn trừ: công ty chịu khoản thiệt hại, CTV không bị trừ. Chỉ miễn được khoản đang chờ trừ. Cần ghi lý do. */
  async waive(id: string, adminId: string, dto: WaiveAdjustmentDto) {
    const current = await this.findOrThrow(id);
    const status = AdjustmentStatusCodec.toName(current.status);
    if (status !== 'PENDING') throw AppException.businessRule(`Chỉ miễn trừ được khoản đang chờ trừ (hiện là ${status})`);

    const claimed = await this.prisma.adjustment.updateMany({
      where: { id, status: current.status },
      data: { status: AdjustmentStatusCodec.toCode('WAIVED'), waivedAt: new Date(), waivedBy: adminId, waiveReason: dto.reason },
    });
    if (claimed.count === 0) throw AppException.conflict('Khoản trừ vừa được thay đổi (có thể vừa được trừ vào đợt chi), vui lòng tải lại');
    return toAdjustmentView(await this.prisma.adjustment.findUniqueOrThrow({ where: { id } }));
  }

  /** Tổng các khoản đang chờ trừ của một CTV. */
  async pending(affiliateId: string): Promise<{ count: number; amount: number }> {
    const r = await this.prisma.adjustment.aggregate({
      where: { affiliateId, status: AdjustmentStatusCodec.toCode('PENDING') }, _count: { _all: true }, _sum: { amount: true },
    });
    return { count: r._count._all, amount: toSafeNumber(r._sum.amount ?? 0n) };
  }
}
