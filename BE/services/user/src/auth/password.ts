import { Inject, Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt chỉ dùng 72 byte đầu của mật khẩu, nên từ chối mật khẩu dài hơn thay vì âm thầm cắt. */
export const PASSWORD_MAX_BYTES = 72;

/** Trả về danh sách lý do vi phạm chính sách mật khẩu (rỗng nếu hợp lệ). */
export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) issues.push(`mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) issues.push(`mật khẩu tối đa ${PASSWORD_MAX_BYTES} byte`);
  if (!/\p{L}/u.test(password)) issues.push('mật khẩu phải có ít nhất một chữ cái');
  if (!/\d/.test(password)) issues.push('mật khẩu phải có ít nhất một chữ số');
  return issues;
}

/** Decorator class-validator: kiểm tra chính sách mật khẩu khi đặt mật khẩu mới. */
export function IsStrongPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && passwordPolicyIssues(value).length === 0,
        defaultMessage: (args) => {
          const value = args?.value;
          return typeof value === 'string' ? passwordPolicyIssues(value).join('; ') : 'mật khẩu không hợp lệ';
        },
      },
    });
  };
}

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  hash(plain: string): Promise<string> {
    return hash(plain, this.config.bcryptRounds);
  }

  verify(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }

  /**
   * So khớp với băm giả khi email không tồn tại, để thời gian phản hồi không lộ email nào có tài khoản.
   */
  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= hash('khong-ton-tai', this.config.bcryptRounds);
    await compare(plain, await this.dummyHash);
  }
}
