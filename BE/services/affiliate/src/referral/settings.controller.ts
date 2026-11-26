import { Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { IsDefined } from 'class-validator';
import { SettingsService } from './settings.service';

export class UpdateAffiliateSettingDto {
  /** Số nguyên trong giới hạn của từng khóa, kiểm tra ở service. */
  @IsDefined()
  value!: number;
}

/** Cấu hình chương trình CTV (hiện: số ngày cookie ghi nhận link). */
@Roles('ADMIN')
@Controller('affiliate-settings')
export class AffiliateSettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.listEditable();
  }

  @Patch(':key') @ParamTypes(Object, String, Object)
  update(@CurrentUser() admin: AuthUser, @Param('key') key: string, @ValidBody(UpdateAffiliateSettingDto) dto: UpdateAffiliateSettingDto) {
    return this.settings.update(key, dto.value, admin.id);
  }
}
