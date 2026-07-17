import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { JulieLlmService } from './julie-llm.service';

// Julie (CFO de IA) — assistente admin. CommonModule dá RlsDbService/guards.
@Module({ imports: [CommonModule], controllers: [AssistantController], providers: [AssistantService, JulieLlmService] })
export class AssistantModule {}
