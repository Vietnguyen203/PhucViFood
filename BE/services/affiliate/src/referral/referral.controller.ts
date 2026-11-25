import { Controller, Get, Headers, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AppException, ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { isUuid } from '@phucvi/shared-library/utils';
import { InternalKeyGuard, Public } from '@phucvi/shared-library/auth';
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

/** API nội bộ: tra CTV theo tài khoản đăng nhập (cần header x-internal-key). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/affiliates')
export class InternalAffiliatesController {
  constructor(@Inject(ReferralService) private readonly referral: ReferralService) {}

  @Get('by-user/:userId') @ParamTypes(String)
  async byUser(@Param('userId') userId: string) {
    if (!isUuid(userId)) throw AppException.validation([{ field: 'userId', messages: ['userId phải là UUID'] }]);
    const found = await this.referral.lookupByUser(userId);
    if (!found) throw AppException.notFound('Tài khoản này chưa có hồ sơ cộng tác viên');
    return found;
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
