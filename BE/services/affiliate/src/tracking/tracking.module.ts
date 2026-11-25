import { Module } from '@nestjs/common';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { ReferralModule } from '../referral/referral.module';
import { PublicTrackingController, StatsController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [AffiliatesModule, ReferralModule],
  controllers: [PublicTrackingController, StatsController],
  providers: [TrackingService],
})
export class TrackingModule {}
