import { Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AppException, ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { isUuid } from '@phucvi/shared-library/utils';
import { InternalKeyGuard, Public } from '@phucvi/shared-library/auth';
import { ReferralContextDto, ResolveAttributionDto } from './dto';
import { ReferralService } from './referral.service';

/** API công khai cho web bán hàng (không cần đăng nhập). Lượt bấm link giới thiệu do service tracking ghi (POST /public/referrals/click). */
@Public()
@Controller('public/referrals')
export class PublicReferralController {
  constructor(@Inject(ReferralService) private readonly referral: ReferralService) {}

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

/** API nội bộ cho service tracking: kiểm tra mã giới thiệu (cần header x-internal-key). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/referrals')
export class InternalReferralsController {
  constructor(@Inject(ReferralService) private readonly referral: ReferralService) {}

  @Post('context') @HttpCode(200)
  context(@ValidBody(ReferralContextDto) dto: ReferralContextDto) {
    return this.referral.referralContext(dto);
  }
}
