import { Controller, Get, Type } from '@nestjs/common';

/** Tạo controller GET /health cho service. Dùng cho healthcheck của Docker/Caddy. */
export function createHealthController(serviceName: string): Type<unknown> {
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
