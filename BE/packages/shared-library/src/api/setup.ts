import { INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './errors';
import { requestIdMiddleware } from './request-id';
import { ResponseInterceptor } from './response.interceptor';

/** Gom lỗi class-validator (có lồng nhau) thành danh sách { field, messages }. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): Array<{ field: string; messages: string[] }> {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flattenValidationErrors(e.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true, // bỏ trường lạ
    forbidNonWhitelisted: true, // và báo lỗi thay vì lờ đi
    transform: true,
    exceptionFactory: (errors) => AppException.validation(flattenValidationErrors(errors)),
  });
}

export interface SetupAppOptions {
  /** Tiền tố đường dẫn, vd "api". */
  globalPrefix?: string;
}

/** Cấu hình chuẩn cho mọi service NestJS: request id, validate, phong bì phản hồi, bắt lỗi thống nhất. */
export function setupApp(app: INestApplication, options: SetupAppOptions = {}): void {
  app.use(requestIdMiddleware);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();
  if (options.globalPrefix) app.setGlobalPrefix(options.globalPrefix);
}
