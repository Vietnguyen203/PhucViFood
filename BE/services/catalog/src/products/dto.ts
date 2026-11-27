import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsImageRef, IsSlug, trim, trimLower } from '../common/validators';

const MAX_PRICE = 1_000_000_000; // 1 tỷ VND cho một sản phẩm là đủ rộng và an toàn trong JSON
const SKU_RE = /^[A-Za-z0-9._-]{1,50}$/;

export class CreateProductDto {
  /** Tùy chọn: không gửi hoặc null nghĩa là sản phẩm không thuộc danh mục nào. */
  @IsOptional() @IsUUID()
  categoryId?: string | null;

  @Transform(trim) @IsString() @Length(1, 200)
  name!: string;

  /** Bỏ trống thì tự sinh từ tên (không dấu), thêm số nếu trùng. */
  @IsOptional() @Transform(trimLower) @IsString() @IsSlug()
  slug?: string;

  @IsOptional() @Transform(trim) @IsString() @Matches(SKU_RE, { message: 'SKU gồm 1-50 ký tự chữ, số, . _ -' })
  sku?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  /** Quy cách bán, vd "hộp 500g". */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  unit?: string;

  /** Giá bán (VND, số nguyên). */
  @IsInt() @Min(0) @Max(MAX_PRICE)
  price!: number;

  /** Giá gốc để hiện giảm giá; phải từ giá bán trở lên. */
  @IsOptional() @IsInt() @Min(0) @Max(MAX_PRICE)
  originalPrice?: number;

  @IsOptional() @IsImageRef()
  imageUrl?: string;

  /** Tồn đầu kỳ khi tạo. Sau đó chỉ đổi bằng điều chỉnh tồn kho hoặc theo đơn hàng. */
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000)
  stockQuantity?: number;

  @IsOptional() @IsBoolean()
  isVisible?: boolean;
}

/** Không có stockQuantity: tồn kho chỉ đổi qua sổ cái (điều chỉnh, giữ hàng, trả hàng). */
export class UpdateProductDto {
  /** null để bỏ sản phẩm khỏi danh mục; không gửi thì giữ nguyên. */
  @IsOptional() @IsUUID()
  categoryId?: string | null;

  @IsOptional() @Transform(trim) @IsString() @Length(1, 200)
  name?: string;

  @IsOptional() @Transform(trimLower) @IsString() @IsSlug()
  slug?: string;

  @IsOptional() @Transform(trim) @IsString() @Matches(SKU_RE, { message: 'SKU gồm 1-50 ký tự chữ, số, . _ -' })
  sku?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  unit?: string;

  @IsOptional() @IsInt() @Min(0) @Max(MAX_PRICE)
  price?: number;

  @IsOptional() @IsInt() @Min(0) @Max(MAX_PRICE)
  originalPrice?: number | null;

  @IsOptional() @IsImageRef()
  imageUrl?: string;

  @IsOptional() @IsBoolean()
  isVisible?: boolean;
}
