import { Controller, Get, Inject, Module } from '@nestjs/common';
import { Public, Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { BANNERS_SERVICE, BannersService } from './banners.service';
import { CreateBannerDto, UpdateBannerDto } from './dto';

/** Khách xem banner trang chủ (không cần đăng nhập). */
@Public()
@Controller('public/banners')
class PublicBannersController {
  constructor(@Inject(BannersService) private readonly banners: BannersService) {}

  @Get()
  list() {
    return this.banners.listPublic();
  }
}

// ADMIN: CRUD banner.
const BannersAdminCrud = createCrudController({
  path: 'banners', service: BANNERS_SERVICE, createDto: CreateBannerDto, updateDto: UpdateBannerDto, decorators: [Roles('ADMIN')],
});

@Module({
  controllers: [PublicBannersController, BannersAdminCrud as never],
  providers: [BannersService, { provide: BANNERS_SERVICE, useExisting: BannersService }],
})
export class BannersModule {}
