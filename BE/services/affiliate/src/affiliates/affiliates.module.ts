import { Module } from '@nestjs/common';
import { Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { AffiliateActionsController, AffiliateMeController } from './affiliates.controller';
import { AFFILIATES_SERVICE, AffiliatesService } from './affiliates.service';
import { UpdateAffiliateAdminDto } from './dto';
import { ReferralModule } from '../referral/referral.module';

// ADMIN: danh sách, chi tiết, chỉnh hợp đồng/tỷ lệ. Không tạo hay xóa qua đây (CTV tự đăng ký hồ sơ, không xóa cứng).
const AffiliatesAdminCrud = createCrudController({
  path: 'affiliates',
  service: AFFILIATES_SERVICE,
  createDto: UpdateAffiliateAdminDto,
  updateDto: UpdateAffiliateAdminDto,
  routes: { create: false, remove: false },
  decorators: [Roles('ADMIN')],
});

@Module({
  imports: [ReferralModule],
  controllers: [AffiliateMeController, AffiliateActionsController, AffiliatesAdminCrud as never],
  providers: [AffiliatesService, { provide: AFFILIATES_SERVICE, useExisting: AffiliatesService }],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
