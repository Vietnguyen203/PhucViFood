import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { StockMovementReasonCode } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { slugify } from '@phucvi/shared-library/utils';
import type { Category, Product } from '../../generated/client';
import { makeUniqueSlug } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto, UpdateProductDto } from './dto';

export const PRODUCTS_SERVICE = Symbol('PRODUCTS_SERVICE');
export const PUBLIC_PRODUCTS_SERVICE = Symbol('PUBLIC_PRODUCTS_SERVICE');

type ProductWithCategory = Product & { category?: Pick<Category, 'id' | 'name' | 'slug'> };

const categoryView = (c?: Pick<Category, 'id' | 'name' | 'slug'>) => (c ? { id: c.id, name: c.name, slug: c.slug } : undefined);

/** Phần trăm giảm so với giá gốc (làm tròn xuống), 0 nếu không giảm. */
export function discountPercent(price: bigint, originalPrice: bigint | null): number {
  if (originalPrice === null || originalPrice <= price || originalPrice === 0n) return 0;
  return Number(((originalPrice - price) * 100n) / originalPrice);
}

/** Dữ liệu cho admin: đủ mọi trường, gồm tồn kho chính xác. */
export const toAdminProductView = (p: ProductWithCategory) => ({
  id: p.id, categoryId: p.categoryId, category: categoryView(p.category),
  name: p.name, slug: p.slug, sku: p.sku, description: p.description, unit: p.unit,
  price: p.price, originalPrice: p.originalPrice, discountPercent: discountPercent(p.price, p.originalPrice),
  imageUrl: p.imageUrl, stockQuantity: p.stockQuantity, isVisible: p.isVisible,
  createdAt: p.createdAt, updatedAt: p.updatedAt,
});

/** Dữ liệu cho khách xem hàng: chỉ biết còn hàng hay không, không lộ số tồn kho. */
export const toPublicProductView = (p: ProductWithCategory) => ({
  id: p.id, name: p.name, slug: p.slug, sku: p.sku, description: p.description, unit: p.unit,
  price: p.price, originalPrice: p.originalPrice, discountPercent: discountPercent(p.price, p.originalPrice),
  imageUrl: p.imageUrl, inStock: p.stockQuantity > 0, category: categoryView(p.category),
});

const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';

function uniqueMessage(e: unknown): string {
  const target = JSON.stringify((e as { meta?: { target?: unknown } }).meta?.target ?? '');
  return target.includes('sku') ? 'SKU đã được dùng cho sản phẩm khác' : 'Slug sản phẩm đã tồn tại';
}

function assertPrices(price: number | bigint, originalPrice: number | bigint | null | undefined): void {
  if (originalPrice !== null && originalPrice !== undefined && BigInt(originalPrice) < BigInt(price)) {
    throw AppException.validation([{ field: 'originalPrice', messages: ['giá gốc phải từ giá bán trở lên'] }]);
  }
}

/** Quản trị sản phẩm (ADMIN). Xóa là xóa mềm vì đơn cũ vẫn tham chiếu product_id. */
@Injectable()
export class ProductsService extends PrismaCrudService<ProductWithCategory, CreateProductDto, UpdateProductDto> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.product, {
      label: 'Sản phẩm',
      sortableFields: ['createdAt', 'name', 'price', 'stockQuantity'],
      filterableFields: { categoryId: 'uuid', isVisible: 'boolean', price: 'bigint', stockQuantity: 'number', createdAt: 'date' },
      searchableFields: ['name', 'sku', 'slug'],
      softDeleteField: 'deletedAt',
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }

  protected override toResponse(p: ProductWithCategory) {
    return toAdminProductView(p);
  }

  private async assertCategory(categoryId: string): Promise<void> {
    if (!(await this.prisma.category.count({ where: { id: categoryId, deletedAt: null } }))) {
      throw AppException.validation([{ field: 'categoryId', messages: ['danh mục không tồn tại'] }]);
    }
  }

  override async create(dto: CreateProductDto) {
    await this.assertCategory(dto.categoryId);
    assertPrices(dto.price, dto.originalPrice);
    const slug = dto.slug ?? (await makeUniqueSlug(slugify(dto.name), 'san-pham', async (s) => (await this.prisma.product.count({ where: { slug: s } })) > 0));
    const stock = dto.stockQuantity ?? 0;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const p = await tx.product.create({
          data: {
            categoryId: dto.categoryId, name: dto.name, slug, sku: dto.sku, description: dto.description, unit: dto.unit,
            price: BigInt(dto.price), originalPrice: dto.originalPrice === undefined ? null : BigInt(dto.originalPrice),
            imageUrl: dto.imageUrl, stockQuantity: stock, isVisible: dto.isVisible ?? true,
          },
          include: this.config.include,
        });
        // Tồn đầu kỳ cũng ghi vào sổ cái để lịch sử tồn kho luôn đầy đủ.
        if (stock > 0) {
          await tx.stockMovement.create({ data: { productId: p.id, delta: stock, reason: StockMovementReasonCode.ADMIN_ADJUSTMENT, note: 'Tồn đầu kỳ' } });
        }
        return p;
      });
      return toAdminProductView(created as ProductWithCategory);
    } catch (e) {
      if (isUnique(e)) throw AppException.conflict(uniqueMessage(e));
      throw e;
    }
  }

  override async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOrThrow(id);
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    // Kiểm tra giá gốc theo giá mới (hoặc giá hiện có nếu không đổi).
    // originalPrice: null nghĩa là bỏ giá gốc (hết giảm giá); undefined là giữ nguyên.
    assertPrices(dto.price ?? current.price, dto.originalPrice === undefined ? current.originalPrice : dto.originalPrice);
    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId, name: dto.name, slug: dto.slug, sku: dto.sku, description: dto.description, unit: dto.unit,
          price: dto.price === undefined ? undefined : BigInt(dto.price),
          originalPrice: dto.originalPrice === undefined ? undefined : dto.originalPrice === null ? null : BigInt(dto.originalPrice),
          imageUrl: dto.imageUrl, isVisible: dto.isVisible,
        },
        include: this.config.include,
      });
      return toAdminProductView(updated as ProductWithCategory);
    } catch (e) {
      if (isUnique(e)) throw AppException.conflict(uniqueMessage(e));
      throw e;
    }
  }
}

/** Khách xem hàng: chỉ sản phẩm đang hiển thị, chưa xóa, thuộc danh mục đang bật. */
@Injectable()
export class PublicProductsService extends PrismaCrudService<ProductWithCategory> {
  private static readonly VISIBLE = { isVisible: true, category: { isActive: true } };

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.product, {
      label: 'Sản phẩm',
      sortableFields: ['createdAt', 'name', 'price'],
      filterableFields: { categoryId: 'uuid', price: 'bigint' },
      searchableFields: ['name', 'description'],
      softDeleteField: 'deletedAt',
      baseWhere: PublicProductsService.VISIBLE,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }

  protected override toResponse(p: ProductWithCategory) {
    return toPublicProductView(p);
  }

  async findBySlug(slug: string) {
    const p = await this.prisma.product.findFirst({
      where: { slug: slug.toLowerCase(), deletedAt: null, ...PublicProductsService.VISIBLE },
      include: this.config.include,
    });
    if (!p) throw AppException.notFound('Sản phẩm không tồn tại');
    return toPublicProductView(p as ProductWithCategory);
  }

  async listCategories() {
    const rows = await this.prisma.category.findMany({ where: { isActive: true, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
    return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  }
}
