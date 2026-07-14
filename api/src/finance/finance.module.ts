import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { FinanceController } from './finance.controller';

@Module({
  imports: [CommonModule],
  controllers: [FinanceController],
})
export class FinanceModule {}
