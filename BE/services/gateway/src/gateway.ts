import http from 'node:http';
import https from 'node:https';
import { INestApplication, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from './config/app-config';
import { clientIp } from './proxy/client-ip';
import { forward, parseUpstream, sendError, type Upstream } from './proxy/proxy';
import { isSafePath, resolveService, SERVICE_NAMES, type ServiceName } from './proxy/routes';
import { buildRules, RateLimiter } from './rate-limit/rate-limiter';

/** Header client cần đọc được (tải file, giới hạn tốc độ, mã yêu cầu). */
export const EXPOSED_HEADERS = ['Content-Disposition', 'X-Row-Count', 'X-Stats-Available', 'X-Request-Id', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'];

const logger = new Logger('Gateway');

/**
 * Gắn gateway vào app Nest: CORS, giới hạn tốc độ rồi chuyển tiếp. Gọi SAU `setupApp` (cần mã yêu cầu) và trước `listen`.
 * Đường dẫn `/api/health*` và đường dẫn không có trong bảng định tuyến được trả cho Nest (health, 404 chuẩn).
 */
export function configureGateway(app: INestApplication, config: AppConfig): void {
  (app.getHttpAdapter().getInstance() as { disable(name: string): void }).disable('x-powered-by'); // không lộ công nghệ
  app.enableCors({ origin: config.corsOrigins, exposedHeaders: EXPOSED_HEADERS, maxAge: 600 });

  const upstreams = Object.fromEntries(SERVICE_NAMES.map((n) => [n, parseUpstream(n, config.upstreams[n])])) as Record<ServiceName, Upstream>;
  const agents = { http: new http.Agent({ keepAlive: true, maxSockets: 256 }), https: new https.Agent({ keepAlive: true, maxSockets: 256 }) };
  const limiter = config.rateLimit.enabled ? new RateLimiter(buildRules(config.rateLimit)) : null;

  app.use((req: Request, res: Response, next: NextFunction) => {
    const url = req.url ?? '/';
    const q = url.indexOf('?');
    const path = q < 0 ? url : url.slice(0, q);
    if (path !== '/api' && !path.startsWith('/api/')) return next();
    const sub = path.slice(4) || '/';
    if (sub === '/health' || sub.startsWith('/health/')) return next();

    const requestId = (req as unknown as { id?: string }).id ?? '-';
    const ip = clientIp(req, config.trustProxyHops);

    if (!isSafePath(sub)) return sendError(res, 400, 'VALIDATION_FAILED', 'Đường dẫn không hợp lệ', requestId);

    if (limiter) {
      const r = limiter.check(ip, req.method, sub);
      if (Number.isFinite(r.limit)) {
        res.setHeader('X-RateLimit-Limit', r.limit);
        res.setHeader('X-RateLimit-Remaining', r.remaining);
      }
      if (!r.allowed) {
        logger.warn(`[${requestId}] ${ip} bị giới hạn tốc độ: ${req.method} ${sub}`);
        return sendError(res, 429, 'TOO_MANY_REQUESTS', 'Thao tác quá nhanh, vui lòng thử lại sau', requestId, { 'retry-after': r.retryAfterSec });
      }
    }

    const service = resolveService(sub);
    if (!service) return next();

    const startedAt = Date.now();
    void forward(req, res, upstreams[service], `${sub}${q < 0 ? '' : url.slice(q)}`, {
      timeoutMs: config.proxyTimeoutMs, maxBodyBytes: config.maxBodyBytes, clientIp: ip, requestId, agents,
    }).then((status) => {
      // Chỉ ghi đường dẫn, không ghi query (có thể chứa SĐT, email khi tìm kiếm).
      const line = `[${requestId}] ${req.method} ${sub} -> ${service} ${status} ${Date.now() - startedAt}ms`;
      if (status >= 500) logger.warn(line); else logger.log(line);
    });
  });
}
