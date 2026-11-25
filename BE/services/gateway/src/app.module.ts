import { DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { HealthController } from './health/health.controller';

@Module({})
export class AppModule {
  /** Truyền cấu hình đã kiểm tra vào, để test có thể dựng app với cấu hình riêng. */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
      global: true,
    };
  }
}
