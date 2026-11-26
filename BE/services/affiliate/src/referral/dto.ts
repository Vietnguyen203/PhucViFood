import { Transform, Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsVnPhone, trimLower } from '../common/validators';

/** Tracking hỏi: mã (và kênh) này có dùng được không. */
export class ReferralContextDto {
  @Transform(trimLower) @IsString() @MaxLength(32)
  code!: string;

  @IsOptional() @Transform(trimLower) @IsString() @MaxLength(50)
  channel?: string;
}

export class CookieDto {
  @Transform(trimLower) @IsString() @MaxLength(32)
  code!: string;

  @IsOptional() @IsString() @MaxLength(50)
  channelCode?: string;

  @IsISO8601()
  clickedAt!: string;

  /** API click trả kèm trường này trong cookie; chấp nhận để chuyển nguyên cookie sang đây mà không phải bóc tách. */
  @IsOptional() @IsInt() @Min(1) @Max(3650)
  maxAgeDays?: number;
}

/** Ordering hỏi: đơn này gắn với CTV nào và có tính hoa hồng không. */
export class ResolveAttributionDto {
  /** Mã khách tự nhập ở thanh toán (ưu tiên hơn cookie). */
  @IsOptional() @Transform(trimLower) @IsString() @MaxLength(32)
  referralCode?: string;

  /** Nội dung cookie ghi nhận link CTV của khách. */
  @IsOptional() @ValidateNested() @Type(() => CookieDto)
  cookie?: CookieDto;

  @IsString() @IsVnPhone()
  customerPhone!: string;

  /** Thời điểm đặt hàng (ISO); hợp đồng CTV được kiểm tra theo NGÀY này. Mặc định: bây giờ. */
  @IsOptional() @IsISO8601()
  orderedAt?: string;
}
