import { describe, expect, it } from 'vitest';
import { canUploadAsIs, fileProblem, fitWithin, MAX_SIDE, MAX_UPLOAD_BYTES } from './imageUpload';

describe('thu nhỏ ảnh', () => {
  it('ảnh nhỏ giữ nguyên, không phóng to', () => {
    expect(fitWithin(800, 600, MAX_SIDE)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(MAX_SIDE, 100, MAX_SIDE)).toEqual({ width: MAX_SIDE, height: 100 });
  });
  it('ảnh lớn thu về cạnh dài bằng giới hạn, giữ tỷ lệ', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 6000, 1600)).toEqual({ width: 800, height: 1600 });
  });
  it('ảnh quá dẹt vẫn có ít nhất 1px mỗi cạnh', () => {
    expect(fitWithin(100_000, 10, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('khi nào giữ nguyên tệp', () => {
  const small = { width: 1200, height: 800 };
  it('PNG, JPEG, WebP đủ nhỏ và đủ kích thước', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(canUploadAsIs({ type, size: 200_000 }, small)).toBe(true);
  });
  it('quá nặng, quá rộng hoặc loại khác (GIF, AVIF, HEIC) thì phải xử lý lại', () => {
    expect(canUploadAsIs({ type: 'image/png', size: MAX_UPLOAD_BYTES + 1 }, small)).toBe(false);
    expect(canUploadAsIs({ type: 'image/png', size: 100 }, { width: MAX_SIDE + 1, height: 10 })).toBe(false);
    for (const type of ['image/gif', 'image/avif', 'image/heic', 'image/svg+xml']) expect(canUploadAsIs({ type, size: 100 }, small)).toBe(false);
  });
});

describe('kiểm tra tệp chọn', () => {
  it('chỉ nhận tệp ảnh', () => {
    expect(fileProblem({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(fileProblem({ type: 'application/pdf', size: 1000 })).toMatch(/tệp ảnh/);
    expect(fileProblem({ type: '', size: 1000 })).toMatch(/tệp ảnh/);
  });
  it('quá 25 MB thì từ chối trước khi xử lý', () => {
    expect(fileProblem({ type: 'image/png', size: 26 * 1024 * 1024 })).toMatch(/quá lớn/);
  });
});
