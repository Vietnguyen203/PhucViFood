import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { IsVnPhone, trim } from '../common/validators';

/** Ordering gọi lúc đặt hàng: tìm hoặc tạo khách theo SĐT. */
export class UpsertCustomerDto {
  @IsString() @IsVnPhone()
  phone!: string;

  @Transform(trim) @IsString() @Length(2, 100)
  fullName!: string;

  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254)
  email?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  province?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  ward?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  addressLine?: string;

  /** Khách tick đồng ý nhận tư vấn. Chỉ có tác dụng bật; không tick thì giữ nguyên trạng thái hiện có. */
  @IsOptional() @IsBoolean()
  marketingConsent?: boolean;

  /** Nguồn đầu tiên; chỉ dùng khi tạo khách mới, không bao giờ ghi đè. */
  @IsOptional() @IsUUID()
  firstAffiliateId?: string | null;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  firstChannelCode?: string | null;
}

/** Admin sửa thông tin liên hệ. Không sửa SĐT (khóa định danh khách), nguồn đầu tiên hay trạng thái đồng ý. */
export class UpdateCustomerDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 100)
  fullName?: string;

  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254)
  email?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  province?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  ward?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  addressLine?: string;
}

export class ConsentDto {
  @IsBoolean()
  consent!: boolean;
}

export class UpdateSettingDto {
  @IsInt() @Min(0) @Max(100_000_000_000)
  value!: number;
}
