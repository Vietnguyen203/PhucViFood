import { DynamicModule, Module } from '@nestjs/common';
import { createHealthController } from '@phucvi/shared-library/api';
import { AuthGuardsModule } from '@phucvi/shared-library/auth';
import { MessagingModule } from '@phucvi/shared-library/messaging';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { BannersModule } from './banners/banners.module';
import { CreatorsModule } from './creators/creators.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { ProductsModule } from './products/products.module';
import { StockModule } from './stock/stock.module';
import { UploadsModule } from './uploads/uploads.module';

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
          serviceName: 'catalog',
          rabbitUrl: config.rabbitUrl,
          prismaToken: PrismaService,
          outboxSchemas: ['catalog'],
          inboxSchemas: ['catalog'],
          relay: { enabled: config.relayEnabled },
        }),
        ProductsModule,
        StockModule,
        UploadsModule,
        BannersModule,
        CreatorsModule,
      ],
      controllers: [createHealthController('catalog') as never],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
      global: true,
    };
  }
}
