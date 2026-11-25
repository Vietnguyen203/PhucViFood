import { createHash, randomInt } from 'node:crypto';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { normalizeVnPhone, toVnDateString } from '@phucvi/shared-library/utils';

/** SĐT Việt Nam hợp lệ (nhận 0912..., +84912..., 84912...). Service chuẩn hóa về +84 khi lưu. */
export const IsVnPhone = (options?: ValidationOptions) => (object: object, propertyName: string): void => {
  registerDecorator({
    name: 'isVnPhone', target: object.constructor, propertyName, options,
    validator: { validate: (v: unknown) => typeof v === 'string' && normalizeVnPhone(v) !== null, defaultMessage: () => 'số điện thoại Việt Nam không hợp lệ' },
  });
};

export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// Bỏ các ký tự dễ nhầm (I, L, O, 0, 1) để khách đọc mã đơn qua điện thoại không bị sai.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Mã đơn dạng PV-yymmdd-XXXX (ngày theo giờ Việt Nam). Trùng thì thử lại ở nơi gọi (cột code UNIQUE). */
export function generateOrderCode(placedAt: Date = new Date()): string {
  const [yyyy, mm, dd] = toVnDateString(placedAt).split('-');
  const suffix = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `PV-${yyyy.slice(2)}${mm}${dd}-${suffix}`;
}

export const ORDER_CODE_REGEX = /^PV-\d{6}-[A-HJKMNP-Z2-9]{4}$/;

/** UUID cố định suy ra từ Idempotency-Key: cùng khóa luôn ra cùng id đơn, nên giữ hàng ở catalog cũng idempotent. */
export function orderIdFromKey(key: string): string {
  const b = createHash('sha256').update(`phucvi-order:${key}`).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._-]{8,100}$/;
