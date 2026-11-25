import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ParamTypes } from '@phucvi/shared-library/api';
import { Public } from '@phucvi/shared-library/auth';
import { PublicProductsService } from './products.service';

/** API công khai cho web bán hàng (không cần đăng nhập). */
@Public()
@Controller('public')
export class PublicCatalogController {
  constructor(@Inject(PublicProductsService) private readonly products: PublicProductsService) {}

  @Get('categories')
  categories() {
    return this.products.listCategories();
  }

  @Get('products') @ParamTypes(Object)
  list(@Query() query: Record<string, unknown>) {
    return this.products.list(query);
  }

  @Get('products/:slug') @ParamTypes(String)
  bySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }
}
