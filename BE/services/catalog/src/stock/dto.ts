import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, IsUUID, Length, Max, Min, NotEquals, ValidateNested } from 'class-validator';
import { trim } from '../common/validators';

export class ReserveItemDto {
  @IsUUID()
  productId!: string;

  @IsInt() @Min(1) @Max(1000)
  quantity!: number;
}

/** Ordering giữ hàng cho một đơn trước khi tạo đơn. orderId do ordering sinh trước. */
export class ReserveStockDto {
  @IsUUID()
  orderId!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ReserveItemDto)
  items!: ReserveItemDto[];
}

export class ReleaseStockDto {
  @IsUUID()
  orderId!: string;
}

export class AdjustStockDto {
  /** Dương = nhập thêm, âm = giảm (kiểm kho, hỏng, mất). */
  @IsInt() @Min(-1_000_000) @Max(1_000_000) @NotEquals(0, { message: 'delta phải khác 0' })
  delta!: number;

  /** Bắt buộc ghi lý do để có thể đối soát sau này. */
  @Transform(trim) @IsString() @Length(3, 255)
  note!: string;
}
