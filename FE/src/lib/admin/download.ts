/** Tên file từ header Content-Disposition (hỗ trợ filename="..." và filename*=UTF-8''...). Không có thì dùng tên mặc định. */
export function parseFileName(contentDisposition: string | null | undefined, fallback = 'khach-hang.xlsx'): string {
  const cd = contentDisposition ?? '';
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  if (star) { try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch { /* rơi xuống dạng thường */ } }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : fallback;
}
