import { registerDecorator, ValidationOptions } from 'class-validator';
import { normalizeVnPhone } from '@phucvi/shared-library/utils';

/** SĐT Việt Nam hợp lệ (nhận 0912..., +84912..., 84912...). Service chuẩn hóa về +84 khi lưu. */
export const IsVnPhone = (options?: ValidationOptions) => (object: object, propertyName: string): void => {
  registerDecorator({
    name: 'isVnPhone', target: object.constructor, propertyName, options,
    validator: { validate: (v: unknown) => typeof v === 'string' && normalizeVnPhone(v) !== null, defaultMessage: () => 'số điện thoại Việt Nam không hợp lệ' },
  });
};

export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
