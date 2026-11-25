import { Module } from '@nestjs/common';
import { AffiliateClient, CatalogClient, CustomerClient } from '../clients/clients';
import { SettingsService } from '../settings/settings.service';
import { AdminOrdersController, AffiliateOrdersController, PublicOrdersController } from './orders.controller';
import { OrderPlacementService } from './order-placement.service';
import { AffiliateOrdersService, OrdersService } from './orders.service';

@Module({
  controllers: [PublicOrdersController, AdminOrdersController, AffiliateOrdersController],
  providers: [
    OrderPlacementService, OrdersService, AffiliateOrdersService, SettingsService,
    CatalogClient, AffiliateClient, CustomerClient,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
