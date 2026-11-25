import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsDateOnly, IsReferralCode, IsVnPhone, trim, trimLower } from '../common/validators';

/** CTV tự đăng ký hồ sơ sau khi có tài khoản (user service). Trạng thái ban đầu PENDING, chờ admin duyệt. */
export class CreateProfileDto {
  @Transform(trim) @IsString() @Length(2, 100)
  fullName!: string;

  @IsString() @IsVnPhone()
  phone!: string;

  @Transform(trimLower) @IsString() @IsReferralCode()
  referralCode!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  bankName?: string;

  @IsOptional() @Transform(trim) @IsString() @Matches(/^[0-9]{6,30}$/, { message: 'số tài khoản gồm 6-30 chữ số' })
  bankAccountNo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  bankAccountHolder?: string;
}

/** CTV chỉ sửa họ tên và thông tin nhận tiền; SĐT, mã giới thiệu, trạng thái do admin quản lý. */
export class UpdateProfileDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 100)
  fullName?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  bankName?: string;

  @IsOptional() @Transform(trim) @IsString() @Matches(/^[0-9]{6,30}$/, { message: 'số tài khoản gồm 6-30 chữ số' })
  bankAccountNo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  bankAccountHolder?: string;
}

export class ApproveDto {
  /** Ngày bắt đầu hợp đồng (YYYY-MM-DD), gồm cả ngày này. */
  @IsDateOnly()
  contractStart!: string;

  /** Ngày kết thúc (YYYY-MM-DD), gồm cả ngày này; bỏ trống = không giới hạn. */
  @IsOptional() @IsDateOnly()
  contractEnd?: string;

  /** Tỷ lệ hoa hồng (bps, 1000 = 10%); bỏ trống = giữ tỷ lệ hiện có (mặc định 10%). */
  @IsOptional() @IsInt() @Min(0) @Max(10_000)
  commissionRateBps?: number;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

/** Admin chỉnh hợp đồng, tỷ lệ, ghi chú (không đổi trạng thái; dùng các hành động approve/reject/suspend/reactivate). */
export class UpdateAffiliateAdminDto {
  @IsOptional() @IsInt() @Min(0) @Max(10_000)
  commissionRateBps?: number;

  @IsOptional() @IsDateOnly()
  contractStart?: string;

  @IsOptional() @IsDateOnly()
  contractEnd?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
