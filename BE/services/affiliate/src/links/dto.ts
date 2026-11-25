import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { IsChannelCode, trim, trimLower } from '../common/validators';

export class CreateLinkDto {
  @Transform(trimLower) @IsString() @IsChannelCode()
  channelCode!: string;

  @Transform(trim) @IsString() @Length(1, 100)
  label!: string;
}

export class UpdateLinkDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100)
  label?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
