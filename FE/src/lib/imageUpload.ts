// Chuẩn bị ảnh sản phẩm để tải lên: thu nhỏ và nén ngay trên trình duyệt cho vừa giới hạn 1 MiB của hệ thống.

/** Giới hạn của backend là 1 MiB; chừa chỗ để không chạm trần. */
export const MAX_UPLOAD_BYTES = 900_000;
/** Cạnh dài tối đa (px): đủ nét cho ảnh sản phẩm, không phí dung lượng. */
export const MAX_SIDE = 1600;
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** Chất lượng thử lần lượt khi nén; vẫn quá lớn thì thu nhỏ thêm rồi thử lại. */
export const QUALITIES = [0.88, 0.8, 0.7, 0.6, 0.5];
export const MAX_SHRINK_ROUNDS = 4;

/** Kích thước sau khi thu nhỏ cho cạnh dài không quá `max` (giữ tỷ lệ, không phóng to). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Giữ nguyên tệp (không nén lại, bảo toàn nền trong suốt của PNG) khi đã là loại nhận được, đủ nhỏ và đủ kích thước. */
export function canUploadAsIs(file: { type: string; size: number }, dims: { width: number; height: number }): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_UPLOAD_BYTES && Math.max(dims.width, dims.height) <= MAX_SIDE;
}

/** Lỗi chọn tệp (null nếu hợp lệ): phải là ảnh và không quá lớn để xử lý trên trình duyệt. */
export function fileProblem(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'Vui lòng chọn tệp ảnh (PNG, JPEG hoặc WebP).';
  if (file.size > 25 * 1024 * 1024) return 'Ảnh quá lớn (trên 25 MB), vui lòng chọn ảnh nhỏ hơn.';
  return null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Trả về ảnh sẵn sàng tải lên (PNG, JPEG hoặc WebP, ≤ MAX_UPLOAD_BYTES). Chỉ chạy trên trình duyệt (cần canvas).
 * Ưu tiên WebP (nhỏ, giữ nền trong suốt); trình duyệt không xuất được WebP thì dùng JPEG nền trắng.
 */
export async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) throw new Error('Không đọc được ảnh này, vui lòng chọn ảnh khác.');
  try {
    if (canUploadAsIs(file, bitmap)) return file;
    let { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
    for (let round = 0; round <= MAX_SHRINK_ROUNDS; round++) {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
      ctx.drawImage(bitmap, 0, 0, width, height);
      let blob = await toBlob(canvas, 'image/webp', QUALITIES[0]);
      const webp = blob?.type === 'image/webp';
      if (!webp) { // JPEG không có nền trong suốt: vẽ lại trên nền trắng
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(bitmap, 0, 0, width, height);
      }
      for (const q of QUALITIES) {
        blob = await toBlob(canvas, webp ? 'image/webp' : 'image/jpeg', q);
        if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
      }
      width = Math.max(1, Math.round(width * 0.8)); height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error('Không nén được ảnh xuống dưới 1 MB, vui lòng chọn ảnh nhỏ hơn.');
  } finally {
    bitmap.close();
  }
}
