import { describe, expect, it } from 'vitest';
import { aspectRatio, cropRect, frameSize, initialView, outputSize, panView, rotatedSize } from './imageEdit';

describe('xoay và tỷ lệ', () => {
  it('xoay lẻ lần 90° thì đổi chiều', () => {
    expect(rotatedSize(400, 300, 0)).toEqual({ width: 400, height: 300 });
    expect(rotatedSize(400, 300, 1)).toEqual({ width: 300, height: 400 });
    expect(rotatedSize(400, 300, 2)).toEqual({ width: 400, height: 300 });
    expect(rotatedSize(400, 300, 3)).toEqual({ width: 300, height: 400 });
  });
  it('tỷ lệ khung', () => {
    expect(aspectRatio('original', 400, 200)).toBe(2);
    expect(aspectRatio('1:1', 400, 200)).toBe(1);
    expect(aspectRatio('3:4', 400, 200)).toBe(0.75);
    expect(aspectRatio('16:9', 1, 1)).toBeCloseTo(16 / 9);
  });
});

describe('vùng cắt', () => {
  it('chưa phóng to: khung lớn nhất đúng tỷ lệ, nằm giữa ảnh', () => {
    expect(cropRect(1000, 500, 1, initialView(1000, 500))).toEqual({ x: 250, y: 0, w: 500, h: 500 });
    expect(cropRect(500, 1000, 1, initialView(500, 1000))).toEqual({ x: 0, y: 250, w: 500, h: 500 });
    expect(cropRect(1000, 500, 2, initialView(1000, 500))).toEqual({ x: 0, y: 0, w: 1000, h: 500 }); // đúng tỷ lệ ảnh: lấy cả ảnh
  });
  it('phóng to thì vùng cắt nhỏ lại theo tỷ lệ', () => {
    const r = cropRect(1000, 500, 1, { zoom: 2, cx: 500, cy: 250 });
    expect(r).toEqual({ x: 375, y: 125, w: 250, h: 250 });
  });
  it('luôn nằm gọn trong ảnh dù tâm hay độ phóng to lệch', () => {
    for (const view of [{ zoom: 1, cx: -999, cy: 9999 }, { zoom: 3, cx: 0, cy: 0 }, { zoom: 3, cx: 5000, cy: 5000 }, { zoom: 99, cx: 500, cy: 250 }, { zoom: 0.1, cx: 500, cy: 250 }]) {
      const r = cropRect(1000, 500, 1.5, view);
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1000 + 1e-9); expect(r.y + r.h).toBeLessThanOrEqual(500 + 1e-9);
      expect(r.w / r.h).toBeCloseTo(1.5);
    }
  });
});

describe('kéo ảnh', () => {
  it('kéo sang phải thì thấy phần bên trái của ảnh (tâm đi ngược lại)', () => {
    const v = panView(1000, 500, 1, { zoom: 2, cx: 500, cy: 250 }, 0.2, 0); // kéo 20% bề rộng khung (250px ảnh) => 50px
    expect(cropRect(1000, 500, 1, v).x).toBeCloseTo(375 - 50);
    const down = panView(1000, 500, 1, { zoom: 2, cx: 500, cy: 250 }, 0, 0.2);
    expect(cropRect(1000, 500, 1, down).y).toBeCloseTo(125 - 50);
  });
  it('kéo quá mép thì dừng ở mép ảnh', () => {
    const v = panView(1000, 500, 1, { zoom: 2, cx: 500, cy: 250 }, 50, 50);
    const r = cropRect(1000, 500, 1, v);
    expect(r.x).toBe(0); expect(r.y).toBe(0);
  });
});

describe('xuất ảnh', () => {
  it('thu nhỏ cho cạnh dài không quá giới hạn, không phóng to', () => {
    expect(outputSize({ w: 2000, h: 1000 }, 1000)).toEqual({ width: 1000, height: 500 });
    expect(outputSize({ w: 300, h: 200 }, 1000)).toEqual({ width: 300, height: 200 });
    expect(outputSize({ w: 0.2, h: 0.2 }, 1000)).toEqual({ width: 1, height: 1 });
  });
  it('khung xem trước vừa hộp theo tỷ lệ', () => {
    expect(frameSize(2, 400, 300)).toEqual({ width: 400, height: 200 });
    expect(frameSize(0.5, 400, 300)).toEqual({ width: 150, height: 300 });
    expect(frameSize(4 / 3, 400, 300)).toEqual({ width: 400, height: 300 });
  });
});
