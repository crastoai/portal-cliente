import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';
import { PsiqueService } from './psique.service';

// PSIQUÊ (cliente) — endpoints que o PRÓPRIO cliente usa. Só JwtOrgGuard (sem AdminGuard). O orgId
// vem SEMPRE do current_org_id() (JWT/RLS), nunca do cliente. Não expõe dado de outra org.
@Controller('psique')
@UseGuards(JwtOrgGuard)
export class PsiqueClientController {
  constructor(private readonly psique: PsiqueService, private readonly db: RlsDbService) {}

  private orgId(req: any): Promise<string | null> {
    return this.db.asUser(req.user.id, async (c) => (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null).catch(() => null);
  }

  // "Amplie sua operação" — o cliente descreve a necessidade, a IA (DeepSeek) recomenda a solução.
  @Post('recomendar')
  async recomendar(@Body() b: any) {
    try { return await this.psique.recomendar(String(b?.texto || '')); }
    catch (e: any) { return { error: String(e?.message || 'não foi possível recomendar agora') }; }
  }

  // Resumo IA da conversa de um LEAD (drill do card Leads). GET lê o cache (sem gastar token);
  // POST gera pelo DeepSeek (?force=1 regenera). O lead (id do contato) é escopado pela org do JWT.
  @Get('lead/:id/resumo')
  async lerResumo(@Req() req: any, @Param('id') id: string) {
    const org = await this.orgId(req);
    if (!org) return { summary: null, generated_at: null };
    const r = await this.psique.lerResumoLead(org, id);
    return { summary: r?.summary ?? null, generated_at: r?.generated_at ?? null };
  }

  @Post('lead/:id/resumo')
  async gerarResumo(@Req() req: any, @Param('id') id: string, @Query('force') force?: string) {
    const org = await this.orgId(req);
    if (!org) return { ok: false, error: 'sem organização' };
    try { return await this.psique.resumirLead(org, id, { force: force === '1' || force === 'true' }); }
    catch (e: any) { return { ok: false, error: String(e?.message || 'não foi possível gerar o resumo agora') }; }
  }
}
