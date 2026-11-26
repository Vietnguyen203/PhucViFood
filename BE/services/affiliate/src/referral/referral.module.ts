import { Module } from '@nestjs/common';
import { INTERNAL_API_KEY, InternalKeyGuard } from '@phucvi/shared-library/auth';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { InternalAffiliatesController, InternalAttributionController, InternalReferralsController, PublicReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { SettingsService } from './settings.service';

@Module({
  controllers: [PublicReferralController, InternalAttributionController, InternalAffiliatesController, InternalReferralsController],
  providers: [
    ReferralService, SettingsService, InternalKeyGuard,
    { provide: INTERNAL_API_KEY, useFactory: (config: AppConfig) => config.internalApiKey, inject: [APP_CONFIG] },
  ],
  exports: [ReferralService, SettingsService],
})
export class ReferralModule {}
