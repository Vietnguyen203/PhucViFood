import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { BannerSlot } from '@phucvi/shared-library/contracts';
import { IsBannerLink, IsImageRef, trim } from '../common/validators';

const SLOTS = Object.values(BannerSlot);

export class CreateBannerDto {
  @Transform(trim) @IsString() @Length(1, 100)
  title!: string;

  @IsImageRef()
  imageUrl!: string;

  /** Trang đích khi bấm; bỏ trống thì banner không bấm được. */
  @IsOptional() @IsBannerLink()
  linkUrl?: string | null;

  @IsIn(SLOTS)
  slot!: BannerSlot;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  /** Bắt đầu hiển thị (ISO 8601); bỏ trống là hiện ngay. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  startsAt?: string | null;

  /** Ngừng hiển thị (ISO 8601); bỏ trống là không hết hạn. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  endsAt?: string | null;
}

export class UpdateBannerDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100)
  title?: string;

  @IsOptional() @IsImageRef()
  imageUrl?: string;

  /** null để gỡ liên kết. */
  @IsOptional() @IsBannerLink()
  linkUrl?: string | null;

  @IsOptional() @IsIn(SLOTS)
  slot?: BannerSlot;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  startsAt?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  endsAt?: string | null;
}
