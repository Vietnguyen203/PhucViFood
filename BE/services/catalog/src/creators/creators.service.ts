import { Inject, Injectable } from '@nestjs/common';
import { CreatorKindCodec } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import type { Creator } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCreatorDto, UpdateCreatorDto } from './dto';

export const CREATORS_SERVICE = Symbol('CREATORS_SERVICE');

export const toCreatorView = (c: Creator) => ({
  id: c.id, name: c.name, kind: CreatorKindCodec.toName(c.kind), headline: c.headline, imageUrl: c.imageUrl, linkUrl: c.linkUrl,
  sortOrder: c.sortOrder, isActive: c.isActive, createdAt: c.createdAt,
});

/** Admin quản lý KOL/KOC hiển thị ở trang chủ. Xóa là xóa hẳn. */
@Injectable()
export class CreatorsService extends PrismaCrudService<Creator, CreateCreatorDto, UpdateCreatorDto> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.creator, {
      label: 'KOL/KOC',
      sortableFields: ['sortOrder', 'createdAt', 'name'],
      defaultSort: 'sortOrder',
      filterableFields: { kind: { codec: CreatorKindCodec }, isActive: 'boolean' },
      searchableFields: ['name', 'headline'],
    });
  }

  protected override toResponse(c: Creator) {
    return toCreatorView(c);
  }

  override async create(dto: CreateCreatorDto) {
    return toCreatorView(await this.prisma.creator.create({
      data: {
        name: dto.name, kind: CreatorKindCodec.toCode(dto.kind), headline: dto.headline || null, imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl || null, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true,
      },
    }));
  }

  override async update(id: string, dto: UpdateCreatorDto) {
    await this.findOrThrow(id);
    return toCreatorView(await this.prisma.creator.update({
      where: { id },
      data: {
        name: dto.name, imageUrl: dto.imageUrl, kind: dto.kind ? CreatorKindCodec.toCode(dto.kind) : undefined,
        headline: dto.headline === undefined ? undefined : dto.headline || null,
        linkUrl: dto.linkUrl === undefined ? undefined : dto.linkUrl || null,
        sortOrder: dto.sortOrder, isActive: dto.isActive,
      },
    }));
  }

  /** Khách thấy: các thẻ đang bật, theo thứ tự rồi ngày tạo. Tối đa 12 thẻ. */
  async listPublic() {
    const rows = await this.prisma.creator.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: 12 });
    return rows.map((c) => ({ id: c.id, name: c.name, kind: CreatorKindCodec.toName(c.kind), headline: c.headline, imageUrl: c.imageUrl, linkUrl: c.linkUrl }));
  }
}
