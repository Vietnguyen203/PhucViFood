import { HttpStatus } from '@nestjs/common';

/** Mã lỗi ổn định cho client. Không đổi tên khi đã dùng. */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  /** Service phụ thuộc (catalog, affiliate, customer...) không phản hồi hoặc lỗi; client có thể thử lại. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Dữ liệu không hợp lệ',
  UNAUTHORIZED: 'Chưa đăng nhập hoặc phiên đã hết hạn',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
  NOT_FOUND: 'Không tìm thấy dữ liệu',
  CONFLICT: 'Dữ liệu bị trùng hoặc xung đột',
  BUSINESS_RULE_VIOLATION: 'Thao tác vi phạm quy tắc nghiệp vụ',
  TOO_MANY_REQUESTS: 'Thao tác quá nhanh, vui lòng thử lại sau',
  SERVICE_UNAVAILABLE: 'Hệ thống đang bận, vui lòng thử lại sau ít phút',
  INTERNAL_ERROR: 'Lỗi hệ thống, vui lòng thử lại sau',
};

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400: return ErrorCode.VALIDATION_FAILED;
    case 401: return ErrorCode.UNAUTHORIZED;
    case 403: return ErrorCode.FORBIDDEN;
    case 404: return ErrorCode.NOT_FOUND;
    case 409: return ErrorCode.CONFLICT;
    case 422: return ErrorCode.BUSINESS_RULE_VIOLATION;
    case 429: return ErrorCode.TOO_MANY_REQUESTS;
    case 503: return ErrorCode.SERVICE_UNAVAILABLE;
    default: return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED;
  }
}

/** Lỗi nghiệp vụ có mã ổn định. Ném từ service; AllExceptionsFilter chuyển thành phản hồi chuẩn. */
export class AppException extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
    status?: number,
  ) {
    super(message ?? DEFAULT_ERROR_MESSAGES[code]);
    this.name = 'AppException';
    this.status = status ?? statusForCode(code);
  }

  static validation(details?: unknown, message?: string) { return new AppException(ErrorCode.VALIDATION_FAILED, message, details); }
  static notFound(message?: string, details?: unknown) { return new AppException(ErrorCode.NOT_FOUND, message, details); }
  static conflict(message?: string, details?: unknown) { return new AppException(ErrorCode.CONFLICT, message, details); }
  static forbidden(message?: string) { return new AppException(ErrorCode.FORBIDDEN, message); }
  static unauthorized(message?: string) { return new AppException(ErrorCode.UNAUTHORIZED, message); }
  static unavailable(message?: string) { return new AppException(ErrorCode.SERVICE_UNAVAILABLE, message); }
  static businessRule(message: string, details?: unknown) { return new AppException(ErrorCode.BUSINESS_RULE_VIOLATION, message, details); }
}
