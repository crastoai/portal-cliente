import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [CommonModule],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
