import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CreatorKind } from '@phucvi/shared-library/contracts';
import { IsBannerLink, IsImageRef, trim } from '../common/validators';

const KINDS = Object.values(CreatorKind);

export class CreateCreatorDto {
  @Transform(trim) @IsString() @Length(1, 60)
  name!: string;

  @IsIn(KINDS)
  kind!: CreatorKind;

  /** Câu giới thiệu hoặc cảm nhận ngắn (tối đa 160 ký tự). */
  @IsOptional() @Transform(trim) @IsString() @Length(0, 160)
  headline?: string | null;

  @IsImageRef()
  imageUrl!: string;

  /** Trang đích khi bấm (video, trang cá nhân, sản phẩm); bỏ trống thì thẻ chỉ để xem. */
  @IsOptional() @IsBannerLink()
  linkUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateCreatorDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 60)
  name?: string;

  @IsOptional() @IsIn(KINDS)
  kind?: CreatorKind;

  @IsOptional() @Transform(trim) @IsString() @Length(0, 160)
  headline?: string | null;

  @IsOptional() @IsImageRef()
  imageUrl?: string;

  @IsOptional() @IsBannerLink()
  linkUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
