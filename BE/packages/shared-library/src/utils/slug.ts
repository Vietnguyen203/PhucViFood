/** Tạo slug không dấu từ tiếng Việt: "Khô cá lóc 500g" => "kho-ca-loc-500g". */
export function slugify(text: string, maxLength = 80): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu
    .replace(/đ/gi, 'd') // đ không tách dấu được bằng NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, maxLength).replace(/-+$/g, '');
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
