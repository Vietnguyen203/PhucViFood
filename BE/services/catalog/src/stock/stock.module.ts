import { Module } from '@nestjs/common';
import { INTERNAL_API_KEY, InternalKeyGuard } from '@phucvi/shared-library/auth';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { InternalStockController, StockAdminController } from './stock.controller';
import { StockConsumer } from './stock.consumer';
import { MovementsService, StockService } from './stock.service';

@Module({
  controllers: [InternalStockController, StockAdminController],
  providers: [
    StockService, MovementsService, StockConsumer, InternalKeyGuard,
    { provide: INTERNAL_API_KEY, useFactory: (config: AppConfig) => config.internalApiKey, inject: [APP_CONFIG] },
  ],
  exports: [StockService],
})
export class StockModule {}
