import { DynamicModule, Module } from '@nestjs/common';
import { createHealthController } from '@phucvi/shared-library/api';
import { AuthGuardsModule } from '@phucvi/shared-library/auth';
import { MessagingModule } from '@phucvi/shared-library/messaging';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { CustomersModule } from './customers/customers.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

@Module({})
export class AppModule {
  /** Truyền cấu hình đã kiểm tra vào, để test có thể dựng app với cấu hình riêng. */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PrismaModule,
        AuthGuardsModule.forRoot(config.jwt),
        MessagingModule.forRoot({
          serviceName: 'customer',
          rabbitUrl: config.rabbitUrl,
          prismaToken: PrismaService,
          outboxSchemas: ['customer'],
          inboxSchemas: ['customer'],
          relay: { enabled: config.relayEnabled },
        }),
        CustomersModule,
      ],
      controllers: [createHealthController('customer') as never],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
      global: true,
    };
  }
}
