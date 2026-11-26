import { Module } from '@nestjs/common';
import { Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { ADJUSTMENTS_SERVICE, AdjustmentsService } from './adjustments.service';
import { CommissionConsumer } from './commission.consumer';
import { CommissionEventsService } from './commission-events.service';
import { CommissionNotifier } from './commission-notifier';
import { COMMISSIONS_SERVICE, CommissionsService } from './commissions.service';
import {
  AdjustmentsActionsController, AdjustmentsMeController, CommissionsActionsController, CommissionsMeController, PayoutsActionsController, PayoutsMeController,
} from './commissions.controller';
import { CreatePayoutDto, WaiveAdjustmentDto } from './dto';
import { PAYOUTS_SERVICE, PayoutsService } from './payouts.service';

// ADMIN: danh sách và chi tiết hoa hồng, đợt chi trả (chỉ đọc; thay đổi qua hành động riêng hoặc sự kiện).
const CommissionsAdminCrud = createCrudController({
  path: 'commissions', service: COMMISSIONS_SERVICE, createDto: CreatePayoutDto,
  routes: { create: false, update: false, remove: false }, decorators: [Roles('ADMIN')],
});
const PayoutsAdminCrud = createCrudController({
  path: 'payouts', service: PAYOUTS_SERVICE, createDto: CreatePayoutDto,
  routes: { create: false, update: false, remove: false }, decorators: [Roles('ADMIN')],
});

const AdjustmentsAdminCrud = createCrudController({
  path: 'adjustments', service: ADJUSTMENTS_SERVICE, createDto: WaiveAdjustmentDto,
  routes: { create: false, update: false, remove: false }, decorators: [Roles('ADMIN')],
});

@Module({
  imports: [AffiliatesModule],
  controllers: [
    CommissionsMeController, CommissionsActionsController, PayoutsMeController, PayoutsActionsController,
    AdjustmentsMeController, AdjustmentsActionsController,
    CommissionsAdminCrud as never, PayoutsAdminCrud as never, AdjustmentsAdminCrud as never,
  ],
  providers: [
    CommissionNotifier, CommissionsService, PayoutsService, AdjustmentsService, CommissionEventsService, CommissionConsumer,
    { provide: COMMISSIONS_SERVICE, useExisting: CommissionsService },
    { provide: PAYOUTS_SERVICE, useExisting: PayoutsService },
    { provide: ADJUSTMENTS_SERVICE, useExisting: AdjustmentsService },
  ],
  exports: [CommissionsService, CommissionEventsService],
})
export class CommissionsModule {}
