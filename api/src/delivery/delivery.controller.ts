import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context DELIVERY (schema delivery). Tudo em asUser → a RLS do Portal faz o "mine"
// (própria org do cliente) e o bypass do admin, exatamente como fazia via PostgREST.
@Controller('delivery')
@UseGuards(JwtOrgGuard)
export class DeliveryController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  private set(patch: Record<string, any>, startAt: number) {
    const keys = Object.keys(patch || {}).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    return { sets: keys.map((k, i) => `"${k}"=$${startAt + i}`).join(', '), vals: keys.map((k) => patch[k]), ok: keys.length > 0 };
  }

  // `access_mode` viaja junto: é ele que diz ao front COMO abrir a instância
  // (link = nova aba, como sempre foi · embed = dentro do Portal · sso = embed com sessão própria).
  private readonly ROLLOUT = 'id,vdi_module_id,status,label,rollout_progress,rollout_due,rollout_status,access_mode';

  // ── Fase 4 · autoatendimento consolidado ────────────────────────────────
  // O org_id vem do JWT + RLS, nunca do navegador. Só depois de resolvê-lo no banco
  // consultamos o schema finance como service_role (finance não é exposto ao cliente).
  @Get('self-service/mine')
  async selfServiceMine(@Req() req: any) {
    const visible = await this.db.asUser(this.uid(req), async (c) => {
      const orgId = (await c.query('select public.current_org_id() as id')).rows[0]?.id;
      if (!orgId) return null;
      const contract = (await c.query(
        `select id,title,status,url,signed_at,created_at
           from commerce.contracts order by coalesce(signed_at,created_at) desc limit 1`,
      )).rows[0] ?? null;
      const implementation = (await c.query(
        `select status,started_at,due_date,overall_progress
           from delivery.implementations order by created_at desc limit 1`,
      )).rows[0] ?? null;
      const health = (await c.query(
        `select status,message,eta from delivery.system_health order by updated_at desc limit 1`,
      )).rows[0] ?? null;
      const services = (await c.query(
        `select id,service_name as name,service_description as description,service_category as category,status
           from delivery.client_services order by created_at`,
      )).rows;
      const modules = (await c.query(
        `select cm.id,coalesce(cm.label,m.name) as name,cm.status,cm.rollout_status,cm.rollout_progress
           from delivery.client_modules cm join catalog.vdi_modules m on m.id=cm.vdi_module_id
          order by cm.created_at`,
      )).rows;
      return { orgId, contract, implementation, health, services, modules };
    });
    if (!visible) return null;

    const privateUsage = await this.db.asService(async (c) => {
      const support = (await c.query(
        `select period,plan_hours,used_hours,balance,status
           from finance.support_hours where organization_id=$1 order by period desc limit 1`,
        [visible.orgId],
      )).rows[0] ?? null;
      const ai = (await c.query(
        `select min(period_start) as period_start,max(period_end) as period_end,
                coalesce(sum(tokens_in),0)::text as tokens_in,
                coalesce(sum(tokens_out),0)::text as tokens_out,
                count(*)::int as records
           from finance.ai_usage
          where organization_id=$1 and period_start >= date_trunc('month',current_date)::date`,
        [visible.orgId],
      )).rows[0];
      return { support, ai };
    });
    const { orgId: _orgId, ...safe } = visible;
    return { ...safe, ...privateUsage };
  }

  // ── client_modules ──
  /**
   * Soluções do cliente. Para o WhatsApp CRM devolvemos `crm_url` pronta: é a MESMA
   * URL para todo mundo (o tenant vem do login), então não é para o admin digitar por
   * cliente nem duplicar no catálogo — assim o botão "Acessar" acende sozinho no
   * instante em que o módulo é ativado, e nunca fica apontando para endereço velho.
   */
  @Get('client-modules/mine')
  cmMine(@Req() req: any) {
    const crmWeb = (process.env.CRM_WEB_URL || '').replace(/\/$/, '') || null;
    // Colunas qualificadas: com o join, `id`/`status` existem nas duas tabelas.
    const cols = this.ROLLOUT.split(',').map((k) => `cm.${k.trim()}`).join(', ');
    return this.db.asUser(this.uid(req), async (c) => (await c.query(
      `select ${cols},
              case when m.crm_solution and $1::text is not null then $1::text end as crm_url
         from delivery.client_modules cm
         join catalog.vdi_modules m on m.id = cm.vdi_module_id
        -- Sub-acesso por USUÁRIO (Fase 2): sem linhas em user_module_access = vê todos os
        -- módulos da org (padrão); com linhas = restrito exatamente a esses.
        where (not exists (select 1 from delivery.user_module_access u where u.user_id = auth.uid())
               or exists (select 1 from delivery.user_module_access u where u.user_id = auth.uid() and u.vdi_module_id = cm.vdi_module_id))
        order by cm.created_at`, [crmWeb])).rows);
  }

  // ── Permissão módulo × USUÁRIO (sub-acessos — Blueprint v1.1 Fase 2) ──────────────────────
  // Quem gerencia: o DONO da org do usuário-alvo (client_owner) ou o crasto_admin. Validado no
  // código + escrita via service_role (a tabela é RLS deny-default). Retorna a org do alvo se
  // permitido, senão null.
  private async gerenciaModulos(c: any, callerId: string, targetId: string): Promise<string | null> {
    const caller = (await c.query(`select role, organization_id from public.profiles where id=$1`, [callerId])).rows[0];
    const target = (await c.query(`select organization_id from public.profiles where id=$1`, [targetId])).rows[0];
    if (!caller || !target) return null;
    if (caller.role === 'crasto_admin') return target.organization_id;
    if (caller.role === 'client_owner' && caller.organization_id === target.organization_id) return target.organization_id;
    return null;
  }

  /** Módulos liberados para um usuário (lista de vdi_module_id). Vazio = vê TODOS. */
  @Get('user-modules')
  umaList(@Req() req: any, @Query('user') user: string) {
    return this.db.asService(async (c) => {
      if (!(await this.gerenciaModulos(c, this.uid(req), user))) return { error: 'sem permissão' };
      return (await c.query('select vdi_module_id from delivery.user_module_access where user_id=$1', [user])).rows.map((r: any) => r.vdi_module_id);
    });
  }

  /**
   * TELAS DO PORTAL de um usuário — versão do DONO da empresa.
   *
   * Existe porque `admin_set_user_access` é RPC de admin: até aqui só a Crasto.AI conseguia
   * definir telas, e o dono do cliente não tinha como dizer "meu vendedor não vê Financeiro".
   * Reusa a MESMA guarda dos módulos (`gerenciaModulos`): dono da org do alvo ou crasto_admin,
   * validado no banco — o papel de quem chama nunca vem do navegador.
   *
   * Lista vazia = sem restrição = vê tudo (é o padrão da plataforma, e a tela diz isso).
   */
  @Get('user-screens')
  usList(@Req() req: any, @Query('user') user: string) {
    return this.db.asService(async (c) => {
      if (!(await this.gerenciaModulos(c, this.uid(req), user))) return { error: 'sem permissão' };
      return (await c.query('select screen_key from public.member_screens where user_id=$1', [user])).rows.map((r: any) => r.screen_key);
    });
  }

  @Post('user-screens')
  usSet(@Req() req: any, @Body() b: any) {
    const user = String(b?.user_id || '');
    // Só chaves de tela plausíveis: nada que venha do navegador entra em query sem filtro.
    const telas: string[] = Array.isArray(b?.screens) ? b.screens.filter((x: any) => typeof x === 'string' && /^[a-z_]{2,30}$/.test(x)) : [];
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      // O DONO não se restringe nem restringe outro dono: acesso total é do papel, não da tela.
      const alvo = (await c.query('select role::text r from public.profiles where id=$1', [user])).rows[0];
      if (alvo?.r === 'client_owner') return { error: 'dono tem acesso total (não é restringível)' };
      await c.query('delete from public.member_screens where user_id=$1', [user]);
      for (const t of telas) await c.query('insert into public.member_screens (user_id, screen_key) values ($1,$2) on conflict do nothing', [user, t]);
      return { ok: true, count: telas.length };
    });
  }

  /** Substitui o conjunto de módulos de um usuário. Lista vazia = limpa = usuário vê TODOS. */
  @Post('user-modules')
  umaSet(@Req() req: any, @Body() b: any) {
    const user = String(b?.user_id || '');
    const ids: string[] = Array.isArray(b?.vdi_module_ids) ? b.vdi_module_ids.filter((x: any) => /^[0-9a-f-]{36}$/i.test(x)) : [];
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      await c.query('delete from delivery.user_module_access where user_id=$1', [user]);
      for (const mid of ids)
        await c.query('insert into delivery.user_module_access (organization_id,user_id,vdi_module_id) values ($1,$2,$3) on conflict do nothing', [org, user, mid]);
      return { ok: true, count: ids.length };
    });
  }
  @Get('client-modules/all')
  cmAll(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select organization_id from delivery.client_modules')).rows); }
  @Get('client-modules')
  cmByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.ROLLOUT} from delivery.client_modules where organization_id=$1 order by created_at`, [org])).rows); }
  @Post('client-modules')
  cmAttach(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query(`insert into delivery.client_modules (organization_id,vdi_module_id,status) values ($1,$2,'active')`, [b.organization_id, b.vdi_module_id]); return { ok: true }; }); }
  @Post('client-modules/instance')
  cmAddInstance(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query(`insert into delivery.client_modules (organization_id,vdi_module_id,status,label) values ($1,$2,'active',$3)`, [b.organization_id, b.vdi_module_id, b.label ?? null]); return { ok: true }; }); }
  @Delete('client-modules/by/:org/:module')
  cmDetach(@Req() req: any, @Param('org') org: string, @Param('module') module: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.client_modules where organization_id=$1 and vdi_module_id=$2', [org, module]); return { ok: true }; }); }
  @Delete('client-modules/:id')
  cmRemoveInstance(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.client_modules where id=$1', [id]); return { ok: true }; }); }
  @Patch('client-modules/:id/rollout')
  cmRollout(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update delivery.client_modules set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }

  // ── implementations ──
  @Get('implementation/mine')
  implMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select overall_progress,due_date,status,started_at from delivery.implementations limit 1')).rows[0] ?? null); }
  @Get('implementation')
  implByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from delivery.implementations where organization_id=$1 limit 1', [org])).rows[0] ?? null); }
  @Get('implementations/brief')
  implBrief(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select organization_id,overall_progress,status from delivery.implementations')).rows); }
  @Post('implementation/:org')
  implUpsert(@Req() req: any, @Param('org') org: string, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const ex = (await c.query('select id from delivery.implementations where organization_id=$1 limit 1', [org])).rows[0];
      const { sets, vals, ok } = this.set(b, 2);
      if (ex?.id) { if (ok) await c.query(`update delivery.implementations set ${sets} where id=$1`, [ex.id, ...vals]); }
      else {
        const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
        const ph = cols.map((_, i) => `$${i + 2}`).join(',');
        await c.query(`insert into delivery.implementations (organization_id${cols.length ? ',' + cols.map((k) => `"${k}"`).join(',') : ''}) values ($1${cols.length ? ',' + ph : ''})`, [org, ...cols.map((k) => b[k])]);
      }
      return { ok: true };
    });
  }

  // ── system_health (farol) ──
  @Get('health/mine')
  healthMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select status,message from delivery.system_health limit 1')).rows[0] ?? null); }
  @Get('health')
  healthByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select status,message from delivery.system_health where organization_id=$1 limit 1', [org])).rows[0] ?? null); }
  @Get('health/brief')
  healthBrief(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select organization_id,status from delivery.system_health')).rows); }
  @Post('health/:org')
  healthUpsert(@Req() req: any, @Param('org') org: string, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const ex = (await c.query('select id from delivery.system_health where organization_id=$1 limit 1', [org])).rows[0];
      const { sets, vals, ok } = this.set(b, 2);
      if (ex?.id) { if (ok) await c.query(`update delivery.system_health set ${sets} where id=$1`, [ex.id, ...vals]); }
      else {
        const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
        const ph = cols.map((_, i) => `$${i + 2}`).join(',');
        await c.query(`insert into delivery.system_health (organization_id${cols.length ? ',' + cols.map((k) => `"${k}"`).join(',') : ''}) values ($1${cols.length ? ',' + ph : ''})`, [org, ...cols.map((k) => b[k])]);
      }
      return { ok: true };
    });
  }

  // ── project_tasks (Gantt) ──
  @Get('tasks/mine')
  tasksMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from delivery.project_tasks order by sort_order')).rows); }
  @Get('tasks')
  tasksByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from delivery.project_tasks where organization_id=$1 order by sort_order', [org])).rows); }
  @Post('tasks')
  tasksAdd(@Req() req: any, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      await c.query(`insert into delivery.project_tasks (${cols.map((k) => `"${k}"`).join(',')}) values (${ph})`, cols.map((k) => b[k]));
      return { ok: true };
    });
  }
  @Patch('tasks/:id')
  tasksUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update delivery.project_tasks set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }
  @Delete('tasks/:id')
  tasksRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.project_tasks where id=$1', [id]); return { ok: true }; }); }

  // ── module_credentials (senha via RPC, cifrada) ──
  @Get('credentials/mine')
  credMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,label,login,sso_enabled,access_url,vdi_module_id,client_module_id from delivery.module_credentials')).rows); }
  @Get('credentials')
  credByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,label,login,sso_enabled,access_url,vdi_module_id,client_module_id from delivery.module_credentials where organization_id=$1', [org])).rows); }
  @Post('credentials/set')
  credSet(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.set_module_access($1,$2,$3,$4,$5,$6) as r', [b.clientModuleId, b.label, b.login, b.secret, b.sso, b.url ?? null])).rows[0]?.r); }
  @Delete('credentials/:id')
  credRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.module_credentials where id=$1', [id]); return { ok: true }; }); }

  /**
   * TEMPO CONECTADO da equipe (RH) — federado do wacrm, onde vive `user_sessions`. Repassa o
   * Bearer do próprio cliente (mesmo IdP): o wacrm decide o que devolver (dono vê a equipe,
   * membro vê só o próprio). Se o CRM estiver fora, devolve vazio — a tela mostra "—", não mente.
   */
  @Get('team-usage')
  async teamUsage(@Req() req: any) {
    const url = process.env.CRM_API_URL, auth = req?.headers?.authorization;
    if (!url || !auth) return { scope: 'none', rows: [] };
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/api/me/team-usage`, { headers: { Authorization: auth } });
      const j = await r.json().catch(() => ({ scope: 'none', rows: [] }));
      return j && Array.isArray(j.rows) ? j : { scope: 'none', rows: [] };
    } catch { return { scope: 'none', rows: [] }; }
  }

  // ── module_sessions (métrica de uso: quem abriu qual módulo, quando, por quanto tempo) ──
  //
  // Quem abre o módulo é o PORTAL, então é aqui que dá para medir — mesmo enquanto o destino
  // (Lovable) usa credencial compartilhada da empresa e não sabe distinguir as pessoas.
  // A org e o usuário NÃO vêm do navegador: `auth.uid()`/`current_org_id()` saem do JWT pela
  // RLS. O front só diz QUAL instância abriu; carimbar sessão no nome de outro é negado.
  @Post('module-sessions/open')
  msOpen(@Req() req: any, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query(
      `insert into delivery.module_sessions (organization_id, client_module_id, vdi_module_id, user_id, mode)
       select cm.organization_id, cm.id, cm.vdi_module_id, auth.uid(), coalesce($2, cm.access_mode, 'embed')
         from delivery.client_modules cm
        where cm.id = $1
       returning id, started_at`,
      [b.clientModuleId, b.mode ?? null],
    )).rows[0] ?? null);
  }
  // Heartbeat: aba fechada no tapa (sem `close`) ainda deixa duração aproveitável.
  @Post('module-sessions/:id/ping')
  msPing(@Req() req: any, @Param('id') id: string) {
    return this.db.asUser(this.uid(req), async (c) => {
      await c.query(`update delivery.module_sessions set last_seen_at = now() where id=$1 and ended_at is null`, [id]);
      return { ok: true };
    });
  }
  @Post('module-sessions/:id/close')
  msClose(@Req() req: any, @Param('id') id: string) {
    return this.db.asUser(this.uid(req), async (c) => {
      await c.query(`update delivery.module_sessions set ended_at = now(), last_seen_at = now() where id=$1 and ended_at is null`, [id]);
      return { ok: true };
    });
  }
  /**
   * Resumo de uso por USUÁRIO × MÓDULO. A RLS decide o alcance: cliente vê a própria
   * empresa, admin vê o que pedir. Duração usa `ended_at` quando houve fechamento limpo e
   * `last_seen_at` quando não houve — nunca "agora", que inflaria sessão abandonada.
   */
  @Get('module-sessions/summary')
  msSummary(@Req() req: any, @Query('org') org: string, @Query('dias') dias: string) {
    const d = Math.max(1, Math.min(365, Number(dias) || 30));
    return this.db.asUser(this.uid(req), async (c) => (await c.query(
      `select s.user_id, p.full_name, p.email, s.client_module_id,
              coalesce(cm.label, v.name, 'Módulo') as modulo,
              count(*)::int                                     as aberturas,
              max(s.started_at)                                 as ultimo_acesso,
              sum(extract(epoch from (coalesce(s.ended_at, s.last_seen_at) - s.started_at)))::int as segundos
         from delivery.module_sessions s
         left join public.profiles p on p.id = s.user_id
         left join delivery.client_modules cm on cm.id = s.client_module_id
         left join catalog.vdi_modules v on v.id = s.vdi_module_id
        where s.started_at > now() - ($1 || ' days')::interval
          and ($2::uuid is null or s.organization_id = $2::uuid)
        group by 1,2,3,4,5
        order by segundos desc nulls last`,
      [String(d), org || null],
    )).rows);
  }

  // ── client_services ──
  private readonly SVC = 'id,service_id,status,notes,service_name,service_description,service_category,service_unit';
  @Get('services/mine')
  svcMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.SVC} from delivery.client_services`)).rows); }
  @Get('services')
  svcByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.SVC} from delivery.client_services where organization_id=$1`, [org])).rows); }
  @Post('services')
  svcAttach(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query(`insert into delivery.client_services (organization_id,service_id,status,service_name,service_description,service_category,service_unit) values ($1,$2,'active',$3,$4,$5,$6)`, [b.organization_id, b.service_id, b.service_name ?? null, b.service_description ?? null, b.service_category ?? null, b.service_unit ?? null]); return { ok: true }; }); }
  @Delete('services/:id')
  svcDetach(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.client_services where id=$1', [id]); return { ok: true }; }); }
  @Patch('services/:id/status')
  svcStatus(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query('update delivery.client_services set status=$2 where id=$1', [id, b.status ?? null]); return { ok: true }; }); }
}
