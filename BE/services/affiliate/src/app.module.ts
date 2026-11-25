import { DynamicModule, Module } from '@nestjs/common';
import { createHealthController } from '@phucvi/shared-library/api';
import { AuthGuardsModule } from '@phucvi/shared-library/auth';
import { MessagingModule } from '@phucvi/shared-library/messaging';
import { AffiliatesModule } from './affiliates/affiliates.module';
import { CommissionsModule } from './commissions/commissions.module';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { LinksModule } from './links/links.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { ReferralModule } from './referral/referral.module';
import { TrackingModule } from './tracking/tracking.module';

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
          serviceName: 'affiliate',
          rabbitUrl: config.rabbitUrl,
          prismaToken: PrismaService,
          outboxSchemas: ['affiliate', 'commission'],
          inboxSchemas: ['commission'],
          relay: { enabled: config.relayEnabled },
        }),
        AffiliatesModule,
        LinksModule,
        ReferralModule,
        TrackingModule,
        CommissionsModule,
      ],
      controllers: [createHealthController('affiliate') as never],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
      global: true,
    };
  }
}
