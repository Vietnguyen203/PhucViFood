/** Phong bì phản hồi chuẩn cho mọi API. */

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { pagination?: PageMeta } & Record<string, unknown>;
  requestId?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  /** Chi tiết thêm, vd danh sách lỗi theo trường khi validate. */
  details?: unknown;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Kết quả danh sách có phân trang; ResponseInterceptor tự đổi thành phong bì chuẩn. */
export class PageResult<T> {
  constructor(
    readonly items: T[],
    readonly total: number,
    readonly page: number,
    readonly pageSize: number,
  ) {}
}

export function buildPageMeta(total: number, page: number, pageSize: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function ok<T>(data: T, meta?: ApiSuccess<T>['meta']): ApiSuccess<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}
