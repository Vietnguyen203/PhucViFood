import { DynamicModule, Module } from '@nestjs/common';
import { createHealthController } from '@phucvi/shared-library/api';
import { AuthGuardsModule } from '@phucvi/shared-library/auth';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { PrismaModule } from './prisma/prisma.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({})
export class AppModule {
  /** Truyền cấu hình đã kiểm tra vào, để test có thể dựng app với cấu hình riêng. */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [PrismaModule, AuthGuardsModule.forRoot(config.jwt), TrackingModule],
      controllers: [createHealthController('tracking') as never],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
      global: true,
    };
  }
}
