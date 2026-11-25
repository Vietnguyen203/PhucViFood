import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

interface HttpReqLike { headers: Record<string, string | string[] | undefined>; id?: string }
interface HttpResLike { setHeader(name: string, value: string): unknown }

/** Gắn mã yêu cầu để truy vết log giữa gateway và các service. Nhận lại x-request-id nếu client/gateway đã gửi. */
export function requestIdMiddleware(req: HttpReqLike, res: HttpResLike, next: () => void): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  // Chỉ chấp nhận chuỗi ngắn, an toàn để ghi log và trả lại trong header.
  const id = raw && /^[\w.-]{8,64}$/.test(raw) ? raw : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

export function getRequestId(req: { id?: string } | undefined): string | undefined {
  return req?.id;
}
