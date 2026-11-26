/** Phần của Web Storage mà ứng dụng dùng (để test thay bằng bộ nhớ giả). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Bộ nhớ trong tiến trình, dùng khi localStorage không dùng được (chế độ riêng tư, bị chặn) và trong test. */
export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
}

/**
 * localStorage nhưng không bao giờ ném lỗi: truy cập có thể bị chặn hoặc đầy. Hỏng thì rơi về bộ nhớ trong,
 * giao diện vẫn chạy (chỉ không nhớ qua lần tải lại).
 */
export function safeStorage(): KeyValueStore {
  const fallback = new MemoryStore();
  const native = (() => {
    try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
  })();
  return {
    getItem(key) { try { return native ? native.getItem(key) : fallback.getItem(key); } catch { return fallback.getItem(key); } },
    setItem(key, value) { try { if (native) native.setItem(key, value); else fallback.setItem(key, value); } catch { fallback.setItem(key, value); } },
    removeItem(key) { try { native?.removeItem(key); } catch { /* bỏ qua */ } fallback.removeItem(key); },
  };
}
