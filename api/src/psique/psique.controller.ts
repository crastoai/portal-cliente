import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';
import { PsiqueService } from './psique.service';

// PSIQUÊ — endpoints ADMIN (AdminGuard barra não-admin). O baseline é escrito só pela Crasto.AI
// (no onboarding); o cliente apenas LÊ o "antes" no Cockpit (via RLS client_read).
@Controller('psique')
@UseGuards(JwtOrgGuard, AdminGuard)
export class PsiqueController {
  constructor(private readonly psique: PsiqueService, private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  private async adminName(uid: string): Promise<string | null> {
    return this.db.asService(async (c) => (await c.query(`select full_name from public.profiles where id=$1`, [uid])).rows[0]?.full_name ?? null);
  }

  // Extrai o baseline ("antes") de um texto/transcrição via DeepSeek e grava.
  @Post('baseline/extract')
  async extract(@Req() req: any, @Body() b: any) {
    const org = String(b?.organization_id || '');
    if (!org) return { error: 'organization_id obrigatório' };
    const name = await this.adminName(this.uid(req));
    try {
      const r = await this.psique.extrairBaseline(org, String(b?.texto || ''), String(b?.fonte || 'reunião'), { baselineDate: b?.baseline_date || null, createdBy: this.uid(req), createdByName: name });
      this.psique.gerarNarrativa(org, { force: true }).catch(() => {}); // baseline mudou → renova a narrativa
      return r;
    } catch (e: any) { return { error: String(e?.message || 'falha ao extrair') }; }
  }

  // Salva o baseline manualmente (métricas digitadas pelo admin).
  @Post('baseline/save')
  async save(@Req() req: any, @Body() b: any) {
    const org = String(b?.organization_id || '');
    if (!org) return { error: 'organization_id obrigatório' };
    const name = await this.adminName(this.uid(req));
    const r = await this.psique.salvarManual(org, Array.isArray(b?.metrics) ? b.metrics : [], String(b?.fonte || 'manual'), { baselineDate: b?.baseline_date || null, createdBy: this.uid(req), createdByName: name });
    this.psique.gerarNarrativa(org, { force: true }).catch(() => {}); // baseline mudou → renova a narrativa
    return r;
  }

  // Baseline vigente de uma org (admin confere/edita).
  @Get('baseline/:org')
  list(@Param('org') org: string) { return this.psique.listar(org); }

  // Gera/regenera a narrativa do Cockpit ("regerar agora"). force=true por padrão.
  @Post('narrative/generate/:org')
  async narrative(@Param('org') org: string, @Query('force') force: string) {
    try { return await this.psique.gerarNarrativa(org, { force: force !== 'false' }); }
    catch (e: any) { return { error: String(e?.message || 'falha ao gerar narrativa') }; }
  }
}
