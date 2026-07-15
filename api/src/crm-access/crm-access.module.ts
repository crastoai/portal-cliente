import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CrmAccessController } from './crm-access.controller';
import { CrmAccessService } from './crm-access.service';

@Module({
  imports: [CommonModule],
  controllers: [CrmAccessController],
  providers: [CrmAccessService],
})
export class CrmAccessModule {}
