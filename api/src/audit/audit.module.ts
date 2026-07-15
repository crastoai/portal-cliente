import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AuditController } from './audit.controller';

@Module({
  imports: [CommonModule],
  controllers: [AuditController],
})
export class AuditModule {}
