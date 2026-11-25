import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { jsonSafe } from './json-safe';
import { ApiSuccess, buildPageMeta, PageResult } from './response';

/** Bọc mọi kết quả trả về vào phong bì { success, data, meta }. Trả PageResult để có phân trang. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiSuccess<unknown>> {
    const req = context.switchToHttp().getRequest<{ id?: string }>();
    return next.handle().pipe(
      map((result: unknown): ApiSuccess<unknown> => {
        const requestId = req.id ? { requestId: req.id } : {};
        if (result instanceof PageResult) {
          return {
            success: true,
            data: jsonSafe(result.items),
            meta: { pagination: buildPageMeta(result.total, result.page, result.pageSize) },
            ...requestId,
          };
        }
        return { success: true, data: jsonSafe(result ?? null), ...requestId };
      }),
    );
  }
}
