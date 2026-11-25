import { Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Public, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { TrackEventDto } from '../referral/dto';
import { TrackingService } from './tracking.service';

/** Web ghi tương tác của người xem đến từ link CTV. Công khai, chỉ để thống kê. */
@Public()
@Controller('public/tracking')
export class PublicTrackingController {
  constructor(@Inject(TrackingService) private readonly tracking: TrackingService) {}

  @Post('events') @HttpCode(200)
  record(@ValidBody(TrackEventDto) dto: TrackEventDto) {
    return this.tracking.recordEvent(dto);
  }
}

@Roles('AFFILIATE')
@Controller('me/stats')
export class StatsController {
  constructor(@Inject(TrackingService) private readonly tracking: TrackingService) {}

  @Get() @ParamTypes(Object, Object)
  stats(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.tracking.statsFor(user.id, query);
  }
}
