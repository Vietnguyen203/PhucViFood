/**
 * Chuẩn hóa SĐT Việt Nam về dạng +84xxxxxxxxx (9 chữ số sau +84), khớp CHECK trong DB.
 * Chấp nhận: "0912 345 678", "+84 912-345-678", "84912345678", "912345678".
 * Trả về null nếu không hợp lệ.
 */
export function normalizeVnPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.includes('+')) return null; // dấu + nằm giữa chuỗi

  if (digits.startsWith('84') && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1);
  else if (digits.length !== 9) return null;

  if (!/^[1-9]\d{8}$/.test(digits)) return null;
  return `+84${digits}`;
}

export const VN_PHONE_REGEX = /^\+84[0-9]{9}$/;

export function isNormalizedVnPhone(value: string): boolean {
  return VN_PHONE_REGEX.test(value);
}
