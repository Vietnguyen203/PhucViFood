import { Controller, Get, Type } from '@nestjs/common';
import { Public } from '../auth/decorators';

/** Tạo controller GET /health cho service (công khai, không cần JWT). Dùng cho healthcheck của Docker/Caddy. */
export function createHealthController(serviceName: string): Type<unknown> {
  @Public()
  @Controller('health')
  class HealthController {
    private readonly startedAt = Date.now();

    @Get()
    check() {
      return { status: 'ok', service: serviceName, uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000) };
    }
  }
  return HealthController;
}
