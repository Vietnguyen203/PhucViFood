import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Test đơn vị cho lớp thư viện (src/lib): chạy trong Node, không cần trình duyệt. Tách khỏi vite.config.ts để không nạp các plugin Figma Make.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
