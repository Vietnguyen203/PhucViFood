import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { AdjustmentsService } from './adjustments.service';
import { CommissionsService } from './commissions.service';
import { CreatePayoutDto, WaiveAdjustmentDto } from './dto';
import { PayoutsService } from './payouts.service';

/** CTV xem hoa hồng của mình (không có SĐT/địa chỉ khách; chỉ có mã đơn). */
@Roles('AFFILIATE')
@Controller('me/commissions')
export class CommissionsMeController {
  constructor(
    @Inject(CommissionsService) private readonly commissions: CommissionsService,
    @Inject(AffiliatesService) private readonly affiliates: AffiliatesService,
  ) {}

  @Get() @ParamTypes(Object, Object)
  async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    const me = await this.affiliates.getMineOrThrow(user.id);
    return this.commissions.list(query, { affiliateId: me.id });
  }

  // Khai báo trước ':id' để 'summary' không bị hiểu là id.
  @Get('summary')
  async summary(@CurrentUser() user: AuthUser) {
    return this.commissions.summary((await this.affiliates.getMineOrThrow(user.id)).id);
  }

  @Get(':id') @ParamTypes(Object, String)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const me = await this.affiliates.getMineOrThrow(user.id);
    return this.commissions.findOne(id, { affiliateId: me.id });
  }
}

/** Admin xác nhận hoa hồng thủ công. Danh sách và chi tiết do CRUD tự sinh (xem module). */
@Roles('ADMIN')
@Controller('commissions')
export class CommissionsActionsController {
  constructor(@Inject(CommissionsService) private readonly commissions: CommissionsService) {}

  @Patch(':id/confirm') @ParamTypes(String)
  confirm(@Param('id') id: string) {
    return this.commissions.confirmByAdmin(id);
  }
}

@Roles('AFFILIATE')
@Controller('me/payouts')
export class PayoutsMeController {
  constructor(
    @Inject(PayoutsService) private readonly payouts: PayoutsService,
    @Inject(AffiliatesService) private readonly affiliates: AffiliatesService,
  ) {}

  @Get() @ParamTypes(Object, Object)
  async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    const me = await this.affiliates.getMineOrThrow(user.id);
    return this.payouts.list(query, { affiliateId: me.id });
  }

  @Get(':id') @ParamTypes(Object, String)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const me = await this.affiliates.getMineOrThrow(user.id);
    return this.payouts.findOne(id, { affiliateId: me.id });
  }
}

/** Admin chi trả. Danh sách và chi tiết do CRUD tự sinh (xem module). */
@Roles('ADMIN')
@Controller('payouts')
export class PayoutsActionsController {
  constructor(@Inject(PayoutsService) private readonly payouts: PayoutsService) {}

  @Post()
  create(@CurrentUser() admin: AuthUser, @ValidBody(CreatePayoutDto) dto: CreatePayoutDto) {
    return this.payouts.createPayout(admin.id, dto);
  }
}

/** CTV xem các khoản bị trừ vào hoa hồng của mình (đơn hoàn sau khi đã chi trả). */
@Roles('AFFILIATE')
@Controller('me/adjustments')
export class AdjustmentsMeController {
  constructor(
    @Inject(AdjustmentsService) private readonly adjustments: AdjustmentsService,
    @Inject(AffiliatesService) private readonly affiliates: AffiliatesService,
  ) {}

  @Get() @ParamTypes(Object, Object)
  async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    const me = await this.affiliates.getMineOrThrow(user.id);
    return this.adjustments.list(query, { affiliateId: me.id });
  }

  @Get(':id') @ParamTypes(Object, String)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const me = await this.affiliates.getMineOrThrow(user.id);
    return this.adjustments.findOne(id, { affiliateId: me.id });
  }
}

/** Admin miễn trừ khoản trừ. Danh sách và chi tiết do CRUD tự sinh (xem module). */
@Roles('ADMIN')
@Controller('adjustments')
export class AdjustmentsActionsController {
  constructor(@Inject(AdjustmentsService) private readonly adjustments: AdjustmentsService) {}

  @Post(':id/waive') @HttpCode(200) @ParamTypes(Object, String, Object)
  waive(@CurrentUser() admin: AuthUser, @Param('id') id: string, @ValidBody(WaiveAdjustmentDto) dto: WaiveAdjustmentDto) {
    return this.adjustments.waive(id, admin.id, dto);
  }
}
