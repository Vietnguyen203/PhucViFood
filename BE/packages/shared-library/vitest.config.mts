import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 20_000,
  },
  esbuild: {
    // Cho phép decorator của NestJS/class-validator trong test (không phát metadata, nên luôn dùng @Inject tường minh).
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
  },
});
