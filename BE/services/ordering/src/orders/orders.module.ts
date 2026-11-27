import { Module } from '@nestjs/common';
import { INTERNAL_API_KEY, InternalKeyGuard } from '@phucvi/shared-library/auth';
import { AffiliateClient, CatalogClient, CustomerClient } from '../clients/clients';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { OrderSettingsController } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';
import { AdminStatsService } from '../stats/admin-stats.service';
import { OrderStatsService } from '../stats/order-stats.service';
import { CustomerStatsController, InternalOrdersController } from '../stats/stats.controller';
import { AdminOrdersController, AffiliateOrdersController, MyOrdersController, PublicOrdersController } from './orders.controller';
import { OrderExpiryService } from './order-expiry.service';
import { OrderPlacementService } from './order-placement.service';
import { AffiliateOrdersService, MyOrdersService, OrdersService } from './orders.service';

@Module({
  controllers: [PublicOrdersController, AdminOrdersController, AffiliateOrdersController, MyOrdersController, CustomerStatsController, InternalOrdersController, OrderSettingsController],
  providers: [
    AdminStatsService,
    OrderPlacementService, OrdersService, AffiliateOrdersService, MyOrdersService, SettingsService, OrderStatsService, OrderExpiryService,
    CatalogClient, AffiliateClient, CustomerClient, InternalKeyGuard,
    { provide: INTERNAL_API_KEY, useFactory: (config: AppConfig) => config.internalApiKey, inject: [APP_CONFIG] },
  ],
  exports: [OrdersService, OrderExpiryService],
})
export class OrdersModule {}
