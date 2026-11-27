import { Inject, Injectable } from '@nestjs/common';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import type { Shortcut } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateShortcutDto, UpdateShortcutDto } from './dto';

export const SHORTCUTS_SERVICE = Symbol('SHORTCUTS_SERVICE');

export const toShortcutView = (c: Shortcut) => ({
  id: c.id, title: c.title, imageUrl: c.imageUrl, linkUrl: c.linkUrl, sortOrder: c.sortOrder, isActive: c.isActive, createdAt: c.createdAt,
});

/** Admin quản lý các ô tròn lối tắt ở trang chủ. Xóa là xóa hẳn. */
@Injectable()
export class ShortcutsService extends PrismaCrudService<Shortcut, CreateShortcutDto, UpdateShortcutDto> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.shortcut, {
      label: 'ô lối tắt',
      sortableFields: ['sortOrder', 'createdAt', 'title'],
      defaultSort: 'sortOrder',
      filterableFields: { isActive: 'boolean' },
      searchableFields: ['title'],
    });
  }

  protected override toResponse(c: Shortcut) {
    return toShortcutView(c);
  }

  override async create(dto: CreateShortcutDto) {
    return toShortcutView(await this.prisma.shortcut.create({
      data: { title: dto.title, imageUrl: dto.imageUrl, linkUrl: dto.linkUrl || null, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
    }));
  }

  override async update(id: string, dto: UpdateShortcutDto) {
    await this.findOrThrow(id);
    return toShortcutView(await this.prisma.shortcut.update({
      where: { id },
      data: { title: dto.title, imageUrl: dto.imageUrl, linkUrl: dto.linkUrl === undefined ? undefined : dto.linkUrl || null, sortOrder: dto.sortOrder, isActive: dto.isActive },
    }));
  }

  /** Khách thấy: ô đang bật, theo thứ tự rồi ngày tạo. Tối đa 10 ô. */
  async listPublic() {
    const rows = await this.prisma.shortcut.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: 10 });
    return rows.map((c) => ({ id: c.id, title: c.title, imageUrl: c.imageUrl, linkUrl: c.linkUrl }));
  }
}
