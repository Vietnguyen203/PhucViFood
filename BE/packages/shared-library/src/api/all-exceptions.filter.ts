import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { AppException, codeForStatus, DEFAULT_ERROR_MESSAGES, ErrorCode } from './errors';
import type { ApiFailure } from './response';

interface HttpResLike { status(code: number): { json(body: unknown): unknown } }

interface Mapped { status: number; code: ErrorCode; message: string; details?: unknown }

/** Lỗi Prisma nhận diện qua thuộc tính, để thư viện không phụ thuộc client sinh riêng của từng service. */
function isPrismaKnownError(e: unknown): e is { code: string; message: string; meta?: unknown } {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'PrismaClientKnownRequestError'
    && typeof (e as { code?: unknown }).code === 'string';
}

function mapPrismaError(e: { code: string; meta?: unknown }): Mapped | null {
  switch (e.code) {
    case 'P2002': return { status: 409, code: ErrorCode.CONFLICT, message: 'Dữ liệu đã tồn tại (trùng giá trị duy nhất)', details: e.meta };
    case 'P2025': return { status: 404, code: ErrorCode.NOT_FOUND, message: DEFAULT_ERROR_MESSAGES.NOT_FOUND };
    case 'P2003': return { status: 409, code: ErrorCode.CONFLICT, message: 'Dữ liệu đang được tham chiếu hoặc tham chiếu không tồn tại' };
    case 'P2004': return { status: 422, code: ErrorCode.BUSINESS_RULE_VIOLATION, message: 'Dữ liệu vi phạm ràng buộc của hệ thống', details: e.meta };
    default: return null;
  }
}

export function mapException(exception: unknown): Mapped {
  if (exception instanceof AppException) {
    return { status: exception.status, code: exception.code, message: exception.message, details: exception.details };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    let message = exception.message;
    let details: unknown;
    if (typeof body === 'object' && body !== null) {
      const b = body as { message?: unknown };
      if (Array.isArray(b.message)) { message = DEFAULT_ERROR_MESSAGES.VALIDATION_FAILED; details = b.message; }
      else if (typeof b.message === 'string') message = b.message;
    }
    return { status, code: codeForStatus(status), message, details };
  }
  if (isPrismaKnownError(exception)) {
    const mapped = mapPrismaError(exception);
    if (mapped) return mapped;
  }
  return { status: 500, code: ErrorCode.INTERNAL_ERROR, message: DEFAULT_ERROR_MESSAGES.INTERNAL_ERROR };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<HttpResLike>();
    const req = http.getRequest<{ id?: string; method?: string; url?: string }>();
    const mapped = mapException(exception);

    if (mapped.status >= 500) {
      // Lỗi hệ thống: ghi đầy đủ vào log, không lộ chi tiết cho client.
      this.logger.error(`[${req.id ?? '-'}] ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    const body: ApiFailure = {
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details !== undefined && mapped.status < 500 ? { details: mapped.details } : {}),
      },
      ...(req.id ? { requestId: req.id } : {}),
    };
    res.status(mapped.status).json(body);
  }
}
