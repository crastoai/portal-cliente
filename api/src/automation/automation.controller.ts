import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context AUTOMATION (schema automation) — integrações/chaves. ADMIN-ONLY:
// AdminGuard barra não-admin (403); as RPCs (security-definer) revalidam is_crasto_admin.
@Controller('automation')
@UseGuards(JwtOrgGuard, AdminGuard)
export class AutomationController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }

  @Get('integrations')
  list(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select key,display_name,status from automation.integrations order by display_name')).rows); }
  @Get('integrations/status')
  status(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_integrations_status() as r')).rows[0]?.r); }
  @Post('integrations/configure')
  configure(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_set_integration($1,$2,$3,$4) as r', [b.key, b.secret, b.from, b.status])).rows[0]?.r); }
  @Get('integrations/:key/config')
  config(@Req() req: any, @Param('key') key: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_integration_config($1) as r', [key])).rows[0]?.r); }
  @Post('integrations/save')
  saveConfig(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_save_integration($1) as r', [b])).rows[0]?.r); }

  // ── WhatsApp (Evolution API) — gerenciador de instâncias do Portal ──────────────────────
  // Config (url+key global) vem da RPC security-definer reveal_evolution_global(). O Portal
  // apenas PROXY: criar instância (nome), gerar QR, ver estado, listar, excluir. Admin-only.
  private async evoCfg(req: any): Promise<{ url: string; key: string }> {
    const cfg = await this.db.asUser(this.uid(req), async (c) => (await c.query('select public.reveal_evolution_global() as r')).rows[0]?.r);
    if (!cfg?.url || !cfg?.key) throw new Error('Evolution não configurada');
    return cfg;
  }
  private async evoCall(cfg: { url: string; key: string }, path: string, method = 'GET', body?: any) {
    try {
      const res = await fetch(`${cfg.url}${path}`, { method, headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      let data: any; try { data = JSON.parse(text); } catch { data = text; }
      return res.ok ? { ok: true, data } : { ok: false, status: res.status, error: data };
    } catch (e: any) { return { ok: false, error: e?.message || 'falha ao chamar a Evolution' }; }
  }

  @Get('whatsapp/instances')
  async waList(@Req() req: any) { return this.evoCall(await this.evoCfg(req), '/instance/fetchInstances'); }

  @Post('whatsapp/instances')
  async waCreate(@Req() req: any, @Body() b: any) {
    const name = String(b?.name || '').trim();
    if (!name) return { ok: false, error: 'Informe o nome da instância.' };
    if (!/^[a-zA-Z0-9 _-]{2,60}$/.test(name)) return { ok: false, error: 'Nome inválido (2–60, letras/números/espaço/_/-).' };
    return this.evoCall(await this.evoCfg(req), '/instance/create', 'POST', { instanceName: name, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
  }

  @Get('whatsapp/instances/:name/connect')
  async waConnect(@Req() req: any, @Param('name') name: string) { return this.evoCall(await this.evoCfg(req), `/instance/connect/${encodeURIComponent(name)}`); }

  @Get('whatsapp/instances/:name/state')
  async waState(@Req() req: any, @Param('name') name: string) { return this.evoCall(await this.evoCfg(req), `/instance/connectionState/${encodeURIComponent(name)}`); }

  @Delete('whatsapp/instances/:name')
  async waDelete(@Req() req: any, @Param('name') name: string) { return this.evoCall(await this.evoCfg(req), `/instance/delete/${encodeURIComponent(name)}`, 'DELETE'); }
}
