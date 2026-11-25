import { Controller, Get, Headers, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { Public } from '@phucvi/shared-library/auth';
import { InternalKeyGuard } from '../common/internal-key.guard';
import { ClickDto, ResolveAttributionDto } from './dto';
import { ReferralService } from './referral.service';

/** API công khai cho web bán hàng (không cần đăng nhập). */
@Public()
@Controller('public/referrals')
export class PublicReferralController {
  constructor(@Inject(ReferralService) private readonly referral: ReferralService) {}

  @Post('click') @HttpCode(200)
  click(@ValidBody(ClickDto) dto: ClickDto, @Headers('user-agent') userAgent?: string) {
    return this.referral.recordClick(dto, userAgent);
  }

  /** Kiểm tra mã khách nhập ở thanh toán còn hiệu lực không. */
  @Get(':code') @ParamTypes(String)
  validate(@Param('code') code: string) {
    return this.referral.validate(code);
  }
}

/** API nội bộ cho service khác (cần header x-internal-key). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/attribution')
export class InternalAttributionController {
  constructor(@Inject(ReferralService) private readonly referral: ReferralService) {}

  @Post('resolve') @HttpCode(200)
  resolve(@ValidBody(ResolveAttributionDto) dto: ResolveAttributionDto) {
    return this.referral.resolveAttribution(dto);
  }
}
