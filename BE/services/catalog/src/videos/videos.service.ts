import { Inject, Injectable } from '@nestjs/common';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import type { Video } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVideoDto, UpdateVideoDto } from './dto';

export const VIDEOS_SERVICE = Symbol('VIDEOS_SERVICE');

export const toVideoView = (v: Video) => ({
  id: v.id, title: v.title, videoUrl: v.videoUrl, sortOrder: v.sortOrder, isActive: v.isActive, createdAt: v.createdAt,
});

/** Admin quản lý video YouTube ở trang chủ. Xóa là xóa hẳn. */
@Injectable()
export class VideosService extends PrismaCrudService<Video, CreateVideoDto, UpdateVideoDto> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.video, {
      label: 'video',
      sortableFields: ['sortOrder', 'createdAt', 'title'],
      defaultSort: 'sortOrder',
      filterableFields: { isActive: 'boolean' },
      searchableFields: ['title'],
    });
  }

  protected override toResponse(v: Video) {
    return toVideoView(v);
  }

  override async create(dto: CreateVideoDto) {
    return toVideoView(await this.prisma.video.create({
      data: { title: dto.title, videoUrl: dto.videoUrl, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
    }));
  }

  override async update(id: string, dto: UpdateVideoDto) {
    await this.findOrThrow(id);
    return toVideoView(await this.prisma.video.update({
      where: { id },
      data: { title: dto.title, videoUrl: dto.videoUrl, sortOrder: dto.sortOrder, isActive: dto.isActive },
    }));
  }

  /** Khách thấy: video đang bật, theo thứ tự rồi ngày tạo. Tối đa 6 video. */
  async listPublic() {
    const rows = await this.prisma.video.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: 6 });
    return rows.map((v) => ({ id: v.id, title: v.title, videoUrl: v.videoUrl }));
  }
}
