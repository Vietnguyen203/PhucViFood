// Tính toán cho trình chỉnh ảnh (cắt, phóng to, xoay): hàm thuần, không phụ thuộc trình duyệt để kiểm thử được.
import { fitWithin } from './imageUpload';

export type AspectKey = 'original' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export const ASPECT_OPTIONS: Array<{ key: AspectKey; label: string }> = [
  { key: 'original', label: 'Gốc' },
  { key: '1:1', label: 'Vuông 1:1' },
  { key: '4:3', label: 'Ngang 4:3' },
  { key: '3:4', label: 'Dọc 3:4' },
  { key: '16:9', label: 'Ngang 16:9' },
  { key: '9:16', label: 'Dọc 9:16' },
];

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

/** Kích thước ảnh sau khi xoay `turns` lần 90° (thuận chiều kim đồng hồ). */
export function rotatedSize(width: number, height: number, turns: number): { width: number; height: number } {
  return Math.abs(turns % 2) === 1 ? { width: height, height: width } : { width, height };
}

/** Tỷ lệ rộng/cao của khung cắt; "gốc" lấy theo ảnh (đã xoay). */
export function aspectRatio(key: AspectKey, width: number, height: number): number {
  if (key === 'original') return width / height;
  const [w, h] = key.split(':').map(Number);
  return w / h;
}

/** Góc nhìn: phóng to và tâm khung cắt (tọa độ điểm ảnh của ảnh đã xoay). */
export interface View { zoom: number; cx: number; cy: number }

export const initialView = (width: number, height: number): View => ({ zoom: MIN_ZOOM, cx: width / 2, cy: height / 2 });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Vùng ảnh nguồn được cắt: khung lớn nhất đúng tỷ lệ nằm gọn trong ảnh, thu nhỏ theo độ phóng to, luôn nằm trong ảnh. */
export function cropRect(width: number, height: number, ratio: number, view: View): { x: number; y: number; w: number; h: number } {
  const w0 = Math.min(width, height * ratio);
  const h0 = w0 / ratio;
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const w = w0 / zoom;
  const h = h0 / zoom;
  return { x: clamp(view.cx - w / 2, 0, width - w), y: clamp(view.cy - h / 2, 0, height - h), w, h };
}

/** Kéo ảnh: `dx`, `dy` là quãng chuột kéo tính theo tỷ lệ của khung (0.1 = 10% bề rộng khung); ảnh đi theo tay nên tâm cắt đi ngược lại. */
export function panView(width: number, height: number, ratio: number, view: View, dx: number, dy: number): View {
  const r = cropRect(width, height, ratio, view);
  return { zoom: view.zoom, cx: r.x + r.w / 2 - dx * r.w, cy: r.y + r.h / 2 - dy * r.h };
}

/** Kích thước ảnh xuất ra: giữ tỷ lệ vùng cắt, cạnh dài không quá `maxSide`. */
export function outputSize(rect: { w: number; h: number }, maxSide: number): { width: number; height: number } {
  return fitWithin(Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(rect.h)), maxSide);
}

/** Khung xem trước vừa trong hộp `maxW` x `maxH` theo tỷ lệ `ratio`. */
export function frameSize(ratio: number, maxW: number, maxH: number): { width: number; height: number } {
  return ratio >= maxW / maxH ? { width: maxW, height: Math.round(maxW / ratio) } : { width: Math.round(maxH * ratio), height: maxH };
}
