import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AppException, ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { InternalKeyGuard, Public } from '@phucvi/shared-library/auth';
import { isUuid } from '@phucvi/shared-library/utils';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatsService } from './order-stats.service';

export class OrderStatsRequestDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true })
  customerIds!: string[];
}

/** API nội bộ cho service customer (cần header x-internal-key). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/customers')
export class CustomerStatsController {
  constructor(@Inject(OrderStatsService) private readonly stats: OrderStatsService) {}

  /** Thống kê đơn hợp lệ theo khách: số đơn, tổng chi, đơn gần nhất. Khách chưa có đơn không có trong kết quả. */
  @Post('order-stats') @HttpCode(200)
  async orderStats(@ValidBody(OrderStatsRequestDto) dto: OrderStatsRequestDto) {
    return { stats: await this.stats.statsFor([...new Set(dto.customerIds)]) };
  }

  @Get(':customerId/orders') @ParamTypes(String, Object)
  async recent(@Param('customerId') customerId: string, @Query('limit') limit?: string) {
    if (!isUuid(customerId)) throw AppException.validation([{ field: 'customerId', messages: ['customerId phải là UUID'] }]);
    const n = limit === undefined ? 10 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 50) throw AppException.validation([{ field: 'limit', messages: ['limit là số nguyên từ 1 đến 50'] }]);
    return this.stats.recentOrders(customerId, n);
  }
}

export class OrderExistenceRequestDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true })
  orderIds!: string[];
}

/** API nội bộ cho service catalog (cần header x-internal-key). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/orders')
export class InternalOrdersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Trong các mã đơn đã cho, mã nào có đơn thật. Catalog dùng để phát hiện hàng đã giữ cho đơn không bao giờ được tạo
   * (ordering sập giữa lúc giữ hàng và lúc tạo đơn) rồi trả hàng về kho.
   */
  @Post('existence') @HttpCode(200)
  async existence(@ValidBody(OrderExistenceRequestDto) dto: OrderExistenceRequestDto) {
    const rows = await this.prisma.order.findMany({ where: { id: { in: [...new Set(dto.orderIds)] } }, select: { id: true } });
    return { existing: rows.map((r) => r.id) };
  }
}
