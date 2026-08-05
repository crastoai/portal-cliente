import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { PsiqueService } from './psique.service';

// PSIQUÊ (cliente) — endpoints que o PRÓPRIO cliente usa. Só JwtOrgGuard (sem AdminGuard): o
// recomendador do Catálogo é acionado pelo cliente. Não expõe dado de outra org (só chama a IA).
@Controller('psique')
@UseGuards(JwtOrgGuard)
export class PsiqueClientController {
  constructor(private readonly psique: PsiqueService) {}

  // "Amplie sua operação" — o cliente descreve a necessidade, a IA (DeepSeek) recomenda a solução.
  // NUNCA devolve preço (o valor é definido em reunião). Falha → mensagem clara, sem quebrar a tela.
  @Post('recomendar')
  async recomendar(@Body() b: any) {
    try { return await this.psique.recomendar(String(b?.texto || '')); }
    catch (e: any) { return { error: String(e?.message || 'não foi possível recomendar agora') }; }
  }
}
