import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';
import { AutomationEngineService } from './automation.engine';

// Bounded context AUTOMATION (schema automation) — integrações/chaves. ADMIN-ONLY:
// AdminGuard barra não-admin (403); as RPCs (security-definer) revalidam is_crasto_admin.
@Controller('automation')
@UseGuards(JwtOrgGuard, AdminGuard)
export class AutomationController {
  constructor(private readonly db: RlsDbService, private readonly engine: AutomationEngineService) {}
  private uid(req: any): string { return req.user.id; }

  // ── Motor de automações (B3+B4) ──
  @Get('rules') rules() { return this.engine.listRules(); }
  @Post('rules') saveRule(@Body() b: any) { return this.engine.saveRule(b); }
  @Get('reminders/:org') reminders(@Param('org') org: string) { return this.engine.remindersByOrg(org); }
  @Post('reminders') createReminder(@Req() req: any, @Body() b: any) { return this.engine.createReminder(b, this.uid(req)); }
  @Post('reminders/:id/cancel') cancelReminder(@Param('id') id: string) { return this.engine.cancelReminder(id); }
  @Post('run-now') runNow() { return this.engine.runDispatch(); }

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

  // Só as instâncias DO PORTAL (registro automation.wa_instances) — a Evolution é compartilhada
  // com os clientes; nunca mostrar as instâncias deles aqui.
  @Get('whatsapp/instances')
  async waList(@Req() req: any) {
    const cfg = await this.evoCfg(req);
    const evo = await this.evoCall(cfg, '/instance/fetchInstances');
    const reg: any[] = (await this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_wa_instances() as r')).rows[0]?.r)) || [];
    const mine = new Set(reg.map((x: any) => x.name));
    const raw: any[] = Array.isArray((evo as any)?.data) ? (evo as any).data : [];
    const items = raw
      .map((it: any) => { const i = it.instance || it; return { name: i.instanceName || i.name || i.id || '', state: i.state || i.connectionStatus || i.status || 'unknown' }; })
      .filter((x: any) => x.name && mine.has(x.name));
    // registradas que a Evolution ainda não devolveu (ex.: recém-criada) → aparecem como aguardando
    for (const r of reg) if (!items.find((x: any) => x.name === r.name)) items.push({ name: r.name, state: 'unknown' });
    return { ok: true, data: items };
  }

  @Post('whatsapp/instances')
  async waCreate(@Req() req: any, @Body() b: any) {
    const name = String(b?.name || '').trim();
    if (!name) return { ok: false, error: 'Informe o nome da instância.' };
    if (!/^[a-zA-Z0-9 _-]{2,60}$/.test(name)) return { ok: false, error: 'Nome inválido (2–60, letras/números/espaço/_/-).' };
    const r = await this.evoCall(await this.evoCfg(req), '/instance/create', 'POST', { instanceName: name, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    if ((r as any)?.ok) { try { await this.db.asUser(this.uid(req), async (c) => c.query('select public.admin_wa_instance_add($1,$2)', [name, name])); } catch { /* registro é best-effort */ } }
    return r;
  }

  @Get('whatsapp/instances/:name/connect')
  async waConnect(@Req() req: any, @Param('name') name: string) { return this.evoCall(await this.evoCfg(req), `/instance/connect/${encodeURIComponent(name)}`); }

  @Get('whatsapp/instances/:name/state')
  async waState(@Req() req: any, @Param('name') name: string) { return this.evoCall(await this.evoCfg(req), `/instance/connectionState/${encodeURIComponent(name)}`); }

  @Delete('whatsapp/instances/:name')
  async waDelete(@Req() req: any, @Param('name') name: string) {
    const r = await this.evoCall(await this.evoCfg(req), `/instance/delete/${encodeURIComponent(name)}`, 'DELETE');
    try { await this.db.asUser(this.uid(req), async (c) => c.query('select public.admin_wa_instance_remove($1)', [name])); } catch { /* best-effort */ }
    return r;
  }
}
