import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { AppModule } from './app.module';
import { loadConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const config = loadConfig(); // dừng ngay nếu thiếu hoặc sai cấu hình
  const app = await NestFactory.create(AppModule.forRoot(config));
  setupApp(app, { globalPrefix: 'api' });
  app.enableCors({ origin: config.corsOrigins });
  await app.listen(config.port);
  new Logger('Bootstrap').log(`Service catalog chạy tại http://localhost:${config.port}/api`);
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
