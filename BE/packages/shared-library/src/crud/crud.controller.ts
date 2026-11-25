import {
  Body, Controller, Delete, Get, HttpCode, Inject, InjectionToken, Param, Patch, Post, Query, Type, ValidationPipe,
} from '@nestjs/common';
import { flattenValidationErrors } from '../api/setup';
import { AppException } from '../api/errors';
import type { PrismaCrudService } from './crud.service';

export interface CrudControllerOptions {
  /** Đường dẫn gốc, vd "products". */
  path: string;
  /** Token để inject PrismaCrudService (hoặc lớp kế thừa) từ module. */
  service: InjectionToken;
  /** DTO tạo mới (class-validator). Cũng dùng cho cập nhật từng phần nếu không truyền updateDto. */
  createDto: Type<unknown>;
  /** DTO cập nhật; mặc định dùng createDto và cho phép thiếu trường (PATCH). */
  updateDto?: Type<unknown>;
  /** Bật/tắt từng route. Mặc định bật hết. */
  routes?: Partial<Record<'list' | 'get' | 'create' | 'update' | 'remove', boolean>>;
  /** Decorator áp cho cả controller, vd UseGuards(AuthGuard) hoặc decorator phân quyền. */
  decorators?: Array<ClassDecorator & MethodDecorator>;
}

function bodyPipe(dto: Type<unknown>, partial: boolean): ValidationPipe {
  return new ValidationPipe({
    expectedType: dto,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    skipMissingProperties: partial,
    exceptionFactory: (errors) => AppException.validation(flattenValidationErrors(errors)),
  });
}

/**
 * Sinh controller CRUD: GET /, GET /:id, POST /, PATCH /:id, DELETE /:id.
 * Dùng decorator gọi thủ công (không cần emitDecoratorMetadata), nên bật/tắt route theo cấu hình được.
 */
export function createCrudController(options: CrudControllerOptions): Type<unknown> {
  const routes = { list: true, get: true, create: true, update: true, remove: true, ...options.routes };

  class GeneratedCrudController {
    constructor(readonly service: PrismaCrudService) {}
    list(query: Record<string, unknown>) { return this.service.list(query); }
    get(id: string) { return this.service.findOne(id); }
    create(dto: unknown) { return this.service.create(dto); }
    update(id: string, dto: unknown) { return this.service.update(id, dto); }
    remove(id: string) { return this.service.remove(id); }
  }

  const proto = GeneratedCrudController.prototype;
  const descriptorOf = (name: string) => Object.getOwnPropertyDescriptor(proto, name)!;

  Controller(options.path)(GeneratedCrudController);
  Inject(options.service)(GeneratedCrudController, undefined as unknown as string, 0);
  for (const d of options.decorators ?? []) d(GeneratedCrudController);

  if (routes.list) {
    Get()(proto, 'list', descriptorOf('list'));
    Query()(proto, 'list', 0);
  }
  if (routes.get) {
    Get(':id')(proto, 'get', descriptorOf('get'));
    Param('id')(proto, 'get', 0);
  }
  if (routes.create) {
    Post()(proto, 'create', descriptorOf('create'));
    Body(bodyPipe(options.createDto, false))(proto, 'create', 0);
  }
  if (routes.update) {
    Patch(':id')(proto, 'update', descriptorOf('update'));
    Param('id')(proto, 'update', 0);
    Body(bodyPipe(options.updateDto ?? options.createDto, !options.updateDto))(proto, 'update', 1);
  }
  if (routes.remove) {
    Delete(':id')(proto, 'remove', descriptorOf('remove'));
    HttpCode(200)(proto, 'remove', descriptorOf('remove'));
    Param('id')(proto, 'remove', 0);
  }
  // Khai báo kiểu tham số thủ công (tsx/esbuild không phát metadata) để Nest không cảnh báo thiếu metadata.
  // Kiểu nguyên thủy/Object được ValidationPipe bỏ qua; body đã có pipe riêng với expectedType.
  const paramTypes: Record<string, unknown[]> = {
    list: [Object], get: [String], create: [Object], update: [String, Object], remove: [String],
  };
  for (const [method, types] of Object.entries(paramTypes)) Reflect.defineMetadata('design:paramtypes', types, proto, method);

  return GeneratedCrudController;
}
