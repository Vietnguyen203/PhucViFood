import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { IsYoutubeUrl, trim } from '../common/validators';

export class CreateVideoDto {
  @Transform(trim) @IsString() @Length(1, 100)
  title!: string;

  @Transform(trim) @IsYoutubeUrl()
  videoUrl!: string;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateVideoDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100)
  title?: string;

  @IsOptional() @Transform(trim) @IsYoutubeUrl()
  videoUrl?: string;

  @IsOptional() @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
