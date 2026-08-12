import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { FinanceController } from './finance.controller';
import { AiCostSyncService } from './ai-cost-sync.service';
import { ProofsController } from './proofs.controller';
import { ProofsService } from './proofs.service';

@Module({
  imports: [CommonModule],
  controllers: [FinanceController, ProofsController],
  providers: [AiCostSyncService, ProofsService],
})
export class FinanceModule {}
