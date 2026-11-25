import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { SERVICE_NAMES, type ServiceName } from '../proxy/routes';

interface ServiceHealth { status: 'up' | 'down'; latencyMs: number }

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Gateway còn sống (dùng cho healthcheck của Docker/Caddy; không phụ thuộc service nào). */
  @Get()
  check() {
    return { status: 'ok', service: 'gateway', uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000) };
  }

  /** Tình trạng từng service phía sau. `degraded` khi có service không trả lời. */
  @Get('services')
  async services() {
    const entries = await Promise.all(SERVICE_NAMES.map(async (name) => [name, await this.probe(name)] as const));
    const services = Object.fromEntries(entries) as Record<ServiceName, ServiceHealth>;
    const allUp = entries.every(([, h]) => h.status === 'up');
    return { status: allUp ? 'ok' : 'degraded', services };
  }

  private async probe(name: ServiceName): Promise<ServiceHealth> {
    const started = Date.now();
    try {
      const res = await fetch(`${this.config.upstreams[name]}/health`, { signal: AbortSignal.timeout(this.config.healthTimeoutMs) });
      return { status: res.ok ? 'up' : 'down', latencyMs: Date.now() - started };
    } catch {
      return { status: 'down', latencyMs: Date.now() - started };
    }
  }
}
