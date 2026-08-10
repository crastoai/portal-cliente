import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DeliveryController } from './delivery.controller';
import { WacrmMetricsService } from './wacrm-metrics.service';
import { KpiAiService } from './kpi-ai.service';
import { JulieLlmService } from '../assistant/julie-llm.service';

@Module({
  imports: [CommonModule],
  controllers: [DeliveryController],
  providers: [WacrmMetricsService, KpiAiService, JulieLlmService],
})
export class DeliveryModule {}
