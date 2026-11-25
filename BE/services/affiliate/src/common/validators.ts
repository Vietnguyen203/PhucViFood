import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidReferralCode, normalizeChannelCode, normalizeVnPhone } from '@phucvi/shared-library/utils';

const make = (name: string, check: (value: unknown) => boolean, message: string) =>
  (options?: ValidationOptions) => (object: object, propertyName: string): void => {
    registerDecorator({
      name, target: object.constructor, propertyName, options,
      validator: { validate: check, defaultMessage: () => message },
    });
  };

/** SĐT Việt Nam hợp lệ (nhận 0912..., +84912..., 84912...). Service chuẩn hóa về +84 khi lưu. */
export const IsVnPhone = make('isVnPhone', (v) => typeof v === 'string' && normalizeVnPhone(v) !== null, 'số điện thoại Việt Nam không hợp lệ');

/** Mã giới thiệu: 4-12 ký tự chữ thường + số, không trùng từ khóa hệ thống. */
export const IsReferralCode = make(
  'isReferralCode',
  (v) => typeof v === 'string' && isValidReferralCode(v),
  'mã giới thiệu gồm 4-12 ký tự chữ thường và số, không dùng từ khóa hệ thống',
);

/** Mã kênh: 1-30 ký tự chữ thường, số, gạch dưới hoặc gạch ngang. */
export const IsChannelCode = make(
  'isChannelCode',
  (v) => typeof v === 'string' && normalizeChannelCode(v) !== null,
  'mã kênh gồm 1-30 ký tự chữ thường, số, _ hoặc -',
);

/** Ngày dạng YYYY-MM-DD hợp lệ. */
export const IsDateOnly = make(
  'isDateOnly',
  (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
  'ngày phải có dạng YYYY-MM-DD',
);

export const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
