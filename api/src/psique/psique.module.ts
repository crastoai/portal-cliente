import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PsiqueController } from './psique.controller';
import { PsiqueClientController } from './psique-client.controller';
import { PsiqueService } from './psique.service';
import { JulieLlmService } from '../assistant/julie-llm.service';
import { WacrmMetricsService } from '../delivery/wacrm-metrics.service';

// PSIQUÊ — inteligência do Cockpit (roda no DeepSeek). CommonModule dá RlsDbService/guards.
// JulieLlmService (chave do cofre) e WacrmMetricsService (resultados vivos) só dependem de coisas
// simples, então são providos aqui direto.
@Module({ imports: [CommonModule], controllers: [PsiqueController, PsiqueClientController], providers: [PsiqueService, JulieLlmService, WacrmMetricsService] })
export class PsiqueModule {}
