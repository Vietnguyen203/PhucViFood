import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { IsImageRef, IsVideoUrl, trim } from '../common/validators';

export class CreateVideoDto {
  @Transform(trim) @IsString() @Length(1, 100)
  title!: string;

  /** Link video bất kỳ (YouTube, Vimeo, TikTok, Facebook, tệp .mp4...). */
  @Transform(trim) @IsVideoUrl()
  videoUrl!: string;

  /** Ảnh bìa tùy chọn (link http(s) hoặc ảnh đã tải lên). */
  @IsOptional() @IsImageRef()
  thumbnailUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateVideoDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100)
  title?: string;

  @IsOptional() @Transform(trim) @IsVideoUrl()
  videoUrl?: string;

  @IsOptional() @IsImageRef()
  thumbnailUrl?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
