import { AppException } from './errors';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageParams { page: number; pageSize: number; skip: number; take: number }

function parsePositiveInt(raw: unknown, name: string, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw AppException.validation([{ field: name, messages: [`${name} phải là số nguyên dương`] }]);
  }
  return n;
}

/** Đọc ?page= & ?pageSize= (mặc định 1 và 20, tối đa 100). */
export function parsePageParams(query: Record<string, unknown>, maxPageSize = MAX_PAGE_SIZE): PageParams {
  const page = parsePositiveInt(query.page, 'page', 1);
  const requested = parsePositiveInt(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requested, maxPageSize);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
