import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { IsBannerLink, IsImageRef, trim } from '../common/validators';

export class CreateShortcutDto {
  @Transform(trim) @IsString() @Length(1, 40)
  title!: string;

  @IsImageRef()
  imageUrl!: string;

  /** Trang đích khi bấm (bài viết, danh mục, link ngoài); bỏ trống thì ô chỉ để xem. */
  @IsOptional() @IsBannerLink()
  linkUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateShortcutDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 40)
  title?: string;

  @IsOptional() @IsImageRef()
  imageUrl?: string;

  @IsOptional() @IsBannerLink()
  linkUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
