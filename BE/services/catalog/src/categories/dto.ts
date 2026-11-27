import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { IsImageRef, IsSlug, trim, trimLower } from '../common/validators';

export class CreateCategoryDto {
  @Transform(trim) @IsString() @Length(1, 100)
  name!: string;

  /** Bỏ trống thì tự sinh từ tên (không dấu). */
  @IsOptional() @Transform(trimLower) @IsString() @IsSlug()
  slug?: string;

  /** Ảnh đại diện (link http(s) hoặc ảnh đã tải lên); null hoặc bỏ trống = không có ảnh. */
  @IsOptional() @IsImageRef()
  imageUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100)
  name?: string;

  @IsOptional() @Transform(trimLower) @IsString() @IsSlug()
  slug?: string;

  /** Ảnh đại diện (link http(s) hoặc ảnh đã tải lên); null hoặc bỏ trống = không có ảnh. */
  @IsOptional() @IsImageRef()
  imageUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
