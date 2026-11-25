import { Module } from '@nestjs/common';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

@Module({ imports: [AffiliatesModule], controllers: [LinksController], providers: [LinksService], exports: [LinksService] })
export class LinksModule {}
