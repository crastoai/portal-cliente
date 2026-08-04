import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PsiqueController } from './psique.controller';
import { PsiqueService } from './psique.service';
import { JulieLlmService } from '../assistant/julie-llm.service';

// PSIQUÊ — inteligência do Cockpit (roda no DeepSeek). CommonModule dá RlsDbService/guards.
// JulieLlmService só depende de RlsDbService (chave do cofre), então é provido aqui direto.
@Module({ imports: [CommonModule], controllers: [PsiqueController], providers: [PsiqueService, JulieLlmService] })
export class PsiqueModule {}
