import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AutomationController } from './automation.controller';

@Module({
  imports: [CommonModule],
  controllers: [AutomationController],
})
export class AutomationModule {}
