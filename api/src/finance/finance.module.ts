import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { FinanceController } from './finance.controller';
import { AiCostSyncService } from './ai-cost-sync.service';

@Module({
  imports: [CommonModule],
  controllers: [FinanceController],
  providers: [AiCostSyncService],
})
export class FinanceModule {}
