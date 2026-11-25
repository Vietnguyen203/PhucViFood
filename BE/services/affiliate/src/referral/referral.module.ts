import { Module } from '@nestjs/common';
import { InternalKeyGuard } from '../common/internal-key.guard';
import { InternalAttributionController, PublicReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { SettingsService } from './settings.service';

@Module({
  controllers: [PublicReferralController, InternalAttributionController],
  providers: [ReferralService, SettingsService, InternalKeyGuard],
  exports: [ReferralService, SettingsService],
})
export class ReferralModule {}
