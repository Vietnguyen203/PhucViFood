import { Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { IsDefined } from 'class-validator';
import { SettingsService } from './settings.service';

export class UpdateOrderSettingDto {
  /** Số nguyên (phí, số phút) hoặc chuỗi (thông tin tài khoản ngân hàng); kiểu đúng theo từng khóa, kiểm tra ở service. */
  @IsDefined()
  value!: number | string;
}

/** Cấu hình bán hàng: phí ship, hạn giữ hàng chuyển khoản, tài khoản nhận tiền. */
@Roles('ADMIN')
@Controller('order-settings')
export class OrderSettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.listEditable();
  }

  @Patch(':key') @ParamTypes(Object, String, Object)
  update(@CurrentUser() admin: AuthUser, @Param('key') key: string, @ValidBody(UpdateOrderSettingDto) dto: UpdateOrderSettingDto) {
    return this.settings.update(key, dto.value, admin.id);
  }
}
