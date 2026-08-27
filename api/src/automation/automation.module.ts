import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AutomationController } from './automation.controller';
import { AutomationPublicController } from './automation.public.controller';
import { AutomationEngineService } from './automation.engine';
import { AutomationScheduler } from './automation.scheduler';
import { GoogleMeetService } from './google-meet.service';
import { IntegrationsGoogleController, IntegrationsGooglePublicController } from './integrations-google.controller';

@Module({
  imports: [CommonModule],
  controllers: [AutomationController, AutomationPublicController, IntegrationsGoogleController, IntegrationsGooglePublicController],
  providers: [AutomationEngineService, AutomationScheduler, GoogleMeetService],
})
export class AutomationModule {}
