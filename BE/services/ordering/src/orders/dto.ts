import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { ContactChannelCodec, PaymentMethodCodec } from '@phucvi/shared-library/contracts';
import { IsVnPhone, trim, trimLower } from '../common/validators';

export class OrderItemInputDto {
  @IsUUID()
  productId!: string;

  @IsInt() @Min(1) @Max(1000)
  quantity!: number;
}

export class CustomerInfoDto {
  @Transform(trim) @IsString() @Length(2, 100)
  fullName!: string;

  @IsString() @IsVnPhone()
  phone!: string;

  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254)
  email?: string;

  @Transform(trim) @IsString() @Length(1, 100)
  province!: string;

  @Transform(trim) @IsString() @Length(1, 100)
  ward!: string;

  @Transform(trim) @IsString() @Length(1, 255)
  addressLine!: string;

  /** Khách đồng ý nhận tư vấn ở bước thanh toán (mặc định không). */
  @IsOptional() @IsBoolean()
  marketingConsent?: boolean;
}

/** Cookie ghi nhận link CTV, đúng như API click của affiliate trả về. */
export class ReferralCookieDto {
  @Transform(trimLower) @IsString() @MaxLength(32)
  code!: string;

  @IsOptional() @IsString() @MaxLength(50)
  channelCode?: string;

  @IsISO8601()
  clickedAt!: string;

  @IsOptional() @IsInt() @Min(1) @Max(3650)
  maxAgeDays?: number;
}

/** Khách vãng lai đặt hàng: không cần tài khoản. Giá và tên sản phẩm lấy từ catalog, không nhận từ client. */
export class PlaceOrderDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @ValidateNested() @Type(() => CustomerInfoDto)
  customer!: CustomerInfoDto;

  @IsIn(PaymentMethodCodec.names as string[])
  paymentMethod!: string;

  /** Mã CTV khách tự nhập ở thanh toán (ưu tiên hơn cookie). */
  @IsOptional() @Transform(trimLower) @IsString() @MaxLength(32)
  referralCode?: string;

  @IsOptional() @ValidateNested() @Type(() => ReferralCookieDto)
  cookie?: ReferralCookieDto;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  note?: string;
}

/** Khách xác minh bằng SĐT đã dùng khi đặt hàng. */
export class PhoneDto {
  @IsString() @IsVnPhone()
  phone!: string;
}

export class CustomerCancelDto {
  @IsString() @IsVnPhone()
  phone!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  reason?: string;
}

export class AdminReasonDto {
  @Transform(trim) @IsString() @Length(3, 255)
  reason!: string;
}

export class PaymentDto {
  @IsIn(['PAID', 'REFUNDED'])
  status!: 'PAID' | 'REFUNDED';

  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  note?: string;
}

export class CareNoteDto {
  @Transform(trim) @IsString() @Length(1, 1000)
  note!: string;

  @IsOptional() @IsIn(ContactChannelCodec.names as string[])
  contactChannel?: string;
}
