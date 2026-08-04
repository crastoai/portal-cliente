import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DeliveryController } from './delivery.controller';
import { WacrmMetricsService } from './wacrm-metrics.service';

@Module({
  imports: [CommonModule],
  controllers: [DeliveryController],
  providers: [WacrmMetricsService],
})
export class DeliveryModule {}
