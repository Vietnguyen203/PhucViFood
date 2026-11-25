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

export class LoginDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email!: string;

  // Không áp chính sách mật khẩu khi đăng nhập (tài khoản cũ có thể theo chính sách khác); chỉ chặn đầu vào quá lớn.
  @IsString() @MinLength(1) @MaxLength(128)
  password!: string;
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
