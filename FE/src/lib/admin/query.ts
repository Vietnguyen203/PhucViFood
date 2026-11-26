// Dựng chuỗi truy vấn danh sách theo quy ước của backend: page, pageSize, sort, q, filter[x], filter[x][gte].
export interface ListQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  /** Giá trị rỗng hoặc undefined bị bỏ qua. Dạng {gte, lte} cho khoảng. */
  filters?: Record<string, string | number | boolean | { gte?: string; lte?: string; gt?: string; lt?: string } | undefined>;
  /** Tham số phẳng ngoài filter (vd tier, activity của khách). */
  extra?: Record<string, string | undefined>;
}

export function buildQuery(query: ListQuery = {}): string {
  const p = new URLSearchParams();
  if (query.page && query.page > 1) p.set('page', String(query.page));
  if (query.pageSize) p.set('pageSize', String(query.pageSize));
  if (query.sort) p.set('sort', query.sort);
  const q = query.q?.trim();
  if (q) p.set('q', q);
  for (const [key, v] of Object.entries(query.filters ?? {})) {
    if (v === undefined || v === '') continue;
    if (typeof v === 'object') {
      for (const [op, val] of Object.entries(v)) if (val) p.set(`filter[${key}][${op}]`, val);
    } else p.set(`filter[${key}]`, String(v));
  }
  for (const [key, v] of Object.entries(query.extra ?? {})) if (v) p.set(key, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Đổi ngày nhập từ ô date (yyyy-mm-dd) sang mốc đầu/cuối ngày giờ Việt Nam cho bộ lọc khoảng. */
export const dayStart = (d: string) => (d ? `${d}T00:00:00+07:00` : '');
export const dayEnd = (d: string) => (d ? `${d}T23:59:59.999+07:00` : '');
