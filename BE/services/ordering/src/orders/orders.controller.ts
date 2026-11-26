import { Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { AppException, ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Public, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import type { Response } from 'express';
import { AffiliateClient, toClientError } from '../clients/clients';
import { IDEMPOTENCY_KEY_REGEX } from '../common/validators';
import { SettingsService } from '../settings/settings.service';
import { AdminStatsService } from '../stats/admin-stats.service';
import { AdminReasonDto, CareNoteDto, CustomerCancelDto, PaymentDto, PhoneDto, PlaceOrderDto } from './dto';
import { OrderPlacementService } from './order-placement.service';
import { AffiliateOrdersService, OrdersService } from './orders.service';
import { toPublicView } from './views';

/** API công khai cho khách (không cần tài khoản). */
@Public()
@Controller('public/orders')
export class PublicOrdersController {
  constructor(
    @Inject(OrderPlacementService) private readonly placement: OrderPlacementService,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /**
   * Đặt hàng. Header `Idempotency-Key` (8-100 ký tự chữ, số, . _ -) giúp bấm đúp hoặc thử lại không tạo đơn trùng:
   * cùng khóa thì trả lại đúng đơn cũ (HTTP 200, replayed=true).
   */
  @Post() @ParamTypes(Object, String, Object)
  async place(
    @ValidBody(PlaceOrderDto) dto: PlaceOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
      throw AppException.validation([{ field: 'Idempotency-Key', messages: ['gồm 8-100 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang'] }]);
    }
    const { order, replayed } = await this.placement.place(dto, idempotencyKey);
    res.status(replayed ? 200 : 201);
    return { ...toPublicView(order, await this.settings.bankAccount()), replayed };
  }

  /** Tra cứu đơn bằng mã đơn và SĐT đã dùng khi đặt hàng. */
  @Get(':code') @ParamTypes(String, String)
  track(@Param('code') code: string, @Query('phone') phone: string) {
    return this.orders.publicView(code, phone ?? '');
  }

  @Post(':code/confirm-received') @HttpCode(200) @ParamTypes(String, Object)
  confirmReceived(@Param('code') code: string, @ValidBody(PhoneDto) dto: PhoneDto) {
    return this.orders.confirmReceived(code, dto.phone);
  }

  @Post(':code/cancel') @HttpCode(200) @ParamTypes(String, Object)
  cancel(@Param('code') code: string, @ValidBody(CustomerCancelDto) dto: CustomerCancelDto) {
    return this.orders.cancelByCustomer(code, dto.phone, dto.reason);
  }
}

/** Quản trị đơn hàng (ADMIN). */
@Roles('ADMIN')
@Controller('orders')
export class AdminOrdersController {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(AdminStatsService) private readonly stats: AdminStatsService,
  ) {}

  /** Số liệu tổng quan: đơn theo trạng thái, doanh thu hôm nay/7/30 ngày, doanh thu 14 ngày gần nhất. Khai báo trước ':id'. */
  @Get('stats')
  overview() {
    return this.stats.overview();
  }

  /** Hàng chờ CSKH: đơn đã giao chưa hoàn tất, lâu nhất lên đầu. Khai báo trước ':id'. */
  @Get('cskh-queue') @ParamTypes(Object)
  cskhQueue(@Query() query: Record<string, unknown>) {
    return this.orders.cskhQueue(query);
  }

  @Get() @ParamTypes(Object)
  list(@Query() query: Record<string, unknown>) {
    return this.orders.list(query);
  }

  @Get(':id') @ParamTypes(String)
  detail(@Param('id') id: string) {
    return this.orders.getDetail(id);
  }

  @Post(':id/confirm') @HttpCode(200) @ParamTypes(Object, String)
  confirm(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.orders.adminTransition(id, 'CONFIRMED', admin.id);
  }

  @Post(':id/ship') @HttpCode(200) @ParamTypes(Object, String)
  ship(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.orders.adminTransition(id, 'SHIPPING', admin.id);
  }

  @Post(':id/deliver') @HttpCode(200) @ParamTypes(Object, String)
  deliver(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.orders.adminTransition(id, 'DELIVERED', admin.id);
  }

  /** Admin chuyển hoàn tất sau khi CSKH xử lý (khách không tự xác nhận). */
  @Post(':id/complete') @HttpCode(200) @ParamTypes(Object, String)
  complete(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.orders.adminTransition(id, 'COMPLETED', admin.id, { receivedBy: 'ADMIN' });
  }

  @Post(':id/cancel') @HttpCode(200) @ParamTypes(Object, String, Object)
  cancel(@CurrentUser() admin: AuthUser, @Param('id') id: string, @ValidBody(AdminReasonDto) dto: AdminReasonDto) {
    return this.orders.adminTransition(id, 'CANCELLED', admin.id, { reason: dto.reason });
  }

  @Post(':id/return') @HttpCode(200) @ParamTypes(Object, String, Object)
  returnOrder(@CurrentUser() admin: AuthUser, @Param('id') id: string, @ValidBody(AdminReasonDto) dto: AdminReasonDto) {
    return this.orders.adminTransition(id, 'RETURNED', admin.id, { reason: dto.reason });
  }

  @Post(':id/payment') @HttpCode(200) @ParamTypes(Object, String, Object)
  payment(@CurrentUser() admin: AuthUser, @Param('id') id: string, @ValidBody(PaymentDto) dto: PaymentDto) {
    return this.orders.setPayment(id, admin.id, dto);
  }

  @Post(':id/care-notes') @ParamTypes(Object, String, Object)
  careNote(@CurrentUser() admin: AuthUser, @Param('id') id: string, @ValidBody(CareNoteDto) dto: CareNoteDto) {
    return this.orders.addCareNote(id, admin.id, dto);
  }
}

/** CTV xem đơn do mình giới thiệu (khách chỉ hiện tên viết tắt). */
@Roles('AFFILIATE')
@Controller('me/orders')
export class AffiliateOrdersController {
  constructor(
    @Inject(AffiliateOrdersService) private readonly orders: AffiliateOrdersService,
    @Inject(AffiliateClient) private readonly affiliates: AffiliateClient,
  ) {}

  private async affiliateIdOf(user: AuthUser): Promise<string> {
    let found;
    try {
      found = await this.affiliates.lookupByUser(user.id);
    } catch (e) {
      throw toClientError(e, 'Không tra được hồ sơ cộng tác viên, vui lòng thử lại');
    }
    if (!found) throw AppException.notFound('Tài khoản chưa có hồ sơ cộng tác viên');
    return found.affiliateId;
  }

  @Get() @ParamTypes(Object, Object)
  async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.orders.list(query, { affiliateId: await this.affiliateIdOf(user) });
  }

  @Get(':id') @ParamTypes(Object, String)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.findOne(id, { affiliateId: await this.affiliateIdOf(user) });
  }
}
