import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { slugify } from '@phucvi/shared-library/utils';
import type { Category } from '../../generated/client';
import { makeUniqueSlug } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto';

export const CATEGORIES_SERVICE = Symbol('CATEGORIES_SERVICE');

export const toCategoryView = (c: Category) => ({
  id: c.id, name: c.name, slug: c.slug, sortOrder: c.sortOrder, isActive: c.isActive, createdAt: c.createdAt,
});

const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';

@Injectable()
export class CategoriesService extends PrismaCrudService<Category, CreateCategoryDto, UpdateCategoryDto> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.category, {
      label: 'Danh mục',
      sortableFields: ['sortOrder', 'name', 'createdAt'],
      defaultSort: 'sortOrder',
      filterableFields: { isActive: 'boolean' },
      searchableFields: ['name', 'slug'],
      softDeleteField: 'deletedAt',
    });
  }

  protected override toResponse(c: Category) {
    return toCategoryView(c);
  }

  override async create(dto: CreateCategoryDto) {
    const slug = dto.slug ?? (await makeUniqueSlug(slugify(dto.name), 'danh-muc', async (s) => (await this.prisma.category.count({ where: { slug: s } })) > 0));
    try {
      return toCategoryView(await this.prisma.category.create({
        data: { name: dto.name, slug, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
      }));
    } catch (e) {
      if (isUnique(e)) throw AppException.conflict('Slug danh mục đã tồn tại');
      throw e;
    }
  }

  override async update(id: string, dto: UpdateCategoryDto) {
    await this.findOrThrow(id);
    try {
      return toCategoryView(await this.prisma.category.update({
        where: { id }, data: { name: dto.name, slug: dto.slug, sortOrder: dto.sortOrder, isActive: dto.isActive },
      }));
    } catch (e) {
      if (isUnique(e)) throw AppException.conflict('Slug danh mục đã tồn tại');
      throw e;
    }
  }

  /**
   * Chỉ xóa được danh mục không còn sản phẩm đang tồn tại. Sản phẩm đã xóa mềm không tính (admin đã xóa chúng rồi);
   * danh mục được xóa mềm để các sản phẩm đó vẫn tham chiếu hợp lệ.
   */
  override async remove(id: string) {
    await this.findOrThrow(id);
    const products = await this.prisma.product.count({ where: { categoryId: id, deletedAt: null } });
    if (products > 0) throw AppException.conflict(`Danh mục còn ${products} sản phẩm; hãy xóa hoặc chuyển sản phẩm sang danh mục khác, hoặc tắt danh mục (isActive=false)`);
    return super.remove(id);
  }
}
