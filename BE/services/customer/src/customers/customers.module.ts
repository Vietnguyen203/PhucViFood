import { Module } from '@nestjs/common';
import { INTERNAL_API_KEY, InternalKeyGuard } from '@phucvi/shared-library/auth';
import { OrderingClient } from '../clients/ordering.client';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { SegmentSettingsService } from '../settings/segment-settings.service';
import { AdminCustomersController, InternalCustomersController, SettingsController } from './customers.controller';
import { CustomersService } from './customers.service';
import { ExportLogsService, ExportService } from './export.service';

@Module({
  controllers: [InternalCustomersController, AdminCustomersController, SettingsController],
  providers: [
    CustomersService, ExportService, ExportLogsService, SegmentSettingsService, OrderingClient, InternalKeyGuard,
    { provide: INTERNAL_API_KEY, useFactory: (config: AppConfig) => config.internalApiKey, inject: [APP_CONFIG] },
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
