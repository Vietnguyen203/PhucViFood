/** Loại ảnh nhận tải lên: chỉ PNG, JPEG, WebP. Loại được xác định từ BYTE ĐẦU của tệp, không tin tên tệp hay header do client gửi. */
export interface ImageType { ext: 'png' | 'jpg' | 'webp'; mime: 'image/png' | 'image/jpeg' | 'image/webp' }

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Kích thước tối đa của một ảnh tải lên. Bằng MAX_BODY_BYTES mặc định của gateway và Caddy (1 MiB): lớn hơn thì bị chặn ở cổng ngoài. */
export const MAX_IMAGE_BYTES = 1_048_576;

/** Tên tệp do hệ thống sinh: UUID + đuôi. Chỉ tên dạng này mới được phục vụ (chặn ../ và tên lạ). */
export const UPLOAD_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

/** Đường dẫn công khai của ảnh đã tải lên (dùng làm imageUrl của sản phẩm). */
export const UPLOAD_PUBLIC_PREFIX = '/api/public/uploads/';
export const UPLOAD_URL_RE = /^\/api\/public\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

export function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export const MIME_BY_EXT: Record<string, ImageType['mime']> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
