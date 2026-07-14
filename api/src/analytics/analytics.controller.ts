import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Contexto ANALYTICS/RPC — leituras agregadas e operações via funções SECURITY DEFINER.
// Proxy GENÉRICO com WHITELIST: só nomes conhecidos rodam; cada RPC já revalida admin/escopo
// internamente (is_crasto_admin / owner-only). asUser dá o contexto do usuário. Named-args + validação.
const ALLOWED = new Set<string>([
  // admin
  'admin_clients', 'admin_overview', 'admin_client_pnl', 'admin_costs_by_provider', 'admin_support_hours',
  'admin_commissions', 'admin_module_clients', 'admin_health_config', 'admin_set_health_config',
  'admin_console_overview', 'admin_health_check', 'admin_llm_models', 'admin_set_default_model',
  'admin_access_list', 'admin_set_user_role', 'admin_user_access', 'admin_set_user_access',
  'admin_audit_log', 'admin_audit_record', 'admin_brain_list', 'admin_brain_upsert', 'admin_brain_delete',
  'admin_rules_list', 'admin_rule_upsert', 'admin_rule_delete', 'admin_skills_list', 'admin_skill_upsert', 'admin_skill_delete',
  // cliente / parceiro
  'client_support_hours', 'connector_commissions', 'reveal_module_secret',
  // settings
  'business_settings',
]);

@Controller('analytics')
@UseGuards(JwtOrgGuard)
export class AnalyticsController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  private setCache = new Map<string, boolean>();

  private async isSet(c: any, name: string): Promise<boolean> {
    if (this.setCache.has(name)) return this.setCache.get(name)!;
    const s = (await c.query(`select bool_or(proretset) s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name])).rows[0]?.s === true;
    this.setCache.set(name, s);
    return s;
  }

  @Post('rpc')
  async call(@Req() req: any, @Body() b: any) {
    const name = String(b?.name || '');
    if (!ALLOWED.has(name)) throw new ForbiddenException('rpc não permitido');
    const params = b?.params && typeof b.params === 'object' ? b.params : {};
    const keys = Object.keys(params).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    const args = keys.map((k, i) => `"${k}" => $${i + 1}`).join(', ');
    const vals = keys.map((k) => (params[k] !== null && typeof params[k] === 'object' && !Array.isArray(params[k]) ? JSON.stringify(params[k]) : params[k]));
    return this.db.asUser(this.uid(req), async (c) => {
      const setr = await this.isSet(c, name);
      if (setr) return (await c.query(`select coalesce(json_agg(t), '[]'::json) as r from public.${name}(${args}) t`, vals)).rows[0].r;
      return (await c.query(`select public.${name}(${args}) as r`, vals)).rows[0]?.r ?? null;
    });
  }
}
