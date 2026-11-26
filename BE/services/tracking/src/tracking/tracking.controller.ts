import { Controller, Get, Headers, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Public, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { ClickDto, TrackEventDto } from './dto';
import { TrackingService } from './tracking.service';

/** Web ghi lượt bấm link CTV và tương tác của người xem. Công khai, chỉ để thống kê. */
@Public()
@Controller('public')
export class PublicTrackingController {
  constructor(@Inject(TrackingService) private readonly tracking: TrackingService) {}

  @Post('referrals/click') @HttpCode(200)
  click(@ValidBody(ClickDto) dto: ClickDto, @Headers('user-agent') userAgent?: string) {
    return this.tracking.recordClick(dto, userAgent);
  }

  @Post('tracking/events') @HttpCode(200)
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
