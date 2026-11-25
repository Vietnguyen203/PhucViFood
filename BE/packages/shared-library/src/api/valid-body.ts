import { Body, Type } from '@nestjs/common';
import { createValidationPipe } from './setup';

/**
 * Thay cho @Body(): validate theo DTO được truyền tường minh.
 * Cần vì service chạy bằng tsx/esbuild không phát metadata kiểu tham số, nên ValidationPipe toàn cục không biết DTO là gì.
 *   create(@ValidBody(CreateUserDto) dto: CreateUserDto) { ... }
 */
export const ValidBody = (dto: Type<unknown>, options: { partial?: boolean } = {}): ParameterDecorator =>
  Body(createValidationPipe({ expectedType: dto, skipMissingProperties: options.partial }));

/**
 * Khai báo kiểu các tham số của handler theo thứ tự, thay cho metadata mà tsx/esbuild không phát ra.
 * Dùng cho handler có @Param/@Query để Nest không cảnh báo "no decorator metadata".
 * Kiểu nguyên thủy (String, Object) được ValidationPipe bỏ qua; body đã có pipe riêng qua @ValidBody.
 *   @ParamTypes(String, Object) approve(@Param('id') id: string, @ValidBody(ApproveDto) dto: ApproveDto) { ... }
 */
export const ParamTypes = (...types: unknown[]): MethodDecorator =>
  (target, propertyKey) => Reflect.defineMetadata('design:paramtypes', types, target, propertyKey);
