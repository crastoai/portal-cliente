import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [CommonModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
