import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, InternalKeyGuard, Public, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { AdjustStockDto, ReleaseStockDto, ReserveStockDto } from './dto';
import { MovementsService, StockService } from './stock.service';

/** API nội bộ cho ordering (cần header x-internal-key). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/stock')
export class InternalStockController {
  constructor(@Inject(StockService) private readonly stock: StockService) {}

  /** Giữ hàng cho một đơn: trừ tồn, trả snapshot sản phẩm. Gọi lại cùng orderId thì trả bản phát lại, không trừ thêm. */
  @Post('reserve') @HttpCode(200)
  reserve(@ValidBody(ReserveStockDto) dto: ReserveStockDto) {
    return this.stock.reserve(dto);
  }

  /** Trả hàng (đơn hủy, hoặc bồi hoàn khi tạo đơn thất bại). Idempotent. */
  @Post('release') @HttpCode(200)
  release(@ValidBody(ReleaseStockDto) dto: ReleaseStockDto) {
    return this.stock.release(dto);
  }
}

/** Admin điều chỉnh tồn kho và xem sổ cái của sản phẩm. */
@Roles('ADMIN')
@Controller('products')
export class StockAdminController {
  constructor(
    @Inject(StockService) private readonly stock: StockService,
    @Inject(MovementsService) private readonly movements: MovementsService,
  ) {}

  @Post(':id/stock-adjustments') @HttpCode(201) @ParamTypes(Object, String, Object)
  adjust(@CurrentUser() admin: AuthUser, @Param('id') id: string, @ValidBody(AdjustStockDto) dto: AdjustStockDto) {
    return this.stock.adjust(id, admin.id, dto);
  }

  @Get(':id/stock-movements') @ParamTypes(String, Object)
  list(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.movements.list(query, { productId: id });
  }
}
