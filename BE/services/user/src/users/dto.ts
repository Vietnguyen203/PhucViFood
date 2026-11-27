import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@phucvi/shared-library/contracts';
import { IsStrongPassword } from '../auth/password';

const ROLES = Object.values(UserRole);
const STATUSES = ['ACTIVE', 'DISABLED'] as const;
const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Admin tạo tài khoản (vd tạo thêm quản trị viên). */
export class CreateUserDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @IsStrongPassword()
  password!: string;

  @IsIn(ROLES)
  role!: UserRole;
}

/** Admin chỉ được đổi vai trò và trạng thái; không đổi email hay mật khẩu của người khác. */
export class UpdateUserDto {
  @IsOptional() @IsIn(ROLES)
  role?: UserRole;

  @IsOptional() @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

/** Admin đặt lại mật khẩu cho người khác (quên mật khẩu). Mật khẩu mới theo chính sách chung. */
export class ResetPasswordDto {
  @IsString() @IsStrongPassword()
  newPassword!: string;
}
