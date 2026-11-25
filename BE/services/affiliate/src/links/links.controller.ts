import { Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { CreateLinkDto, UpdateLinkDto } from './dto';
import { LinksService } from './links.service';

@Roles('AFFILIATE')
@Controller('me/links')
export class LinksController {
  constructor(@Inject(LinksService) private readonly links: LinksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.links.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @ValidBody(CreateLinkDto) dto: CreateLinkDto) {
    return this.links.create(user.id, dto);
  }

  @Patch(':id') @ParamTypes(Object, String, Object)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @ValidBody(UpdateLinkDto) dto: UpdateLinkDto) {
    return this.links.update(user.id, id, dto);
  }
}
