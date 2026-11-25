import { Body, Type } from '@nestjs/common';
import { createValidationPipe } from './setup';

/**
 * Thay cho @Body(): validate theo DTO được truyền tường minh.
 * Cần vì service chạy bằng tsx/esbuild không phát metadata kiểu tham số, nên ValidationPipe toàn cục không biết DTO là gì.
 *   create(@ValidBody(CreateUserDto) dto: CreateUserDto) { ... }
 */
export const ValidBody = (dto: Type<unknown>, options: { partial?: boolean } = {}): ParameterDecorator =>
  Body(createValidationPipe({ expectedType: dto, skipMissingProperties: options.partial }));
