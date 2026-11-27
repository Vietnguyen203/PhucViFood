import { Module } from '@nestjs/common';
import { ProductImagesController, PublicUploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [ProductImagesController, PublicUploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
