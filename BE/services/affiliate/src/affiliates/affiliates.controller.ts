import { Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { AffiliatesService } from './affiliates.service';
import { ApproveDto, CreateProfileDto, NoteDto, UpdateProfileDto } from './dto';

/** CTV tự quản lý hồ sơ của mình. */
@Roles('AFFILIATE')
@Controller('me/affiliate')
export class AffiliateMeController {
  constructor(@Inject(AffiliatesService) private readonly affiliates: AffiliatesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.affiliates.getMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @ValidBody(CreateProfileDto) dto: CreateProfileDto) {
    return this.affiliates.createProfile(user, dto);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @ValidBody(UpdateProfileDto) dto: UpdateProfileDto) {
    return this.affiliates.updateMine(user.id, dto);
  }
}

/** Admin duyệt và quản lý trạng thái CTV. Danh sách, chi tiết, chỉnh hợp đồng do CRUD tự sinh (xem module). */
@Roles('ADMIN')
@Controller('affiliates')
export class AffiliateActionsController {
  constructor(@Inject(AffiliatesService) private readonly affiliates: AffiliatesService) {}

  @Post(':id/approve') @HttpCode(200) @ParamTypes(String, Object)
  approve(@Param('id') id: string, @ValidBody(ApproveDto) dto: ApproveDto) {
    return this.affiliates.approve(id, dto);
  }

  @Post(':id/reject') @HttpCode(200) @ParamTypes(String, Object)
  reject(@Param('id') id: string, @ValidBody(NoteDto) dto: NoteDto) {
    return this.affiliates.reject(id, dto);
  }

  @Post(':id/suspend') @HttpCode(200) @ParamTypes(String, Object)
  suspend(@Param('id') id: string, @ValidBody(NoteDto) dto: NoteDto) {
    return this.affiliates.suspend(id, dto);
  }

  @Post(':id/reactivate') @HttpCode(200) @ParamTypes(String, Object)
  reactivate(@Param('id') id: string, @ValidBody(NoteDto) dto: NoteDto) {
    return this.affiliates.reactivate(id, dto);
  }
}
