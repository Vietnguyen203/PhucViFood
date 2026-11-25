import http, { type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import { Transform } from 'node:stream';

export interface Upstream {
  name: string;
  protocol: 'http:' | 'https:';
  hostname: string;
  port: number;
  /** Phần đường dẫn gốc của service, vd `/api` (không có dấu `/` cuối). */
  basePath: string;
}

export function parseUpstream(name: string, url: string): Upstream {
  const u = new URL(url);
  return {
    name,
    protocol: u.protocol === 'https:' ? 'https:' : 'http:',
    hostname: u.hostname,
    port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
    basePath: u.pathname.replace(/\/+$/, ''),
  };
}

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

/** Header client gửi lên mà gateway không bao giờ chuyển tiếp (khóa nội bộ, header chuyển tiếp tự khai). */
const DROP_FROM_CLIENT = new Set(['host', 'x-internal-key', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'x-request-id']);

/** Header phản hồi do gateway quản lý, không lấy từ service (CORS, mã yêu cầu). */
const DROP_FROM_UPSTREAM = (name: string) => HOP_BY_HOP.has(name) || name.startsWith('access-control-') || name === 'x-powered-by' || name === 'x-request-id';

/** Header liệt kê trong `Connection` cũng là hop-by-hop. */
function connectionTokens(headers: IncomingHttpHeaders): Set<string> {
  const raw = headers.connection;
  const value = Array.isArray(raw) ? raw.join(',') : raw ?? '';
  return new Set(value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean));
}

export interface ForwardOptions {
  timeoutMs: number;
  maxBodyBytes: number;
  clientIp: string;
  requestId: string;
  agents: { http: http.Agent; https: https.Agent };
}

export function buildUpstreamHeaders(req: IncomingMessage, upstream: Upstream, opts: Pick<ForwardOptions, 'clientIp' | 'requestId'>): http.OutgoingHttpHeaders {
  const extra = connectionTokens(req.headers);
  const out: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name) || DROP_FROM_CLIENT.has(name) || extra.has(name)) continue;
    out[name] = value;
  }
  out.host = upstream.port === 80 || upstream.port === 443 ? upstream.hostname : `${upstream.hostname}:${upstream.port}`;
  out['x-forwarded-for'] = opts.clientIp;
  out['x-forwarded-host'] = req.headers.host ?? '';
  out['x-forwarded-proto'] = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
  out['x-request-id'] = opts.requestId;
  return out;
}

/** Gộp giá trị `Vary` của gateway (CORS) và của service, không trùng. */
function mergeVary(existing: string | number | string[] | undefined, incoming: string | string[] | undefined): string | undefined {
  const tokens = new Set<string>();
  for (const v of [existing, incoming]) {
    const text = Array.isArray(v) ? v.join(',') : v === undefined ? '' : String(v);
    text.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => tokens.add(t));
  }
  return tokens.size ? [...tokens].join(', ') : undefined;
}

export function sendError(res: ServerResponse, status: number, code: string, message: string, requestId?: string, headers: Record<string, string | number> = {}): void {
  if (res.headersSent) { res.destroy(); return; }
  const body = JSON.stringify({ success: false, error: { code, message }, ...(requestId ? { requestId } : {}) });
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

class BodyTooLargeError extends Error {}
class UpstreamTimeoutError extends Error {}

/**
 * Chuyển tiếp một yêu cầu tới service phía sau theo kiểu stream (không đọc cả nội dung vào bộ nhớ, nên tải file .xlsx hay
 * nội dung lớn đều đi thẳng). Luôn trả về mã HTTP đã gửi cho client. Không bao giờ ném lỗi.
 */
export function forward(req: IncomingMessage, res: ServerResponse, upstream: Upstream, pathAndQuery: string, opts: ForwardOptions): Promise<number> {
  return new Promise((resolve) => {
    let finished = false;
    let status = 0;
    const done = (s: number) => { if (!finished) { finished = true; resolve(s); } };
    const fail = (httpStatus: number, code: string, message: string, headers?: Record<string, string | number>) => {
      sendError(res, httpStatus, code, message, opts.requestId, headers);
      done(httpStatus);
    };
    const tooLarge = () => fail(413, 'VALIDATION_FAILED', `Nội dung gửi lên vượt quá ${opts.maxBodyBytes} byte`, { connection: 'close' });

    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > opts.maxBodyBytes) return tooLarge();

    const useHttps = upstream.protocol === 'https:';
    const upReq = (useHttps ? https : http).request({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: `${upstream.basePath}${pathAndQuery}`,
      headers: buildUpstreamHeaders(req, upstream, opts),
      agent: useHttps ? opts.agents.https : opts.agents.http,
      timeout: opts.timeoutMs,
    }, (upRes) => {
      status = upRes.statusCode ?? 502;
      res.statusCode = status;
      if (upRes.statusMessage) res.statusMessage = upRes.statusMessage;
      for (const [name, value] of Object.entries(upRes.headers)) {
        if (value === undefined || DROP_FROM_UPSTREAM(name)) continue;
        res.setHeader(name, name === 'vary' ? (mergeVary(res.getHeader('vary'), value) ?? '') : value);
      }
      upRes.on('error', () => { res.destroy(); done(status); });
      upRes.on('end', () => done(status));
      upRes.pipe(res);
    });

    upReq.on('timeout', () => upReq.destroy(new UpstreamTimeoutError()));
    upReq.on('error', (err) => {
      if (err instanceof BodyTooLargeError) return tooLarge();
      if (res.headersSent) { res.destroy(); return done(status); }
      // Không nêu tên service hay nguyên nhân cho client; dòng log của gateway đã có service và mã 503.
      fail(503, 'SERVICE_UNAVAILABLE', 'Hệ thống đang bận, vui lòng thử lại sau ít phút', { 'retry-after': 5 });
    });

    // Client bỏ giữa chừng (đóng tab, mất mạng) thì hủy luôn yêu cầu phía sau.
    res.on('close', () => { if (!res.writableFinished) { upReq.destroy(); done(status || 499); } });

    const hasBody = req.headers['transfer-encoding'] !== undefined || declared > 0;
    if (!hasBody) { upReq.end(); return; }
    let received = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        cb(received > opts.maxBodyBytes ? new BodyTooLargeError() : null, chunk);
      },
    });
    limit.on('error', (err) => upReq.destroy(err));
    req.on('error', (err) => upReq.destroy(err));
    req.pipe(limit).pipe(upReq);
  });
}
