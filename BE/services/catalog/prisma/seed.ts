// Seed catalog_db: 4 danh mục, 8 sản phẩm. Chỉ dùng dev/demo.
import { CATEGORIES, PRODUCTS } from '@phucvi/shared-library/seed-data';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  // Xóa theo thứ tự phụ thuộc để chạy lại được nhiều lần.
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  await prisma.category.createMany({ data: CATEGORIES });
  await prisma.product.createMany({
    data: PRODUCTS.map((p) => ({
      id: p.id, categoryId: p.categoryId, name: p.name, slug: p.slug, sku: p.sku, unit: p.unit,
      price: BigInt(p.price), originalPrice: p.originalPrice ? BigInt(p.originalPrice) : null,
      stockQuantity: p.stock,
    })),
  });

  console.log(`catalog: ${CATEGORIES.length} danh mục, ${PRODUCTS.length} sản phẩm`);
}

main().finally(() => prisma.$disconnect());
