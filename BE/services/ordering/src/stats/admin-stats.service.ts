import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { OrderStatusCodec, PaymentMethodCodec, PaymentStatusCodec } from '@phucvi/shared-library/contracts';
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

/** Số ngày tối đa của một báo cáo theo khoảng ngày. */
export const REPORT_MAX_DAYS = 366;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Kiểm tra chuỗi ngày yyyy-mm-dd hợp lệ thật (không nhận 2026-02-30). */
function parseDateKey(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw AppException.validation([{ field, messages: [`${field} phải là ngày dạng yyyy-mm-dd`] }]);
  }
  return value;
}

/** 00:00 giờ Việt Nam của một ngày yyyy-mm-dd. */
const vnDayStart = (key: string): Date => new Date(`${key}T00:00:00+07:00`);

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

  /**
   * Báo cáo theo khoảng ngày [from, to] (cả hai đầu, giờ Việt Nam, tối đa REPORT_MAX_DAYS ngày). Doanh thu cùng định nghĩa với tổng quan:
   * đơn hợp lệ (không CANCELLED, RETURNED) theo ngày đặt. `byStatus` đếm mọi đơn đặt trong khoảng, kể cả đơn hủy và hoàn.
   */
  async report(fromRaw: unknown, toRaw: unknown) {
    const from = parseDateKey(fromRaw, 'from');
    const to = parseDateKey(toRaw, 'to');
    const start = vnDayStart(from);
    const end = new Date(vnDayStart(to).getTime() + DAY_MS); // đầu ngày sau `to` (không gồm)
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (days < 1) throw AppException.validation([{ field: 'to', messages: ['to phải từ ngày from trở đi'] }]);
    if (days > REPORT_MAX_DAYS) throw AppException.validation([{ field: 'to', messages: [`Khoảng ngày tối đa ${REPORT_MAX_DAYS} ngày`] }]);

    const range = { placedAt: { gte: start, lt: end } };
    const valid = { ...range, status: { notIn: this.excluded } };
    const [totals, viaAffiliate, statusGroups, paymentGroups, dailyRows, topRows] = await Promise.all([
      this.prisma.order.aggregate({ where: valid, _count: { _all: true }, _sum: { totalAmount: true, shippingFee: true } }),
      this.prisma.order.aggregate({ where: { ...valid, affiliateId: { not: null } }, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.order.groupBy({ by: ['status'], where: range, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['paymentMethod'], where: valid, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.$queryRawUnsafe<Array<{ day: Date; orders: bigint; revenue: bigint }>>(
        `SELECT (placed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) AS orders, COALESCE(sum(total_amount), 0)::bigint AS revenue
           FROM ordering.orders
          WHERE placed_at >= $1 AND placed_at < $2 AND status <> ALL($3::smallint[])
          GROUP BY 1`,
        start, end, this.excluded,
      ),
      this.prisma.$queryRawUnsafe<Array<{ product_id: string; name: string; quantity: bigint; revenue: bigint }>>(
        `SELECT i.product_id, max(i.product_name) AS name, sum(i.quantity)::bigint AS quantity, COALESCE(sum(i.line_total), 0)::bigint AS revenue
           FROM ordering.order_items i JOIN ordering.orders o ON o.id = i.order_id
          WHERE o.placed_at >= $1 AND o.placed_at < $2 AND o.status <> ALL($3::smallint[])
          GROUP BY i.product_id
          ORDER BY revenue DESC, quantity DESC
          LIMIT 10`,
        start, end, this.excluded,
      ),
    ]);

    const orders = totals._count._all;
    const revenue = toSafeNumber(totals._sum.totalAmount ?? 0n);
    const byStatus = Object.fromEntries(OrderStatusCodec.names.map((n) => [n, 0])) as Record<string, number>;
    for (const g of statusGroups) byStatus[OrderStatusCodec.toName(g.status)] = g._count._all;

    const byDay = new Map(dailyRows.map((r) => [r.day.toISOString().slice(0, 10), { orders: Number(r.orders), revenue: toSafeNumber(r.revenue) }]));
    const daily = Array.from({ length: days }, (_, i) => {
      const date = vnDateKey(new Date(start.getTime() + i * DAY_MS));
      return { date, ...(byDay.get(date) ?? { orders: 0, revenue: 0 }) };
    });

    return {
      range: { from, to, days },
      totals: {
        orders,
        revenue,
        averageOrderValue: orders === 0 ? 0 : Math.round(revenue / orders),
        shippingRevenue: toSafeNumber(totals._sum.shippingFee ?? 0n),
        viaAffiliate: { orders: viaAffiliate._count._all, revenue: toSafeNumber(viaAffiliate._sum.totalAmount ?? 0n) },
      },
      byStatus,
      byPayment: paymentGroups.map((g) => ({ method: PaymentMethodCodec.toName(g.paymentMethod), orders: g._count._all, revenue: toSafeNumber(g._sum.totalAmount ?? 0n) })),
      daily,
      topProducts: topRows.map((r) => ({ productId: r.product_id, name: r.name, quantity: Number(r.quantity), revenue: toSafeNumber(r.revenue) })),
    };
  }
}
