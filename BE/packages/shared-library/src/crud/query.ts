import { AppException } from '../api/errors';
import { PageParams, parsePageParams } from '../api/pagination';

/**
 * Cú pháp query danh sách (chuẩn chung cho mọi service):
 *   ?page=2&pageSize=20
 *   &sort=-createdAt,name          (dấu - là giảm dần)
 *   &q=khô cá                      (tìm trong các trường searchableFields, không phân biệt hoa thường)
 *   &filter[status]=ACTIVE         (bằng)
 *   &filter[status]=A,B            (một trong các giá trị)
 *   &filter[price][gte]=100000&filter[price][lte]=300000   (so sánh: gt, gte, lt, lte)
 */

/** Cột lưu mã số của một enum: client gửi TÊN (vd status=COMPLETED), where dùng mã số (5). Truyền codec từ contracts. */
export interface CodecFieldType {
  codec: { readonly names: readonly string[]; toCode(name: never): number; has(name: string): boolean };
}

export type FieldType = 'string' | 'number' | 'bigint' | 'boolean' | 'date' | 'uuid' | { enum: readonly string[] } | CodecFieldType;

export interface ListConfig {
  /** Trường cho phép sắp xếp. */
  sortableFields: readonly string[];
  /** Trường cho phép lọc và kiểu dữ liệu của chúng. */
  filterableFields?: Record<string, FieldType>;
  /** Trường dùng cho ?q= (kiểu chuỗi). */
  searchableFields?: readonly string[];
  /** Mặc định: -createdAt. */
  defaultSort?: string;
  /** Trường xóa mềm (vd "deletedAt"): luôn lọc bản ghi chưa xóa. */
  softDeleteField?: string;
  maxPageSize?: number;
  /** Điều kiện cố định luôn áp dụng (vd giới hạn theo CTV đang đăng nhập). */
  baseWhere?: Record<string, unknown>;
}

export interface ListArgs extends PageParams {
  where: Record<string, unknown>;
  orderBy: Array<Record<string, 'asc' | 'desc'>>;
}

type Issue = { field: string; messages: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;

function coerce(raw: string, type: FieldType, field: string, issues: Issue[]): unknown {
  const bad = (msg: string) => { issues.push({ field: `filter.${field}`, messages: [msg] }); return undefined; };
  if (typeof type === 'object' && 'codec' in type) {
    return type.codec.has(raw) ? (type.codec.toCode as (n: string) => number)(raw) : bad(`giá trị phải thuộc: ${type.codec.names.join(', ')}`);
  }
  if (typeof type === 'object') return type.enum.includes(raw) ? raw : bad(`giá trị phải thuộc: ${type.enum.join(', ')}`);
  switch (type) {
    case 'string': return raw;
    case 'uuid': return UUID_RE.test(raw) ? raw.toLowerCase() : bad('phải là UUID');
    case 'number': { const n = Number(raw); return raw.trim() !== '' && Number.isFinite(n) ? n : bad('phải là số'); }
    case 'bigint': return /^-?\d+$/.test(raw) ? BigInt(raw) : bad('phải là số nguyên');
    case 'boolean': return raw === 'true' ? true : raw === 'false' ? false : bad('phải là true hoặc false');
    case 'date': { const d = new Date(raw); return Number.isNaN(d.getTime()) ? bad('phải là ngày hợp lệ (ISO 8601)') : d; }
  }
}

function buildFilter(field: string, value: unknown, type: FieldType, issues: Issue[]): unknown {
  if (typeof value === 'string') {
    const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const list = parts.map((p) => coerce(p, type, field, issues));
      return { in: list };
    }
    return coerce(value, type, field, issues);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (type === 'string' || type === 'boolean' || type === 'uuid' || typeof type === 'object') {
      issues.push({ field: `filter.${field}`, messages: ['trường này chỉ hỗ trợ lọc bằng hoặc danh sách'] });
      return undefined;
    }
    const cond: Record<string, unknown> = {};
    for (const [op, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!(OPERATORS as readonly string[]).includes(op) || typeof raw !== 'string') {
        issues.push({ field: `filter.${field}.${op}`, messages: [`toán tử hỗ trợ: ${OPERATORS.join(', ')}`] });
        continue;
      }
      cond[op] = coerce(raw, type, `${field}.${op}`, issues);
    }
    return cond;
  }
  issues.push({ field: `filter.${field}`, messages: ['giá trị không hợp lệ'] });
  return undefined;
}

function parseSort(raw: unknown, config: ListConfig, issues: Issue[]): ListArgs['orderBy'] {
  const text = typeof raw === 'string' && raw ? raw : (config.defaultSort ?? '-createdAt');
  const order: ListArgs['orderBy'] = [];
  for (const token of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const desc = token.startsWith('-');
    const field = desc ? token.slice(1) : token;
    if (!config.sortableFields.includes(field)) {
      issues.push({ field: 'sort', messages: [`không được sắp xếp theo "${field}"; cho phép: ${config.sortableFields.join(', ')}`] });
      continue;
    }
    order.push({ [field]: desc ? 'desc' : 'asc' });
  }
  // Khóa phụ để phân trang ổn định khi nhiều dòng trùng giá trị sắp xếp.
  if (!order.some((o) => 'id' in o)) order.push({ id: 'asc' });
  return order;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Gom khóa dạng ngoặc vuông phẳng thành object lồng: { "filter[price][gte]": "1" } => { filter: { price: { gte: "1" } } }.
 * Cần vì Express 5 (và Fastify) mặc định không tự phân tích query lồng nhau. Chặn khóa gây nhiễm prototype.
 */
export function normalizeQuery(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    const match = /^([^[\]]+)((?:\[[^[\]]+\])+)$/.exec(key);
    if (!match) {
      if (!FORBIDDEN_KEYS.has(key)) out[key] = value;
      continue;
    }
    const path = [match[1], ...(match[2].match(/\[([^[\]]+)\]/g) ?? []).map((s) => s.slice(1, -1))];
    if (path.some((p) => FORBIDDEN_KEYS.has(p))) continue;
    let node = out;
    path.slice(0, -1).forEach((p) => {
      if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
      node = node[p] as Record<string, unknown>;
    });
    node[path[path.length - 1]] = value;
  }
  return out;
}

/** Chuyển query HTTP thành tham số Prisma (where, orderBy, skip, take). Lỗi đầu vào ném VALIDATION_FAILED. */
export function parseListQuery(rawQuery: Record<string, unknown>, config: ListConfig): ListArgs {
  const query = normalizeQuery(rawQuery);
  const issues: Issue[] = [];
  const page = parsePageParams(query, config.maxPageSize);
  const and: Record<string, unknown>[] = [];

  if (config.baseWhere) and.push(config.baseWhere);
  if (config.softDeleteField) and.push({ [config.softDeleteField]: null });

  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q && config.searchableFields?.length) {
    and.push({ OR: config.searchableFields.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) });
  }

  const filter = query.filter;
  if (filter !== undefined) {
    if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
      issues.push({ field: 'filter', messages: ['dùng dạng filter[tênTrường]=giáTrị'] });
    } else {
      for (const [field, value] of Object.entries(filter as Record<string, unknown>)) {
        const type = config.filterableFields?.[field];
        if (!type) {
          issues.push({ field: `filter.${field}`, messages: [`không được lọc theo "${field}"`] });
          continue;
        }
        const cond = buildFilter(field, value, type, issues);
        if (cond !== undefined) and.push({ [field]: cond });
      }
    }
  }

  const orderBy = parseSort(query.sort, config, issues);
  if (issues.length) throw AppException.validation(issues);

  return { ...page, where: and.length ? { AND: and } : {}, orderBy };
}
