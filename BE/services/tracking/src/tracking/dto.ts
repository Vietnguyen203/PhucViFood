import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TrackingEventTypeCodec } from '@phucvi/shared-library/contracts';
import { trimLower } from '../common/validators';

/** Người xem bấm link CTV /r/{mã}?c={kênh}; web gọi API này rồi lưu cookie theo kết quả trả về. */
export class ClickDto {
  @Transform(trimLower) @IsString() @MaxLength(32)
  code!: string;

  @IsOptional() @Transform(trimLower) @IsString() @MaxLength(50)
  channel?: string;

  /** Mã người xem lấy từ cookie; bỏ trống thì server cấp mới. */
  @IsOptional() @IsUUID()
  visitorId?: string;

  @IsString() @MaxLength(500)
  landingPath!: string;
}

export class TrackEventDto {
  @Transform(trimLower) @IsString() @MaxLength(32)
  code!: string;

  @IsUUID()
  visitorId!: string;

  @IsIn(TrackingEventTypeCodec.names as string[])
  type!: string;

  @IsOptional() @IsUUID()
  productId?: string;

  @IsOptional() @Transform(trimLower) @IsString() @MaxLength(50)
  channel?: string;
}
