import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BillingController } from './billing.controller';

@Module({
  imports: [CommonModule],
  controllers: [BillingController],
})
export class BillingModule {}
