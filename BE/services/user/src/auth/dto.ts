import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from './password';

const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class RegisterDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @IsStrongPassword()
  password!: string;
}

/** Khách mua hàng đăng ký tài khoản (vai trò CUSTOMER cố định, không nhận role từ client). */
export class RegisterCustomerDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @IsStrongPassword()
  password!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString() @MinLength(2) @MaxLength(100)
  fullName!: string;
}

/** Cập nhật họ tên của chính mình. */
export class UpdateProfileDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString() @MinLength(2) @MaxLength(100)
  fullName!: string;
}

export class LoginDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email!: string;

  // Không áp chính sách mật khẩu khi đăng nhập (tài khoản cũ có thể theo chính sách khác); chỉ chặn đầu vào quá lớn.
  @IsString() @MinLength(1) @MaxLength(128)
  password!: string;
}

/** Yêu cầu đặt lại mật khẩu: chỉ cần email. */
export class ForgotPasswordDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email!: string;
}

/** Đặt mật khẩu mới bằng token trong thư. */
export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(200)
  token!: string;

  @IsString() @IsStrongPassword()
  newPassword!: string;
}

export class RefreshDto {
  @IsString() @MinLength(20) @MaxLength(200)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128)
  currentPassword!: string;

  @IsString() @IsStrongPassword()
  newPassword!: string;
}
