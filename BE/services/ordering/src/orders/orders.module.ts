import { Module } from '@nestjs/common';
import { INTERNAL_API_KEY, InternalKeyGuard } from '@phucvi/shared-library/auth';
import { AffiliateClient, CatalogClient, CustomerClient } from '../clients/clients';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { SettingsService } from '../settings/settings.service';
import { OrderStatsService } from '../stats/order-stats.service';
import { CustomerStatsController, InternalOrdersController } from '../stats/stats.controller';
import { AdminOrdersController, AffiliateOrdersController, PublicOrdersController } from './orders.controller';
import { OrderExpiryService } from './order-expiry.service';
import { OrderPlacementService } from './order-placement.service';
import { AffiliateOrdersService, OrdersService } from './orders.service';

@Module({
  controllers: [PublicOrdersController, AdminOrdersController, AffiliateOrdersController, CustomerStatsController, InternalOrdersController],
  providers: [
    OrderPlacementService, OrdersService, AffiliateOrdersService, SettingsService, OrderStatsService, OrderExpiryService,
    CatalogClient, AffiliateClient, CustomerClient, InternalKeyGuard,
    { provide: INTERNAL_API_KEY, useFactory: (config: AppConfig) => config.internalApiKey, inject: [APP_CONFIG] },
  ],
  exports: [OrdersService, OrderExpiryService],
})
export class OrdersModule {}
