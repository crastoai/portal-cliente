import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CrmController } from './crm.controller';

@Module({
  imports: [CommonModule],
  controllers: [CrmController],
})
export class CrmModule {}
