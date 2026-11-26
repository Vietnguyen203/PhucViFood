import { Module } from '@nestjs/common';
import { AffiliateClient } from '../clients/affiliate.client';
import { PublicTrackingController, StatsController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  controllers: [PublicTrackingController, StatsController],
  providers: [TrackingService, AffiliateClient],
})
export class TrackingModule {}
