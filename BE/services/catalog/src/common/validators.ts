import { registerDecorator, ValidationOptions } from 'class-validator';
import { SLUG_REGEX } from '@phucvi/shared-library/utils';

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
