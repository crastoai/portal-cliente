import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DeliveryController } from './delivery.controller';

@Module({
  imports: [CommonModule],
  controllers: [DeliveryController],
})
export class DeliveryModule {}
