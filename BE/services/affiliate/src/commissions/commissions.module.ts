import { Module } from '@nestjs/common';
import { Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { CommissionConsumer } from './commission.consumer';
import { CommissionEventsService } from './commission-events.service';
import { CommissionNotifier } from './commission-notifier';
import { COMMISSIONS_SERVICE, CommissionsService } from './commissions.service';
import {
  CommissionsActionsController, CommissionsMeController, PayoutsActionsController, PayoutsMeController,
} from './commissions.controller';
import { CreatePayoutDto } from './dto';
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

@Module({
  imports: [AffiliatesModule],
  controllers: [
    CommissionsMeController, CommissionsActionsController, PayoutsMeController, PayoutsActionsController,
    CommissionsAdminCrud as never, PayoutsAdminCrud as never,
  ],
  providers: [
    CommissionNotifier, CommissionsService, PayoutsService, CommissionEventsService, CommissionConsumer,
    { provide: COMMISSIONS_SERVICE, useExisting: CommissionsService },
    { provide: PAYOUTS_SERVICE, useExisting: PayoutsService },
  ],
  exports: [CommissionsService, CommissionEventsService],
})
export class CommissionsModule {}
