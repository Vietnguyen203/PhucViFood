import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { IsSlug, trim, trimLower } from '../common/validators';

export class CreateCategoryDto {
  @Transform(trim) @IsString() @Length(1, 100)
  name!: string;

  /** Bỏ trống thì tự sinh từ tên (không dấu). */
  @IsOptional() @Transform(trimLower) @IsString() @IsSlug()
  slug?: string;

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

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
