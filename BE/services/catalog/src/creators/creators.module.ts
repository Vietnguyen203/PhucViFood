import { Controller, Get, Inject, Module } from '@nestjs/common';
import { Public, Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { CREATORS_SERVICE, CreatorsService } from './creators.service';
import { CreateCreatorDto, UpdateCreatorDto } from './dto';

/** Khách xem KOL/KOC ở trang chủ (không cần đăng nhập). */
@Public()
@Controller('public/creators')
class PublicCreatorsController {
  constructor(@Inject(CreatorsService) private readonly creators: CreatorsService) {}

  @Get()
  list() {
    return this.creators.listPublic();
  }
}

// ADMIN: CRUD KOL/KOC.
const CreatorsAdminCrud = createCrudController({
  path: 'creators', service: CREATORS_SERVICE, createDto: CreateCreatorDto, updateDto: UpdateCreatorDto, decorators: [Roles('ADMIN')],
});

@Module({
  controllers: [PublicCreatorsController, CreatorsAdminCrud as never],
  providers: [CreatorsService, { provide: CREATORS_SERVICE, useExisting: CreatorsService }],
})
export class CreatorsModule {}
