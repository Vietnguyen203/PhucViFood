/** Việt Nam dùng UTC+7 quanh năm, không có giờ mùa hè. */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Ngày theo giờ Việt Nam dạng YYYY-MM-DD. Dùng để so với ngày hiệu lực hợp đồng (cột DATE). */
export function toVnDateString(date: Date): string {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Chuẩn hóa cột DATE (Date lúc 00:00 UTC hoặc chuỗi) về YYYY-MM-DD. */
export function toDateOnly(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** Số ngày chênh lệch (làm tròn xuống) giữa hai mốc thời gian. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
