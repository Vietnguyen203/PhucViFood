import { Controller, Get, Inject, Module } from '@nestjs/common';
import { Public, Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { CreateVideoDto, UpdateVideoDto } from './dto';
import { VIDEOS_SERVICE, VideosService } from './videos.service';

/** Khách xem video ở trang chủ (không cần đăng nhập). */
@Public()
@Controller('public/videos')
class PublicVideosController {
  constructor(@Inject(VideosService) private readonly videos: VideosService) {}

  @Get()
  list() {
    return this.videos.listPublic();
  }
}

// ADMIN: CRUD video.
const VideosAdminCrud = createCrudController({
  path: 'videos', service: VIDEOS_SERVICE, createDto: CreateVideoDto, updateDto: UpdateVideoDto, decorators: [Roles('ADMIN')],
});

@Module({
  controllers: [PublicVideosController, VideosAdminCrud as never],
  providers: [VideosService, { provide: VIDEOS_SERVICE, useExisting: VideosService }],
})
export class VideosModule {}
