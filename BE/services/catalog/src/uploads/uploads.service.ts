import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import type { Request } from 'express';
import type { Readable } from 'node:stream';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { detectImageType, IMAGE_MIMES, MAX_IMAGE_BYTES, MIME_BY_EXT, UPLOAD_NAME_RE, UPLOAD_PUBLIC_PREFIX } from './image-files';

/** Đọc thân yêu cầu tối đa `max` byte; vượt thì dừng đọc và báo lỗi (không nạp hết vào bộ nhớ). */
async function readLimited(req: Readable, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > max) throw AppException.validation([{ field: 'body', messages: [`Ảnh quá lớn, tối đa ${Math.floor(max / 1024)} KB`] }]);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** Lưu ảnh sản phẩm trên đĩa (thư mục UPLOAD_DIR) và phục vụ lại. Tên tệp do hệ thống sinh nên không có đường dẫn từ người dùng. */
@Injectable()
export class UploadsService {
  private ready: Promise<unknown> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private dir(): Promise<unknown> {
    return (this.ready ??= mkdir(this.config.uploadDir, { recursive: true }));
  }

  /** Nhận ảnh thô (PNG, JPEG, WebP) trong thân yêu cầu; trả đường dẫn công khai của ảnh. */
  async save(req: Request): Promise<{ url: string; size: number; contentType: string }> {
    const declared = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!(IMAGE_MIMES as readonly string[]).includes(declared)) {
      throw AppException.validation([{ field: 'content-type', messages: ['Chỉ nhận ảnh PNG, JPEG hoặc WebP'] }]);
    }
    const length = Number(req.headers['content-length']);
    if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) throw AppException.validation([{ field: 'body', messages: [`Ảnh quá lớn, tối đa ${Math.floor(MAX_IMAGE_BYTES / 1024)} KB`] }]);
    const body = await readLimited(req, MAX_IMAGE_BYTES);
    if (body.length === 0) throw AppException.validation([{ field: 'body', messages: ['Chưa có dữ liệu ảnh'] }]);
    const type = detectImageType(body);
    if (!type || type.mime !== declared) {
      throw AppException.validation([{ field: 'body', messages: ['Tệp không phải ảnh hợp lệ (PNG, JPEG hoặc WebP)'] }]);
    }
    await this.dir();
    const name = `${randomUUID()}.${type.ext}`;
    await writeFile(join(this.config.uploadDir, name), body, { flag: 'wx' });
    return { url: `${UPLOAD_PUBLIC_PREFIX}${name}`, size: body.length, contentType: type.mime };
  }

  /** Mở luồng đọc ảnh theo tên; tên không đúng dạng hoặc không có tệp thì 404. */
  async open(name: string): Promise<{ stream: Readable; size: number; contentType: string }> {
    if (!UPLOAD_NAME_RE.test(name)) throw AppException.notFound('Không tìm thấy ảnh');
    const file = join(this.config.uploadDir, name);
    let info;
    try { info = await stat(file); } catch { throw AppException.notFound('Không tìm thấy ảnh'); }
    return { stream: createReadStream(file), size: info.size, contentType: MIME_BY_EXT[name.split('.').pop()!] };
  }
}
