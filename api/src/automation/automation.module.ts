import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AutomationController } from './automation.controller';
import { AutomationPublicController } from './automation.public.controller';
import { AutomationEngineService } from './automation.engine';
import { AutomationScheduler } from './automation.scheduler';

@Module({
  imports: [CommonModule],
  controllers: [AutomationController, AutomationPublicController],
  providers: [AutomationEngineService, AutomationScheduler],
})
export class AutomationModule {}
