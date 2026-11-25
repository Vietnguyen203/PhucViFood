import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
    // Test tích hợp dùng chung một database nên chạy tuần tự.
    fileParallelism: false,
  },
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
  },
});
