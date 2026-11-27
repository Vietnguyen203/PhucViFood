import { describe, expect, it } from 'vitest';
import { detectImageType, UPLOAD_NAME_RE, UPLOAD_URL_RE } from '../../src/uploads/image-files';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);

describe('nhận dạng ảnh theo byte đầu', () => {
  it('PNG, JPEG, WebP', () => {
    expect(detectImageType(PNG)).toEqual({ ext: 'png', mime: 'image/png' });
    expect(detectImageType(JPG)).toEqual({ ext: 'jpg', mime: 'image/jpeg' });
    expect(detectImageType(WEBP)).toEqual({ ext: 'webp', mime: 'image/webp' });
  });
  it('không phải ảnh: văn bản, HTML, SVG, GIF, rỗng, quá ngắn', () => {
    for (const b of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', '<html><script>1</script>', 'GIF89a......', '', 'abc']) {
      expect(detectImageType(Buffer.from(b)), b).toBeNull();
    }
    expect(detectImageType(Buffer.from('RIFF\u0001\u0002\u0003\u0004WAVEfmt '))).toBeNull(); // RIFF nhưng không phải WebP
  });
});

describe('tên tệp và đường dẫn ảnh', () => {
  const id = '0190f4a2-7b3c-7d1e-9a2b-3c4d5e6f7a8b';
  it('chỉ nhận UUID + png|jpg|webp', () => {
    for (const ext of ['png', 'jpg', 'webp']) {
      expect(UPLOAD_NAME_RE.test(`${id}.${ext}`)).toBe(true);
      expect(UPLOAD_URL_RE.test(`/api/public/uploads/${id}.${ext}`)).toBe(true);
    }
  });
  it('chặn đường dẫn lạ, thoát thư mục, đuôi lạ', () => {
    for (const v of [`../${id}.png`, `${id}.svg`, `${id}.png/..`, 'abc.png', `${id}.PNG`, `/etc/passwd`, `${id}.png\n`, `x/${id}.png`]) {
      expect(UPLOAD_NAME_RE.test(v), v).toBe(false);
    }
    for (const v of [`/api/public/uploads/../${id}.png`, `/api/public/uploads/${id}.exe`, `https://x.vn/api/public/uploads/${id}.png`, `/api/public/uploads/${id}.png?x=1`]) {
      expect(UPLOAD_URL_RE.test(v), v).toBe(false);
    }
  });
});
