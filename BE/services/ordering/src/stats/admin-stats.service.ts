import { Inject, Injectable } from '@nestjs/common';
import { OrderStatusCodec, PaymentStatusCodec } from '@phucvi/shared-library/contracts';
import { ORDER_STATUSES_EXCLUDED_FROM_STATS, toSafeNumber } from '@phucvi/shared-library/utils';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000; // Việt Nam UTC+7, không có giờ mùa hè
/** Số ngày trong biểu đồ doanh thu theo ngày. */
export const DAILY_DAYS = 14;

/** 00:00 giờ Việt Nam của ngày chứa `now`, trả về dưới dạng thời điểm UTC. */
export function startOfVnDay(now: Date): Date {
  return new Date(Math.floor((now.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS);
}

/** Ngày (yyyy-mm-dd, giờ Việt Nam) của một thời điểm. */
export function vnDateKey(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

interface Window { orders: number; revenue: number }

/**
 * Số liệu tổng quan cho admin. "Doanh thu" = tổng tiền (gồm phí ship) các đơn hợp lệ, tức không ở trạng thái CANCELLED hoặc RETURNED
 * (cùng định nghĩa với phân loại khách), tính theo ngày đặt, ngày theo giờ Việt Nam.
 */
@Injectable()
export class AdminStatsService {
  private readonly excluded = ORDER_STATUSES_EXCLUDED_FROM_STATS.map((s) => OrderStatusCodec.toCode(s));

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async window(from: Date): Promise<Window> {
    const a = await this.prisma.order.aggregate({
      where: { placedAt: { gte: from }, status: { notIn: this.excluded } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    return { orders: a._count._all, revenue: toSafeNumber(a._sum.totalAmount ?? 0n) };
  }

  async overview(now = new Date()) {
    const today = startOfVnDay(now);
    const dailyFrom = new Date(today.getTime() - (DAILY_DAYS - 1) * DAY_MS);

    const [groups, awaitingPayment, todayW, w7, w30, rows] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.count({
        where: {
          paymentStatus: PaymentStatusCodec.toCode('UNPAID'),
          status: { in: [OrderStatusCodec.toCode('PLACED'), OrderStatusCodec.toCode('CONFIRMED')] },
        },
      }),
      this.window(today),
      this.window(new Date(today.getTime() - 6 * DAY_MS)),
      this.window(new Date(today.getTime() - 29 * DAY_MS)),
      this.prisma.$queryRawUnsafe<Array<{ day: Date; orders: bigint; revenue: bigint }>>(
        `SELECT (placed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) AS orders, COALESCE(sum(total_amount), 0)::bigint AS revenue
           FROM ordering.orders
          WHERE placed_at >= $1 AND status <> ALL($2::smallint[])
          GROUP BY 1`,
        dailyFrom, this.excluded,
      ),
    ]);

    const byStatus = Object.fromEntries(OrderStatusCodec.names.map((n) => [n, 0])) as Record<string, number>;
    for (const g of groups) byStatus[OrderStatusCodec.toName(g.status)] = g._count._all;

    // Điền đủ DAILY_DAYS ngày (ngày không có đơn là 0) để biểu đồ liền mạch.
    const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), { orders: Number(r.orders), revenue: toSafeNumber(r.revenue) }]));
    const daily = Array.from({ length: DAILY_DAYS }, (_, i) => {
      const date = vnDateKey(new Date(dailyFrom.getTime() + i * DAY_MS));
      return { date, ...(byDay.get(date) ?? { orders: 0, revenue: 0 }) };
    });

    return {
      byStatus,
      /** Đơn chuyển khoản chưa thanh toán đang giữ hàng (PLACED hoặc CONFIRMED). */
      awaitingPayment,
      /** Đơn đã giao chờ CSKH xác nhận hoàn tất. */
      cskhWaiting: byStatus.DELIVERED ?? 0,
      today: todayW,
      last7Days: w7,
      last30Days: w30,
      daily,
    };
  }
}
