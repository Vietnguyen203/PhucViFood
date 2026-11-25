import { Inject, Injectable } from '@nestjs/common';
import { OrderStatusCodec } from '@phucvi/shared-library/contracts';
import { ORDER_STATUSES_EXCLUDED_FROM_STATS, toSafeNumber } from '@phucvi/shared-library/utils';
import { PrismaService } from '../prisma/prisma.service';

export interface CustomerOrderStat {
  customerId: string;
  validOrders: number;
  /** Tổng tiền các đơn hợp lệ (VND, gồm phí ship). */
  totalSpent: number;
  lastOrderAt: Date;
}

/**
 * Thống kê đơn theo khách cho service customer (phân loại khách tính khi truy vấn).
 * "Đơn hợp lệ" = đơn không ở trạng thái CANCELLED hoặc RETURNED.
 */
@Injectable()
export class OrderStatsService {
  private readonly excluded = ORDER_STATUSES_EXCLUDED_FROM_STATS.map((s) => OrderStatusCodec.toCode(s));

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Chỉ trả về khách có ít nhất một đơn hợp lệ; khách không có trong kết quả nghĩa là chưa có đơn. */
  async statsFor(customerIds: string[]): Promise<CustomerOrderStat[]> {
    const groups = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, status: { notIn: this.excluded } },
      _count: { _all: true },
      _sum: { totalAmount: true },
      _max: { placedAt: true },
    });
    return groups.map((g) => ({
      customerId: g.customerId,
      validOrders: g._count._all,
      totalSpent: toSafeNumber(g._sum.totalAmount ?? 0n),
      lastOrderAt: g._max.placedAt as Date,
    }));
  }

  /** Các đơn gần nhất của một khách (tóm tắt), mới nhất trước. */
  async recentOrders(customerId: string, limit: number) {
    const rows = await this.prisma.order.findMany({
      where: { customerId }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: limit,
    });
    return rows.map((o) => ({
      id: o.id, code: o.code, status: OrderStatusCodec.toName(o.status), totalAmount: toSafeNumber(o.totalAmount), placedAt: o.placedAt,
    }));
  }
}
