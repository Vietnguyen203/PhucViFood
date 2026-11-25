import { Module } from '@nestjs/common';
import { Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { CATEGORIES_SERVICE, CategoriesService } from '../categories/categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../categories/dto';
import { CreateProductDto, UpdateProductDto } from './dto';
import { PublicCatalogController } from './products.controller';
import { PRODUCTS_SERVICE, ProductsService, PublicProductsService } from './products.service';

// ADMIN: CRUD danh mục (xóa chỉ khi danh mục trống) và sản phẩm (xóa mềm).
const CategoriesAdminCrud = createCrudController({
  path: 'categories', service: CATEGORIES_SERVICE, createDto: CreateCategoryDto, updateDto: UpdateCategoryDto, decorators: [Roles('ADMIN')],
});
const ProductsAdminCrud = createCrudController({
  path: 'products', service: PRODUCTS_SERVICE, createDto: CreateProductDto, updateDto: UpdateProductDto, decorators: [Roles('ADMIN')],
});

@Module({
  controllers: [PublicCatalogController, CategoriesAdminCrud as never, ProductsAdminCrud as never],
  providers: [
    CategoriesService, ProductsService, PublicProductsService,
    { provide: CATEGORIES_SERVICE, useExisting: CategoriesService },
    { provide: PRODUCTS_SERVICE, useExisting: ProductsService },
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
