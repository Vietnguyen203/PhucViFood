import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { trim } from '../common/validators';

/** Admin miễn trừ một khoản trừ: bắt buộc ghi lý do để đối soát. */
export class WaiveAdjustmentDto {
  @Transform(trim) @IsString() @Length(3, 255)
  reason!: string;
}

export class CreatePayoutDto {
  @IsUUID()
  affiliateId!: string;

  /** Chỉ chi các hoa hồng này; bỏ trống = tất cả hoa hồng đã xác nhận của CTV. */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true })
  commissionIds?: string[];

  /** Mã giao dịch ngân hàng. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  paymentReference?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
