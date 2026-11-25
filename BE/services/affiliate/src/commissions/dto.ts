import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { trim } from '../common/validators';

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
