import { isURL, registerDecorator, ValidationOptions } from 'class-validator';
import { SLUG_REGEX } from '@phucvi/shared-library/utils';
import { UPLOAD_URL_RE } from '../uploads/image-files';

/** Slug dạng "kho-ca-loc-500g": chữ thường, số, ngăn cách bằng gạch ngang. */
export const IsSlug = (options?: ValidationOptions) => (object: object, propertyName: string): void => {
  registerDecorator({
    name: 'isSlug', target: object.constructor, propertyName, options,
    validator: {
      validate: (v: unknown) => typeof v === 'string' && v.length <= 100 && SLUG_REGEX.test(v),
      defaultMessage: () => 'slug gồm chữ thường, số và gạch ngang (vd kho-ca-loc-500g)',
    },
  });
};

/** Ảnh: link http(s) đầy đủ, hoặc đường dẫn ảnh đã tải lên hệ thống (/api/public/uploads/<uuid>.<đuôi>). */
export const IsImageRef = (options?: ValidationOptions) => (object: object, propertyName: string): void => {
  registerDecorator({
    name: 'isImageRef', target: object.constructor, propertyName, options,
    validator: {
      validate: (v: unknown) => typeof v === 'string' && v.length <= 500 && (UPLOAD_URL_RE.test(v) || isURL(v, { require_protocol: true, protocols: ['http', 'https'] })),
      defaultMessage: () => 'imageUrl phải là link http(s) hoặc ảnh đã tải lên',
    },
  });
};

/** Đích bấm của banner: trang trong cửa hàng (bắt đầu bằng một dấu /, vd /san-pham/kho-ca-loc) hoặc link http(s). Không nhận javascript:, //host, ký tự điều khiển. */
export const BANNER_LINK_RE = /^\/(?!\/)[A-Za-z0-9\-_./?=&#%]{0,298}$/;
export const IsBannerLink = (options?: ValidationOptions) => (object: object, propertyName: string): void => {
  registerDecorator({
    name: 'isBannerLink', target: object.constructor, propertyName, options,
    validator: {
      validate: (v: unknown) => typeof v === 'string' && v.length <= 300 && (BANNER_LINK_RE.test(v) || isURL(v, { require_protocol: true, protocols: ['http', 'https'] })),
      defaultMessage: () => 'linkUrl phải là trang trong cửa hàng (vd /san-pham/ten-san-pham) hoặc link http(s)',
    },
  });
};

export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Lấy base, base-2, base-3... cho tới khi chưa ai dùng. */
export async function makeUniqueSlug(base: string, fallback: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = base || fallback;
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
