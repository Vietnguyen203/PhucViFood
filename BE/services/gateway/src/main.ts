import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { AppModule } from './app.module';
import { loadConfig } from './config/app-config';
import { configureGateway } from './gateway';

async function bootstrap(): Promise<void> {
  const config = loadConfig(); // dừng ngay nếu cấu hình sai
  // Tắt bộ đọc body của Nest: gateway chuyển tiếp nội dung dạng stream, không tự đọc.
  const app = await NestFactory.create(AppModule.forRoot(config), { bodyParser: false });
  setupApp(app, { globalPrefix: 'api' });
  configureGateway(app, config);
  await app.listen(config.port);
  new Logger('Bootstrap').log(`Gateway chạy tại http://localhost:${config.port}/api`);
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
