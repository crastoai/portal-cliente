import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';
import { WacrmMetricsService } from './wacrm-metrics.service';
import { KpiAiService } from './kpi-ai.service';

// RELÓGIO DE PONTO — soma a UNIÃO de intervalos [s,e] (epoch ms) recortada a uma janela → minutos.
// Merge Portal+wacrm: quando o mesmo usuário está ativo nos dois ao mesmo tempo (ex.: CRM embarcado
// no Portal), a sobreposição conta UMA vez só. Ordena por início, funde sobrepostos, clipa à janela.
function unionMinutes(intervals: { s: number; e: number }[], winStart: number, winEnd: number): number {
  if (!intervals.length) return 0;
  const xs = intervals.slice().sort((a, b) => a.s - b.s);
  let total = 0, curS = xs[0].s, curE = xs[0].e;
  for (let i = 1; i < xs.length; i++) {
    const it = xs[i];
    if (it.s <= curE) { if (it.e > curE) curE = it.e; }
    else { total += Math.max(0, Math.min(curE, winEnd) - Math.max(curS, winStart)); curS = it.s; curE = it.e; }
  }
  total += Math.max(0, Math.min(curE, winEnd) - Math.max(curS, winStart));
  return Math.round(total / 60000);
}

// Bounded context DELIVERY (schema delivery). Tudo em asUser → a RLS do Portal faz o "mine"
// (própria org do cliente) e o bypass do admin, exatamente como fazia via PostgREST.
@Controller('delivery')
@UseGuards(JwtOrgGuard)
export class DeliveryController {
  constructor(private readonly db: RlsDbService, private readonly wacrm: WacrmMetricsService, private readonly kpiAi: KpiAiService) {}
  private uid(req: any): string { return req.user.id; }
  private set(patch: Record<string, any>, startAt: number) {
    const keys = Object.keys(patch || {}).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    return { sets: keys.map((k, i) => `"${k}"=$${startAt + i}`).join(', '), vals: keys.map((k) => patch[k]), ok: keys.length > 0 };
  }

  // Federa um GET do wacrm repassando o Bearer do PRÓPRIO cliente (mesmo IdP Supabase) — a RLS
  // do wacrm escopa por org. CRM fora/sem auth → null (a tela mostra "—", nunca inventa).
  private async fetchCrm(req: any, path: string): Promise<any | null> {
    const url = process.env.CRM_API_URL, auth = req?.headers?.authorization;
    if (!url || !auth) return null;
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}${path}`, { headers: { Authorization: auth } });
      return await r.json().catch(() => null);
    } catch { return null; }
  }

  // `access_mode` viaja junto: é ele que diz ao front COMO abrir a instância
  // (link = nova aba, como sempre foi · embed = dentro do Portal · sso = embed com sessão própria).
  private readonly ROLLOUT = 'id,vdi_module_id,status,label,blurb,rollout_progress,rollout_due,rollout_status,access_mode,monthly_cost,setup_cost,contract_date,cost_allocation,rollout_start,delivered_at,activated_at';

  // ── Fase 4 · autoatendimento consolidado ────────────────────────────────
  // O org_id vem do JWT + RLS, nunca do navegador. Só depois de resolvê-lo no banco
  // consultamos o schema finance como service_role (finance não é exposto ao cliente).
  @Get('self-service/mine')
  async selfServiceMine(@Req() req: any) {
    // FONTE CERTA do status do AGENTE = o console (wacrm agents.status), não o portal. Federamos
    // aqui: algum agente 'live' → o WhatsApp CRM está no ar; senão 'implanting' → em implantação.
    // Se o CRM cair, agentStatus=null e o módulo cai no rollout_status do portal (nunca inventa).
    let agentStatus: string | null = null;
    try {
      const url = process.env.CRM_API_URL, auth = req?.headers?.authorization;
      if (url && auth) {
        const r = await fetch(`${url.replace(/\/$/, '')}/api/me`, { headers: { Authorization: auth } });
        const j: any = await r.json().catch(() => null);
        const ags: any[] = Array.isArray(j?.agents) ? j.agents : [];
        if (ags.some((a) => String(a?.status) === 'live')) agentStatus = 'live';
        else if (ags.some((a) => ['implanting', 'implantando', 'setup', 'pending'].includes(String(a?.status)))) agentStatus = 'implanting';
      }
    } catch { /* CRM fora → cai no rollout_status do portal */ }

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
        `select id,service_name as name,service_description as description,service_category as category,status,'service' as kind
           from delivery.client_services order by created_at`,
      )).rows;
      const modules = (await c.query(
        `select cm.id,coalesce(cm.label,m.name) as name,cm.status,cm.rollout_status,cm.rollout_progress,'module' as kind,
                cm.rollout_start, cm.rollout_due, cm.delivered_at, cm.contract_date, cm.activated_at,
                (m.crm_solution is true) as is_crm
           from delivery.client_modules cm join catalog.vdi_modules m on m.id=cm.vdi_module_id
          order by cm.created_at`,
      )).rows.map((m: any) => ({ ...m, agent_status: m.is_crm ? agentStatus : null }));
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
      // Contrato de prestação de serviço — o documento que o admin sobe em "Documentos"
      // (kind=contrato_servico). O cliente abre pelo card "Contrato". asService escopado por org.
      const contract_doc = (await c.query(
        `select file_name, storage_path, uploaded_at
           from crm.documents where organization_id=$1 and kind='contrato_servico'
          order by uploaded_at desc limit 1`,
        [visible.orgId],
      )).rows[0] ?? null;
      return { support, ai, contract_doc };
    });
    const { orgId: _orgId, ...safe } = visible;
    return { ...safe, ...privateUsage };
  }

  // ── COCKPIT · "Meus Resultados" (Fase 1) ──────────────────────────────────────
  // Consolida, client-safe, os dados de RESULTADO do cliente:
  //  • métricas antes×depois — o "depois" vem AO VIVO do wacrm (/api/dashboard + /api/me/agent-usage);
  //    o "antes" (baseline declarado na reunião/print) entra no item 1.3 → por ora `antes:null` e o
  //    front mostra a EVOLUÇÃO (trend atual×anterior). A narrativa da Psiquê entra no item 1.4.
  //  • volume (mensagens/dia), jornada (marcos de implantação) e conquistas (módulos/serviços).
  // Regra de ouro: sem fonte = null (o front vira "—"), NUNCA número inventado.
  @Get('cockpit/mine')
  async cockpitMine(@Req() req: any) {
    // 1) orgId CONFIÁVEL do Portal (current_org_id via RLS) + conquistas/jornada da própria org.
    //    `.catch` garante que uma falha de DB NUNCA derruba o cockpit (front recebe [] → "—").
    const db = await this.db.asUser(this.uid(req), async (c) => {
      const orgId = (await c.query('select public.current_org_id() as id')).rows[0]?.id;
      if (!orgId) return { orgId: null as string | null, jornada: [] as any[], conquistas: [] as any[], baseline: [] as any[], me: null as any };
      const jornada = (await c.query(
        `select e.happened_at, e.title, e.detail, coalesce(nullif(cm.label,''), vm.name) as module_name
           from delivery.implementation_events e
           left join delivery.client_modules cm on cm.id = e.client_module_id
           left join catalog.vdi_modules vm on vm.id = cm.vdi_module_id
          where e.organization_id = $1
          order by e.happened_at desc limit 20`, [orgId])).rows;
      const conquistas = (await c.query(
        `select coalesce(cm.label, m.name) as titulo, cm.status, cm.rollout_status, 'module' as tipo
           from delivery.client_modules cm join catalog.vdi_modules m on m.id = cm.vdi_module_id
          where cm.organization_id = $1
          union all
         select service_name as titulo, status, null as rollout_status, 'service' as tipo
           from delivery.client_services where organization_id = $1`, [orgId])).rows;
      // Baseline ("antes") vigente — casado por métrica com os resultados vivos (item 1.3).
      const baseline = (await c.query(
        `select metric, valor_antes, unidade, status, fonte, baseline_date from delivery.client_baseline
          where organization_id = $1 and is_current`, [orgId])).rows;
      // Narrativa da Psiquê (hero) — vigente (item 1.4).
      const narrativa = (await c.query(
        `select narrative from delivery.cockpit_narrative where organization_id = $1 and is_current limit 1`, [orgId])).rows[0]?.narrative ?? null;
      // Identidade do logado p/ o cabeçalho: nome + e-mail (o e-mail casa o cargo depois). asUser lê o próprio profile.
      const me = (await c.query('select id, full_name, email, role::text as role from public.profiles where id = auth.uid()')).rows[0] ?? null;
      return { orgId, jornada, conquistas, baseline, narrativa, me };
    }).catch(() => ({ orgId: null as string | null, jornada: [] as any[], conquistas: [] as any[], baseline: [] as any[], narrativa: null as any, me: null as any }));

    // 2) RESULTADOS VIVOS direto do wacrm, escopados pelo orgId do Portal (confiável e em tempo real).
    const r = db?.orgId ? await this.wacrm.resultados(db.orgId).catch(() => null) : null;

    // 2b) IDENTIDADE do cabeçalho (cargo + empresa) — Item 1. O cargo vem do cadastro de Pessoas/Sócios
    //     do detalhe do cliente (crm.people.funcao/role · crm.company_partners.role_title), casando pelo
    //     E-MAIL do usuário logado. Essas tabelas são admin-only na RLS → leitura via asService
    //     (service_role) ESCOPADA ao orgId do próprio usuário. Sem match de e-mail → cargo null (nunca
    //     inventa). Empresa (organizations.name) sempre real. Falha → identity null (cabeçalho degrada limpo).
    const identity = db?.orgId ? await this.db.asService(async (c) => {
      const org_name = (await c.query('select name from public.organizations where id = $1', [db.orgId])).rows[0]?.name ?? null;
      const email: string | undefined = (db as any)?.me?.email || undefined;
      let cargo: string | null = null;
      if (email) {
        cargo = (await c.query(
          `select coalesce(nullif(funcao,''), nullif(role,'')) as c
             from crm.people
            where organization_id = $1
              and (lower(email) = lower($2) or exists (select 1 from unnest(emails) e where lower(e) = lower($2)))
            order by is_primary desc nulls last limit 1`, [db.orgId, email])).rows[0]?.c ?? null;
        if (!cargo) cargo = (await c.query(
          `select nullif(role_title,'') as c from crm.company_partners
            where organization_id = $1 and lower(email) = lower($2) and is_active
            order by is_ceo desc nulls last limit 1`, [db.orgId, email])).rows[0]?.c ?? null;
      }
      return { full_name: (db as any)?.me?.full_name ?? null, org_name, cargo };
    }).catch(() => null) : null;
    const crmOk = !!r;
    const bmap: Record<string, any> = {};
    for (const b of (db?.baseline || [])) bmap[b.metric] = b;
    // antes = baseline informado; depois = valor vivo do wacrm; trend = evolução (quando não há "antes").
    const metric = (key: string, label: string, unidade: string, melhor: 'menor' | 'maior', depois: number | null, trend: number | null) => {
      const b = bmap[key];
      const temAntes = b && (b.status === 'informado' || b.status === 'medido') && b.valor_antes != null;
      return {
        key, label, unidade, melhor,
        antes: temAntes ? Number(b.valor_antes) : null,
        fonte_antes: b ? (b.status === 'nao_tinha' ? 'não tinha' : (b.fonte || null)) : null,
        depois, trend,
      };
    };
    // Horas TRABALHADAS reais da equipe no MÊS corrente — RELÓGIO DE PONTO, dado real de
    // public.user_sessions (soma do tempo conectado por colaborador). Substitui a antiga ESTIMATIVA
    // "horas economizadas" (conversas_ia × dur_media). Sem sessão/CRM → null → o front mostra "—".
    // GATING (decisão do Crasto): só o DONO vê o TOTAL da equipe. Membro comum vê só as PRÓPRIAS
    // horas (mesma regra do drill-down). Papel resolvido no banco (profiles.role), nunca do cliente.
    const donoHoras = (db as any)?.me?.role === 'client_owner' || (db as any)?.me?.role === 'crasto_admin';
    const ponto = db?.orgId ? await this.pontoRows(db.orgId, null, null, donoHoras ? null : ((db as any)?.me?.id ?? null)).catch(() => null) : null;
    const horasMes = ponto ? Math.round(ponto.reduce((s: number, x: any) => s + (x.min_mes || 0), 0) / 60) : null;
    const metrics: any[] = [
      metric('tempo_resposta', '1ª resposta · WhatsApp', 's', 'menor', r?.tempo_resposta ?? null, null),
      metric('automacao', 'Atendimentos feitos pela IA', '%', 'maior', r?.automacao ?? null, null),
      metric('novos_leads', 'Leads / mês', '', 'maior', r?.novos_leads ?? null, r?.trend?.novos_leads ?? null),
      metric('atendimentos', 'Conversas atendidas', '', 'maior', r?.atendimentos ?? null, r?.trend?.atendimentos ?? null),
      metric('horas', donoHoras ? 'Horas da equipe / mês' : 'Minhas horas / mês', 'h', 'maior', horasMes && horasMes > 0 ? horasMes : null, null),
      { key: 'cobertura', label: 'Cobertura de atendimento', unidade: '', melhor: 'maior', antes: null, fonte_antes: null, depois: crmOk ? '24/7' : null, trend: null, texto: true },
    ];

    // KPIs EXTRA (funil/SLA/pico) + ROI (horas que a IA poupou = conversas conduzidas × duração média).
    const kx = db?.orgId ? await this.wacrm.kpisExtra(db.orgId).catch(() => null) : null;
    const roiHoras = r?.conversas_ia && r?.dur_media ? Math.round((r.conversas_ia * r.dur_media) / 3600) : null;

    // ANÁLISE DE IA por KPI (DeepSeek, chave dos agentes) — números reais → sugestão do dono em cada
    // card. Não bloqueia: gera em background e cacheia; até vir, o front usa a análise determinística.
    const volN = (r?.volume || []).map((v) => v.n);
    const baForAi = metrics.filter((m: any) => m.antes != null && typeof m.depois === 'number' && !m.texto)
      .map((m: any) => ({ metrica: m.label, antes: m.antes, depois: m.depois, melhor: m.melhor }));
    const aiInput: any = {};
    if (r?.automacao != null) aiInput.automacao = { pct_automacao: r.automacao, atendimentos_mes: r.atendimentos, conversas_ia: r.conversas_ia };
    if (kx?.sla?.pct5 != null) aiInput.sla = { pct_em_5min: kx.sla.pct5, mediana_segundos: kx.sla.mediana_s, respondidas: kx.sla.respondidas, sem_resposta: kx.sla.sem_resposta };
    if (kx?.funil && kx.funil.leads > 0) aiInput.funil = kx.funil;
    if (volN.some((n) => n > 0)) aiInput.volume = { serie_ultimos_dias: volN.slice(-14), total: volN.reduce((s, n) => s + n, 0) };
    if (roiHoras) aiInput.roi = { horas_economizadas_ia: roiHoras, horas_equipe_mes: horasMes ?? null };
    if (baForAi.length) aiInput.antesdepois = baForAi;
    if (kx?.pico) {
      const dias = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
      let bd = 0, bb = 0, bv = 0;
      kx.pico.forEach((row, d) => row.forEach((v, b) => { if (v > bv) { bv = v; bd = d; bb = b; } }));
      if (bv > 0) aiInput.pico = { dia_de_maior_movimento: dias[bd], faixa_horaria: `${bb * 3}h-${bb * 3 + 3}h` };
    }
    const analises = this.kpiAi.analisar(db?.orgId ?? null, aiInput);

    // Custo/hora REAL da equipe CLT (média salário + encargos do regime ÷ 220h/mês) — substitui o
    // R$20/h fixo do card de ROI. Só p/ o DONO (payroll é sigiloso); membro comum cai no default.
    let roiCustoHora: number | null = null;
    if (db?.orgId && donoHoras) {
      roiCustoHora = await this.db.asService(async (c) => {
        const reg = (await c.query('select tax_regime from public.organizations where id=$1', [db.orgId])).rows[0]?.tax_regime || 'simples';
        const enc = reg === 'presumido' || reg === 'real' ? 0.5524 : 0.2744; // encargos por regime
        // Modalidade vazia ('') OU nula conta como CLT (nullif troca '' por null antes do coalesce) —
        // senão o colaborador com salário mas sem modalidade escolhida ficaria de fora e o custo real
        // nunca refletiria. PJ/Projeto/estágio/temporário ficam de fora (não têm folha CLT).
        const sals = (await c.query(
          `select salario::numeric sal from public.team_members
            where organization_id=$1
              and coalesce(nullif(tipo_contrato,''),'clt') not in ('pj','projeto','estagio','temporario')
              and salario is not null and salario::numeric > 0`,
          [db.orgId])).rows.map((x: any) => Number(x.sal));
        if (!sals.length) return null;
        const media = sals.reduce((s: number, v: number) => s + v, 0) / sals.length;
        return Math.round((media * (1 + enc)) / 220);
      }).catch(() => null);
    }

    return {
      metrics,
      volume: r?.volume ?? [],
      kpis: {
        funil: kx?.funil ?? null,
        sla: kx?.sla ?? null,
        pico: kx?.pico ?? null,
        roi_horas_ia: roiHoras,
        horas_equipe_mes: horasMes ?? null,
        roi_custo_hora: roiCustoHora,
        analises: analises ?? null,
      },
      jornada: db?.jornada ?? [],
      conquistas: db?.conquistas ?? [],
      narrativa: db?.narrativa ?? null,       // Psiquê (item 1.4) — headline/destaques/resumo
      identity,                                // cabeçalho (Item 1): { full_name, org_name, cargo } — cargo do cadastro de Pessoas
      fontes: { crm: crmOk, agent: crmOk },   // p/ o front saber quando mostrar "—"
    };
  }

  // DRILL-DOWN do Cockpit (Fase 1): tempo de 1ª resposta POR COLABORADOR (humano e IA). Escopado
  // pela org do usuário (current_org_id). Dado ao vivo — o front repete a cada ~30s, sem refresh.
  @Get('cockpit/response-breakdown')
  async responseBreakdown(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const ctx = await this.db.asUser(this.uid(req), async (c) => {
      const orgId = (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null;
      const me = (await c.query(`select id, role::text r from public.profiles where id = auth.uid()`)).rows[0];
      return { orgId, uid: (me?.id as string) ?? null, dono: me?.r === 'client_owner' || me?.r === 'crasto_admin' };
    }).catch(() => null);
    if (!ctx?.orgId) return { rows: [] as any[] };
    // Membro comum vê só a PRÓPRIA linha (o próprio tempo de resposta); dono/gestor vê o time todo.
    const rows = await this.wacrm.responseByCollaborator(ctx.orgId, from || null, to || null, ctx.dono ? null : ctx.uid).catch(() => null);
    return { rows: rows ?? [] };
  }

  // DRILL-DOWN do card "Atendimentos feitos pela IA" — SÓ agentes de IA, TODOS da empresa (não
  // humanos). Métrica org-level (não é dado pessoal), então aparece a quem vê o card.
  @Get('cockpit/ai-agents')
  async aiAgents(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const orgId = await this.db.asUser(this.uid(req), async (c) => (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null).catch(() => null);
    if (!orgId) return { rows: [] as any[] };
    const rows = await this.wacrm.aiAgentsByOrg(orgId, from || null, to || null).catch(() => null);
    return { rows: rows ?? [] };
  }

  // DRILL-DOWN do card "Leads / mês" — lista paginada (abas) de contatos + farol interesse/funil.
  @Get('cockpit/leads')
  async leads(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string, @Query('q') q?: string, @Query('page') page?: string) {
    const orgId = await this.db.asUser(this.uid(req), async (c) => (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null).catch(() => null);
    const pageSize = 12;
    if (!orgId) return { rows: [] as any[], total: 0, pageSize };
    const pg = Math.max(0, parseInt(page || '0', 10) || 0);
    const r = await this.wacrm.leadsList(orgId, from || null, to || null, q || null, pageSize, pg * pageSize).catch(() => null);
    const rows = (r?.rows ?? []) as any[];
    // Enriquece com o POTENCIAL classificado pela IA (delivery.lead_potencial, no Portal) → farol inteligente.
    if (rows.length) {
      const pot = await this.db.asService(async (c) => (await c.query(
        `select lead_id::text id, potencial, motivo from delivery.lead_potencial where organization_id=$1 and is_current and lead_id = any($2::uuid[])`,
        [orgId, rows.map((x) => x.id)])).rows).catch(() => [] as any[]);
      const pmap: Record<string, any> = {};
      for (const p of pot) pmap[p.id] = p;
      for (const x of rows) { const p = pmap[x.id]; x.potencial = p?.potencial ?? null; x.potencial_motivo = p?.motivo ?? null; }
    }
    return { rows, total: r?.total ?? 0, pageSize };
  }

  // DETALHE de um lead (master-detail no mesmo modal): cabeçalho + interesse/funil + potencial IA + conversas.
  @Get('cockpit/lead/:id')
  async lead(@Req() req: any, @Param('id') id: string) {
    const orgId = await this.db.asUser(this.uid(req), async (c) => (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null).catch(() => null);
    if (!orgId) return null;
    const d = await this.wacrm.leadDetail(orgId, id).catch(() => null);
    if (!d) return null;
    const pot = await this.db.asService(async (c) => (await c.query(`select potencial, motivo from delivery.lead_potencial where organization_id=$1 and lead_id=$2 and is_current limit 1`, [orgId, id])).rows[0]).catch(() => null);
    return { ...d, potencial: (pot as any)?.potencial ?? null, potencial_motivo: (pot as any)?.motivo ?? null };
  }

  // DRILL-DOWN Fase 2: as conversas de um colaborador (p/ abrir no CRM via /chat/<id>). Escopo por org.
  @Get('cockpit/collab-conversations')
  async collabConversations(@Req() req: any, @Query('kind') kind: string, @Query('id') id: string, @Query('from') from?: string, @Query('to') to?: string, @Query('q') q?: string) {
    const ctx = await this.db.asUser(this.uid(req), async (c) => {
      const orgId = (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null;
      const me = (await c.query(`select id, role::text r from public.profiles where id = auth.uid()`)).rows[0];
      return { orgId, uid: (me?.id as string) ?? null, dono: me?.r === 'client_owner' || me?.r === 'crasto_admin' };
    }).catch(() => null);
    if (!ctx?.orgId) return { rows: [] as any[] };
    // Membro comum só pode abrir as PRÓPRIAS conversas (kind humano, id = ele mesmo) — não os outros.
    const kd: 'human' | 'ai' = ctx.dono ? (kind === 'ai' ? 'ai' : 'human') : 'human';
    const targetId = ctx.dono ? (id || null) : ctx.uid;
    const rows = await this.wacrm.collabConversations(ctx.orgId, kd, targetId, from || null, to || null, q || null).catch(() => null);
    return { rows: rows ?? [] };
  }

  // DRILL-DOWN de HORAS (Fase A): RELÓGIO DE PONTO por colaborador — tempo logado real (user_sessions).
  // Online + horas hoje/semana/mês por pessoa da org. Ao vivo (o front repete ~30s). Membro vê só a si.
  @Get('cockpit/hours-breakdown')
  async hoursBreakdown(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const ctx = await this.db.asUser(this.uid(req), async (c) => {
      const orgId = (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null;
      const me = (await c.query(`select id, role::text r from public.profiles where id = auth.uid()`)).rows[0];
      return { orgId, uid: (me?.id as string) ?? null, dono: me?.r === 'client_owner' || me?.r === 'crasto_admin' };
    }).catch(() => null);
    if (!ctx?.orgId) return { rows: [] as any[] };
    const rows = await this.pontoRows(ctx.orgId, from || null, to || null, ctx.dono ? null : ctx.uid).catch(() => [] as any[]);
    return { rows };
  }

  // DRILL-DOWN de HORAS (Fase A · nível 2): as SESSÕES (login/logout) de um colaborador. Escopo por org;
  // membro comum só vê as PRÓPRIAS sessões (targetId forçado ao próprio uid).
  @Get('cockpit/collab-sessions')
  async collabSessions(@Req() req: any, @Query('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const ctx = await this.db.asUser(this.uid(req), async (c) => {
      const orgId = (await c.query('select public.current_org_id() as id')).rows[0]?.id as string | null;
      const me = (await c.query(`select id, role::text r from public.profiles where id = auth.uid()`)).rows[0];
      return { orgId, uid: (me?.id as string) ?? null, dono: me?.r === 'client_owner' || me?.r === 'crasto_admin' };
    }).catch(() => null);
    if (!ctx?.orgId) return { rows: [] as any[] };
    const targetId = ctx.dono ? (id || null) : ctx.uid;
    if (!targetId) return { rows: [] as any[] };
    // Sessões dos DOIS sistemas (wacrm + Portal), listadas juntas e ordenadas por login (mais recente).
    const wRows = (await this.wacrm.collabSessions(ctx.orgId, targetId, from || null, to || null).catch(() => null)) ?? [];
    const pRows = await this.db.asService(async (c) => (await c.query(
      `select s.id::text id, s.started_at login, coalesce(s.logout_at, s.last_active_at) logout,
              round(extract(epoch from (coalesce(s.logout_at, s.last_active_at) - s.started_at)) / 60)::int minutos
         from delivery.user_sessions s
        where s.user_id = $1::uuid and s.organization_id = $2
          and s.started_at >= coalesce($3::date, (now()-'30 days'::interval)::date)
          and s.started_at < coalesce($4::date + 1, now()::date + 1)
        order by s.started_at desc limit 200`,
      [targetId, ctx.orgId, from || null, to || null])).rows.map((r: any) => ({ id: String(r.id), login: r.login, logout: r.logout, minutos: r.minutos }))).catch(() => [] as any[]);
    const rows = [...wRows, ...pRows].sort((a: any, b: any) => new Date(b.login).getTime() - new Date(a.login).getTime()).slice(0, 200);
    return { rows };
  }

  // HEARTBEAT de ATIVIDADE REAL do PORTAL (relógio de ponto — lado Portal, espelha o wacrm). O front
  // dispara ~1/min SÓ com mouse/teclado. Gerencia delivery.user_sessions por ATIVIDADE: estende a
  // aberta se o último sinal foi < 5min; senão fecha a anterior (logout no último sinal real) e abre
  // nova. Cada sessão = um burst de trabalho ATIVO. asUser: own_insert/own_update escrevem a própria.
  @Post('heartbeat')
  async heartbeat(@Req() req: any) {
    await this.db.asUser(this.uid(req), async (c) => {
      const org = (await c.query('select public.current_org_id() as id')).rows[0]?.id;
      if (!org) return;
      await c.query(
        `with recent as (
           select id, last_active_at, last_ping_at, started_at from delivery.user_sessions
            where user_id = auth.uid() and logout_at is null order by started_at desc limit 1),
         ext as (
           update delivery.user_sessions s set last_active_at = now(), last_ping_at = now() from recent
            where s.id = recent.id and now() - recent.last_active_at <= interval '5 minutes' returning s.id),
         closed as (
           update delivery.user_sessions s
              set logout_at = coalesce(recent.last_active_at, recent.last_ping_at, recent.started_at) from recent
            where s.id = recent.id and now() - recent.last_active_at > interval '5 minutes'
              and not exists (select 1 from ext) returning s.id)
         insert into delivery.user_sessions (user_id, organization_id, started_at, last_ping_at, last_active_at)
         select auth.uid(), $1, now(), now(), now() where not exists (select 1 from ext)`,
        [org],
      );
    }).catch(() => {});
    return { ok: true };
  }

  // Carimba o LOGOUT MANUAL (botão "sair") no Portal: fecha a sessão aberta (logout_reason='manual').
  // Chamado pelo client antes de descartar o token. No-op se já foi fechada (idle_timeout).
  @Post('session-close')
  async sessionClose(@Req() req: any) {
    await this.db.asUser(this.uid(req), async (c) => {
      await c.query(
        `update delivery.user_sessions set logout_at = now(), logout_reason = 'manual'
          where user_id = auth.uid() and logout_at is null`,
      );
    }).catch(() => {});
    return { ok: true };
  }

  // MERGE Portal+wacrm por user_id (relógio de ponto). Roster = membros da org (Portal = fonte da
  // verdade da equipe, inclui quem só usa o Portal). Sessões dos DOIS sistemas unidas por
  // unionMinutes (sobreposição 1×). Janelas hoje/semana/mês/período calculadas no banco do Portal
  // (robusto se o wacrm cair). online/último = última atividade em qualquer um dos dois sistemas.
  private async pontoRows(orgId: string, from: string | null, to: string | null, scopeUid: string | null) {
    const portal = await this.db.asService(async (c) => {
      const roster = (await c.query(
        `select p.id::text id, coalesce(nullif(p.full_name,''), p.email, 'Colaborador') nome, p.email
           from public.profiles p
          where p.organization_id = $1 and p.role::text in ('client_owner','client_member')
            and ($2::uuid is null or p.id = $2::uuid) order by nome`,
        [orgId, scopeUid])).rows;
      const sess = (await c.query(
        `select user_id::text uid, extract(epoch from started_at) * 1000 s,
                extract(epoch from coalesce(logout_at, last_active_at)) * 1000 e
           from delivery.user_sessions
          where organization_id = $1 and started_at > now() - '180 days'::interval
            and ($2::uuid is null or user_id = $2::uuid)`,
        [orgId, scopeUid])).rows;
      // NB: aliases curtos (d/w/m/ps/pe/nw). "day"/"week"/"month"/"now" como alias CRU quebram o
      // parser do Postgres (palavras de interval) → "syntax error at or near month". Sempre com AS.
      const b = (await c.query(
        `select extract(epoch from date_trunc('day',now())) * 1000 as d,
                extract(epoch from date_trunc('week',now())) * 1000 as w,
                extract(epoch from date_trunc('month',now())) * 1000 as m,
                extract(epoch from coalesce($1::date, (now()-'30 days'::interval)::date)) * 1000 as ps,
                extract(epoch from coalesce($2::date + 1, now()::date + 1)) * 1000 as pe,
                extract(epoch from now()) * 1000 as nw`,
        [from, to])).rows[0];
      return { roster, sess: sess.map((r: any) => ({ uid: r.uid, s: Number(r.s), e: Number(r.e) })), b };
    }).catch(() => ({ roster: [] as any[], sess: [] as { uid: string; s: number; e: number }[], b: null as any }));

    if (!portal.b) return [] as any[];
    const w = await this.wacrm.pontoRaw(orgId, scopeUid).catch(() => null);
    const lastSeen = w?.lastSeen ?? {};
    const day = Number(portal.b.d), week = Number(portal.b.w), month = Number(portal.b.m);
    const pStart = Number(portal.b.ps), pEnd = Number(portal.b.pe), now = Number(portal.b.nw);

    const byUser = new Map<string, { s: number; e: number }[]>();
    for (const x of [...portal.sess, ...(w?.sessions ?? [])]) {
      if (!(x.e > x.s)) continue; // ignora sessão sem atividade real (fim nulo/inválido)
      const arr = byUser.get(x.uid) ?? [];
      arr.push({ s: x.s, e: x.e });
      byUser.set(x.uid, arr);
    }
    return portal.roster.map((u: any) => {
      const iv = byUser.get(u.id) ?? [];
      const maxE = iv.reduce((m, x) => Math.max(m, x.e), 0);
      const ultimoMs = Math.max(maxE, lastSeen[u.id] || 0);
      return {
        id: u.id, nome: u.nome, email: u.email || null,
        online: ultimoMs > 0 && now - ultimoMs < 5 * 60000,
        last_seen_at: ultimoMs > 0 ? new Date(ultimoMs).toISOString() : null,
        min_hoje: unionMinutes(iv, day, now),
        min_semana: unionMinutes(iv, week, now),
        min_mes: unionMinutes(iv, month, now),
        min_periodo: unionMinutes(iv, pStart, pEnd),
        sessoes: iv.filter((x) => x.s >= pStart && x.s < pEnd).length,
        ultimo: ultimoMs > 0 ? new Date(ultimoMs).toISOString() : null,
      };
    }).sort((a: any, b2: any) => (Number(b2.online) - Number(a.online)) || (b2.min_mes - a.min_mes) || String(a.nome).localeCompare(String(b2.nome)));
  }

  // MINI-COCKPIT do WhatsApp CRM — pulso ao vivo (agentes online, conversas ativas, fila, IA hoje).
  // Escopado pelo orgId do Portal (current_org_id, confiável). CRM fora → null → o front mostra "—".
  @Get('crm-live/mine')
  async crmLiveMine(@Req() req: any) {
    const orgId = await this.db.asUser(this.uid(req), async (c) => (await c.query('select public.current_org_id() as id')).rows[0]?.id).catch(() => null);
    if (!orgId) return null;
    return this.wacrm.liveNow(orgId).catch(() => null);
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
              case when m.crm_solution and $1::text is not null then $1::text end as crm_url,
              -- Social Media (solução própria): URL de embed = external_url do catálogo (mesma p/
              -- todos; o tenant vem do JWT), exposta só quando a flag está ligada — igual ao crm_url.
              case when m.social_solution then m.external_url end as social_url,
              m.social_solution
         from delivery.client_modules cm
         join catalog.vdi_modules m on m.id = cm.vdi_module_id
        -- Sub-acesso por USUÁRIO (Fase 2): sem linhas em user_module_access = vê todos os
        -- módulos da org (padrão); com linhas = restrito exatamente a esses.
        where (not exists (select 1 from delivery.user_module_access u where u.user_id = auth.uid())
               or exists (select 1 from delivery.user_module_access u where u.user_id = auth.uid() and u.vdi_module_id = cm.vdi_module_id))
        order by cm.created_at`, [crmWeb])).rows);
  }

  // ── Permissão módulo × USUÁRIO (sub-acessos — Blueprint v1.1 Fase 2) ──────────────────────
  // Quem gerencia (decisão Crasto 2026-08-09): o crasto_admin, o DONO (client_owner) da org do
  // alvo, OU um colaborador ADMIN-LEVEL (client_member com access_level='admin') da mesma org —
  // mas o admin-level NUNCA edita o Dono (a conta-dona é imutável por baixo dele). Validado no
  // código + escrita via service_role (tabelas RLS deny-default). Retorna a org do alvo, ou null.
  private async gerenciaModulos(c: any, callerId: string, targetId: string): Promise<string | null> {
    const caller = (await c.query(`select role::text r, organization_id o, access_level al from public.profiles where id=$1`, [callerId])).rows[0];
    const target = (await c.query(`select role::text r, organization_id o from public.profiles where id=$1`, [targetId])).rows[0];
    if (!caller || !target) return null;
    if (caller.r === 'crasto_admin') return target.o;
    if (caller.o !== target.o) return null;                       // fora da própria org: nunca
    if (caller.r === 'client_owner') return target.o;             // o dono manda na própria org
    if (caller.r === 'client_member' && caller.al === 'admin' && target.r !== 'client_owner') return target.o;
    return null;
  }

  // Chama um endpoint INTERNO do wacrm (service-to-service, X-Service-Key — sem bearer). É como
  // o dono/admin do CLIENTE (que não passa pelo AdminGuard do crm-access) grava telas do CRM.
  private async callCrmInternal(path: string, body: any): Promise<any | null> {
    const url = process.env.CRM_API_URL, key = process.env.INTERNAL_SERVICE_KEY;
    if (!url || !key) return null;
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/api${path}`, {
        method: 'POST',
        headers: { 'X-Service-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await r.json().catch(() => null);
    } catch { return null; }
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

  // ── FICHA DO COLABORADOR — "Editar Colaborador" (access_level + WhatsApp + RH) ─────────────
  // Um só par GET/POST usado pelo modal no CLIENTE e no ADMIN — a autorização é a MESMA guarda
  // (gerenciaModulos: crasto_admin | dono | admin-level). access_level e WhatsApp vivem em
  // public.profiles; a ficha profissional/RH (inclui salário) na public.team_members (deny-default).
  private static readonly ACCESS_LEVELS = ['admin', 'supervisor', 'agente', 'visualizador'];
  private static readonly TEAM_FIELDS = ['cpf_cnpj', 'telefone', 'cargo', 'departamento', 'salario', 'data_admissao', 'tipo_contrato', 'cnpj_vinculado', 'observacoes', 'sindicato', 'ultima_ferias'];
  // Campos de CUSTO (sigilo): só o DONO/presidente (client_owner) ou a Crasto (crasto_admin)
  // veem e editam. gerenciaModulos deixa admin-level ADMINISTRAR a equipe, mas não VER custo.
  private static readonly COST_FIELDS = ['salario'];
  /** O CHAMADOR é dono/presidente da empresa (ou Crasto admin)? Só ele mexe em custo. */
  private async podeCusto(c: any, callerId: string): Promise<boolean> {
    const r = (await c.query('select role::text r from public.profiles where id=$1', [callerId])).rows[0];
    return r?.r === 'client_owner' || r?.r === 'crasto_admin';
  }

  @Get('collaborator')
  collabGet(@Req() req: any, @Query('user') user: string) {
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      const p = (await c.query('select access_level, wa_sender_name, wa_number from public.profiles where id=$1', [user])).rows[0] || {};
      const t = (await c.query(`select ${DeliveryController.TEAM_FIELDS.join(', ')} from public.team_members where user_id=$1`, [user])).rows[0] || {};
      // Sigilo de custo: só o dono/presidente (ou Crasto) vê salário. Para os demais, o campo some.
      const podeCusto = await this.podeCusto(c, this.uid(req));
      if (!podeCusto) for (const k of DeliveryController.COST_FIELDS) delete (t as any)[k];
      // Regime tributário da empresa (muda o custo do empregador) — só p/ quem vê custo.
      const orgTaxRegime = podeCusto ? ((await c.query('select tax_regime from public.organizations where id=$1', [org])).rows[0]?.tax_regime ?? 'simples') : null;
      return { access_level: p.access_level ?? null, wa_sender_name: p.wa_sender_name ?? null, wa_number: p.wa_number ?? null, team: t, pode_custo: podeCusto, org_tax_regime: orgTaxRegime };
    });
  }

  @Post('collaborator')
  collabSet(@Req() req: any, @Body() b: any) {
    const user = String(b?.user_id || '');
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      const alvo = (await c.query('select role::text r from public.profiles where id=$1', [user])).rows[0];
      const ehDono = alvo?.r === 'client_owner';

      // profiles: access_level (só p/ MEMBRO — o dono é imutável e não tem nível fino) + WhatsApp.
      const prof: Record<string, any> = {};
      if ('access_level' in b && !ehDono) {
        const lv = b.access_level;
        if (lv === null || lv === '' ) prof.access_level = null;
        else if (DeliveryController.ACCESS_LEVELS.includes(lv)) prof.access_level = lv;
        else return { error: 'nível de acesso inválido' };
      }
      if ('wa_sender_name' in b) prof.wa_sender_name = b.wa_sender_name ? String(b.wa_sender_name).slice(0, 120) : null;
      if ('wa_number' in b) prof.wa_number = b.wa_number ? String(b.wa_number).slice(0, 40) : null;
      if (Object.keys(prof).length) {
        const s = this.set(prof, 2);
        if (s.ok) await c.query(`update public.profiles set ${s.sets}, updated_at=now() where id=$1`, [user, ...s.vals]);
      }
      // Espelha o nome de exibição do WhatsApp no wacrm (banco separado) — é lá que a assinatura
      // do envio lê. Assim, quando o dono muda o sender name aqui, o topo da mensagem acompanha.
      if ('wa_sender_name' in prof) await this.callCrmInternal('/internal/set-wa-sender', { id: user, wa_sender_name: prof.wa_sender_name });

      // team_members (ficha profissional/RH) — upsert só dos campos que vieram; '' vira null.
      const team = (b && typeof b.team === 'object' && b.team) || {};
      const tm: Record<string, any> = {};
      for (const k of DeliveryController.TEAM_FIELDS) if (k in team) tm[k] = team[k] === '' ? null : team[k];
      // Sigilo de custo: quem não é dono/presidente NÃO grava salário (mesmo que mande no corpo).
      if (!(await this.podeCusto(c, this.uid(req)))) for (const k of DeliveryController.COST_FIELDS) delete tm[k];
      if (Object.keys(tm).length) {
        const cols = Object.keys(tm);
        const insCols = ['user_id', 'organization_id', ...cols];
        const ph = insCols.map((_, i) => `$${i + 1}`).join(', ');
        const upd = cols.map((k, i) => `"${k}"=$${i + 3}`).join(', ');
        await c.query(
          `insert into public.team_members (${insCols.map((x) => `"${x}"`).join(', ')}) values (${ph})
             on conflict (user_id) do update set ${upd}, updated_at=now()`,
          [user, org, ...cols.map((k) => tm[k])]);
      }
      // Regime tributário da EMPRESA (custo do empregador) — só o dono/presidente edita.
      if ('org_tax_regime' in b && (await this.podeCusto(c, this.uid(req)))) {
        const rg = ['simples', 'presumido', 'real'].includes(b.org_tax_regime) ? b.org_tax_regime : 'simples';
        await c.query('update public.organizations set tax_regime=$2 where id=$1', [org, rg]);
      }
      return { ok: true };
    });
  }

  // ── AUTO-EDIÇÃO (o próprio usuário edita os SEUS dados na tela Configurações) ─────────────
  // Sem gerenciaModulos: é a própria linha (req.user.id). Campos sensíveis/organizacionais
  // (salário, observações, cargo, departamento, tipo) NÃO são editáveis pelo próprio — só o
  // dono/admin muda pelo modal. Aqui a pessoa mexe no que é dela: contato + nome no WhatsApp.
  private static readonly SELF_TEAM_FIELDS = ['cpf_cnpj', 'telefone'];

  @Get('my-collaborator')
  myCollab(@Req() req: any) {
    const uid = this.uid(req);
    return this.db.asService(async (c) => {
      const p = (await c.query('select wa_sender_name, wa_number from public.profiles where id=$1', [uid])).rows[0] || {};
      const t = (await c.query('select cpf_cnpj, telefone, cargo, departamento, tipo_contrato from public.team_members where user_id=$1', [uid])).rows[0] || {};
      return { wa_sender_name: p.wa_sender_name ?? null, wa_number: p.wa_number ?? null, team: t };
    });
  }

  @Post('my-collaborator')
  myCollabSet(@Req() req: any, @Body() b: any) {
    const uid = this.uid(req);
    return this.db.asService(async (c) => {
      const prof: Record<string, any> = {};
      if ('wa_sender_name' in b) prof.wa_sender_name = b.wa_sender_name ? String(b.wa_sender_name).slice(0, 120) : null;
      if ('wa_number' in b) prof.wa_number = b.wa_number ? String(b.wa_number).slice(0, 40) : null;
      if (Object.keys(prof).length) {
        const s = this.set(prof, 2);
        if (s.ok) await c.query(`update public.profiles set ${s.sets}, updated_at=now() where id=$1`, [uid, ...s.vals]);
        if ('wa_sender_name' in prof) await this.callCrmInternal('/internal/set-wa-sender', { id: uid, wa_sender_name: prof.wa_sender_name });
      }
      const team = (b && typeof b.team === 'object' && b.team) || {};
      const tm: Record<string, any> = {};
      for (const k of DeliveryController.SELF_TEAM_FIELDS) if (k in team) tm[k] = team[k] === '' ? null : team[k];
      if (Object.keys(tm).length) {
        const org = (await c.query('select organization_id from public.profiles where id=$1', [uid])).rows[0]?.organization_id;
        if (org) {
          const cols = Object.keys(tm);
          const insCols = ['user_id', 'organization_id', ...cols];
          const ph = insCols.map((_, i) => `$${i + 1}`).join(', ');
          const upd = cols.map((k, i) => `"${k}"=$${i + 3}`).join(', ');
          await c.query(
            `insert into public.team_members (${insCols.map((x) => `"${x}"`).join(', ')}) values (${ph})
               on conflict (user_id) do update set ${upd}, updated_at=now()`,
            [uid, org, ...cols.map((k) => tm[k])]);
        }
      }
      return { ok: true };
    });
  }

  // Subtelas do WhatsApp CRM por usuário — caminho DONO/ADMIN (proxy interno p/ o wacrm, que é a
  // fonte da verdade dessas telas). O admin do Portal continua tendo o caminho /crm-access (bearer).
  @Get('crm-screens')
  async crmScreensGet(@Req() req: any, @Query('user') user: string) {
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      return (await this.callCrmInternal('/internal/get-crm-screens', { id: user, organization_id: org })) ?? { error: 'CRM indisponível' };
    });
  }
  @Post('crm-screens')
  async crmScreensSet(@Req() req: any, @Body() b: any) {
    const user = String(b?.user_id || '');
    const screens: string[] = Array.isArray(b?.screens) ? b.screens.filter((x: any) => typeof x === 'string') : [];
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      return (await this.callCrmInternal('/internal/set-crm-screens', { id: user, organization_id: org, screens })) ?? { error: 'CRM indisponível' };
    });
  }

  // Responsável por agente (aprovação in-system) — caminho DONO/ADMIN do cliente (proxy interno).
  // Lista os agentes da empresa + de quais o colaborador é responsável.
  @Get('crm-agents')
  async crmAgents(@Req() req: any, @Query('user') user: string) {
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      return (await this.callCrmInternal('/internal/list-agents', { organization_id: org, user_id: user })) ?? { error: 'CRM indisponível' };
    });
  }
  @Post('crm-responsibles')
  async crmResponsibles(@Req() req: any, @Body() b: any) {
    const user = String(b?.user_id || '');
    const agents: string[] = Array.isArray(b?.responsible_agents) ? b.responsible_agents.filter((x: any) => typeof x === 'string') : [];
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      return (await this.callCrmInternal('/internal/set-responsibles', { id: user, organization_id: org, responsible_agents: agents })) ?? { error: 'CRM indisponível' };
    });
  }

  // Quem gerencia a org INTEIRA (lista de colaboradores): crasto_admin, o dono, ou admin-level
  // dessa org. Igual ao gerenciaModulos, mas por ORG (não por alvo). Retorna true/false.
  private async gerenciaOrg(c: any, callerId: string, orgId: string): Promise<boolean> {
    const caller = (await c.query(`select role::text r, organization_id o, access_level al from public.profiles where id=$1`, [callerId])).rows[0];
    if (!caller) return false;
    if (caller.r === 'crasto_admin') return true;
    if (caller.o !== orgId) return false;
    return caller.r === 'client_owner' || (caller.r === 'client_member' && caller.al === 'admin');
  }

  // Lista de colaboradores da org (a "Gestão de Acessos" do cliente): perfil + ficha + último
  // acesso, num JOIN só. Só dono/admin da org (via service_role, RLS bypass — guarda no código).
  @Get('collaborators')
  collaborators(@Req() req: any, @Query('org') org: string) {
    return this.db.asService(async (c) => {
      if (!org || !(await this.gerenciaOrg(c, this.uid(req), org))) return { error: 'sem permissão' };
      const rows = (await c.query(
        `select p.id, p.full_name, p.email, p.role::text as role, p.access_level, p.active,
                t.cargo, t.departamento, t.tipo_contrato, t.telefone,
                public.user_last_login(p.id) as last_login
           from public.profiles p
           left join public.team_members t on t.user_id = p.id
          where p.organization_id = $1 and p.role <> 'crasto_admin'
          order by (p.role = 'client_owner') desc, coalesce(p.full_name, p.email)`, [org])).rows;
      return { collaborators: rows };
    });
  }

  // Suspende/reativa um colaborador (active=false → perde o Portal no boot, SEM excluir). O dono
  // nunca é suspenso, e ninguém suspende a si mesmo.
  @Post('collaborator/active')
  collabActive(@Req() req: any, @Body() b: any) {
    const user = String(b?.user_id || '');
    const active = b?.active === true;
    return this.db.asService(async (c) => {
      const org = await this.gerenciaModulos(c, this.uid(req), user);
      if (!org) return { error: 'sem permissão' };
      if (user === this.uid(req)) return { error: 'você não pode suspender a si mesmo' };
      const alvo = (await c.query('select role::text r from public.profiles where id=$1', [user])).rows[0];
      if (alvo?.r === 'client_owner') return { error: 'o dono da conta não pode ser suspenso' };
      await c.query('update public.profiles set active=$2, updated_at=now() where id=$1', [user, active]);
      return { ok: true, active };
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

  // ── Base de conhecimento do cliente: reuniões & minutas ───────────────────────
  // Escrita SÓ da Crasto.AI (quem faz a reunião e registra a minuta); leitura pelo cliente.
  private async requireAdmin(c: any, uid: string): Promise<{ id: string; name: string } | null> {
    const r = (await c.query(`select full_name, role::text rr from public.profiles where id=$1`, [uid])).rows[0];
    return r?.rr === 'crasto_admin' ? { id: uid, name: r.full_name || 'Crasto.AI' } : null;
  }

  @Post('meetings')
  meetingCreate(@Req() req: any, @Body() b: any) {
    return this.db.asService(async (c) => {
      const adm = await this.requireAdmin(c, this.uid(req));
      if (!adm) return { error: 'sem permissão' };
      if (!b?.organization_id || !b?.meeting_at || !b?.title) return { error: 'org, data e título são obrigatórios' };
      const r = await c.query(
        `insert into delivery.client_meetings (organization_id, meeting_at, title, attendees, summary, transcript, created_by, created_by_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [b.organization_id, b.meeting_at, b.title, b.attendees || null, b.summary || null, b.transcript || null, adm.id, adm.name]);
      return { ok: true, id: r.rows[0].id };
    });
  }

  @Get('meetings')
  meetingsByOrg(@Req() req: any, @Query('org') org: string) {
    return this.db.asService(async (c) => {
      if (!(await this.requireAdmin(c, this.uid(req)))) return { error: 'sem permissão' };
      return (await c.query(
        `select id, meeting_at, title, attendees, summary, transcript, created_by_name, created_at
           from delivery.client_meetings where organization_id=$1 order by meeting_at desc`, [org])).rows;
    });
  }

  @Delete('meetings/:id')
  meetingRemove(@Req() req: any, @Param('id') id: string) {
    return this.db.asService(async (c) => {
      if (!(await this.requireAdmin(c, this.uid(req)))) return { error: 'sem permissão' };
      await c.query(`delete from delivery.client_meetings where id=$1`, [id]);
      return { ok: true };
    });
  }

  // CLIENTE: as reuniões da PRÓPRIA empresa (RLS por org). Só leitura.
  @Get('meetings/mine')
  meetingsMine(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) =>
      (await c.query(
        `select id, meeting_at, title, attendees, summary, transcript, created_by_name
           from delivery.client_meetings order by meeting_at desc`)).rows);
  }

  // ── HISTÓRICO DE IMPLANTAÇÃO — o quê / quando / QUEM implantou ──────────────
  // A Crasto.AI registra cada marco; o cliente vê no card "Implantação". Só a Crasto
  // escreve (requireAdmin). O `module_name` sai do apelido da instância ou do nome do módulo.
  @Post('impl-events')
  implEventCreate(@Req() req: any, @Body() b: any) {
    return this.db.asService(async (c) => {
      const adm = await this.requireAdmin(c, this.uid(req));
      if (!adm) return { error: 'sem permissão' };
      if (!b?.organization_id || !b?.happened_at || !b?.title) return { error: 'org, data e título são obrigatórios' };
      const r = await c.query(
        `insert into delivery.implementation_events
           (organization_id, client_module_id, happened_at, title, detail, performed_by_name, created_by, created_by_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [b.organization_id, b.client_module_id || null, b.happened_at, b.title, b.detail || null, b.performed_by_name || null, adm.id, adm.name]);
      return { ok: true, id: r.rows[0].id };
    });
  }

  @Get('impl-events')
  implEventsByOrg(@Req() req: any, @Query('org') org: string) {
    return this.db.asService(async (c) => {
      if (!(await this.requireAdmin(c, this.uid(req)))) return { error: 'sem permissão' };
      return (await c.query(
        `select e.id, e.happened_at, e.title, e.detail, e.performed_by_name, e.created_by_name, e.client_module_id,
                coalesce(nullif(cm.label,''), vm.name) as module_name
           from delivery.implementation_events e
           left join delivery.client_modules cm on cm.id = e.client_module_id
           left join catalog.vdi_modules vm on vm.id = cm.vdi_module_id
          where e.organization_id=$1 order by e.happened_at desc`, [org])).rows;
    });
  }

  @Delete('impl-events/:id')
  implEventRemove(@Req() req: any, @Param('id') id: string) {
    return this.db.asService(async (c) => {
      if (!(await this.requireAdmin(c, this.uid(req)))) return { error: 'sem permissão' };
      await c.query(`delete from delivery.implementation_events where id=$1`, [id]);
      return { ok: true };
    });
  }

  // CLIENTE: os marcos da implantação da PRÓPRIA empresa (RLS por org). Só leitura.
  @Get('impl-events/mine')
  implEventsMine(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) =>
      (await c.query(
        `select e.id, e.happened_at, e.title, e.detail, e.performed_by_name, e.created_by_name, e.client_module_id,
                coalesce(nullif(cm.label,''), vm.name) as module_name
           from delivery.implementation_events e
           left join delivery.client_modules cm on cm.id = e.client_module_id
           left join catalog.vdi_modules vm on vm.id = cm.vdi_module_id
          order by e.happened_at desc`)).rows);
  }

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

  /**
   * USO DO AGENTE DE IA — federado do wacrm (whatsapp.messages/conversations). Repassa o Bearer
   * do próprio cliente; o wacrm escopa por org. Taxa de automação = ai/(ai+human) das respostas,
   * 30 dias. CRM fora → hasData=false (o Portal mostra "—", nunca número inventado).
   */
  @Get('agent-usage')
  async agentUsage(@Req() req: any) {
    const url = process.env.CRM_API_URL, auth = req?.headers?.authorization;
    if (!url || !auth) return { hasData: false };
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/api/me/agent-usage`, { headers: { Authorization: auth } });
      const j = await r.json().catch(() => ({ hasData: false }));
      return j && typeof j === 'object' ? j : { hasData: false };
    } catch { return { hasData: false }; }
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

  /**
   * LOG DE ACESSOS (tempo real) — cada abertura de módulo é um evento, do mais recente para o mais
   * antigo. Diferente do summary (agregado por pessoa+módulo), aqui o dono vê a TRILHA: "quem abriu
   * o quê e quando", inclusive sessões ainda ABERTAS (ao vivo). RLS igual ao summary (asUser): o dono
   * vê a org, o membro só o próprio. `ao_vivo` = sem ended_at e com pulso nos últimos 3 minutos.
   */
  @Get('module-sessions/recent')
  msRecent(@Req() req: any, @Query('org') org: string, @Query('dias') dias: string, @Query('limit') limit: string) {
    const d = Math.max(1, Math.min(365, Number(dias) || 30));
    const lim = Math.max(1, Math.min(200, Number(limit) || 60));
    return this.db.asUser(this.uid(req), async (c) => (await c.query(
      `select s.id, s.user_id, p.full_name, p.email,
              coalesce(cm.label, v.name, 'Módulo') as modulo,
              s.started_at,
              coalesce(s.ended_at, s.last_seen_at) as fim,
              extract(epoch from (coalesce(s.ended_at, s.last_seen_at) - s.started_at))::int as segundos,
              (s.ended_at is null and s.last_seen_at > now() - interval '3 minutes') as ao_vivo
         from delivery.module_sessions s
         left join public.profiles p on p.id = s.user_id
         left join delivery.client_modules cm on cm.id = s.client_module_id
         left join catalog.vdi_modules v on v.id = s.vdi_module_id
        where s.started_at > now() - ($1 || ' days')::interval
          and ($2::uuid is null or s.organization_id = $2::uuid)
        order by s.started_at desc
        limit ${lim}`,
      [String(d), org || null],
    )).rows);
  }

  // ── client_services ──
  private readonly SVC = 'id,service_id,status,notes,service_name,service_description,service_category,service_unit,situacao,periodo,modalidade,cost_allocation,especificacoes';
  @Get('services/mine')
  svcMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.SVC} from delivery.client_services`)).rows); }
  @Get('services')
  svcByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.SVC} from delivery.client_services where organization_id=$1`, [org])).rows); }
  @Post('services')
  svcAttach(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query(`insert into delivery.client_services (organization_id,service_id,status,service_name,service_description,service_category,service_unit,situacao,periodo,modalidade,cost_allocation,especificacoes) values ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [b.organization_id, b.service_id, b.service_name ?? null, b.service_description ?? null, b.service_category ?? null, b.service_unit ?? null, b.situacao ?? 'contratado', b.periodo ?? null, b.modalidade ?? null, b.cost_allocation ?? null, b.especificacoes ?? null]); return { ok: true }; }); }
  @Delete('services/:id')
  svcDetach(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.client_services where id=$1', [id]); return { ok: true }; }); }
  @Patch('services/:id/status')
  svcStatus(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query('update delivery.client_services set status=$2 where id=$1', [id, b.status ?? null]); return { ok: true }; }); }
  @Patch('services/:id')
  svcUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    const cols = ['situacao', 'periodo', 'modalidade', 'cost_allocation', 'especificacoes', 'status', 'notes', 'service_name', 'service_description'];
    const keys = cols.filter((k) => k in (b || {}));
    if (!keys.length) return { ok: true };
    const sets = keys.map((k, i) => `"${k}"=$${i + 2}`).join(', ');
    const vals = keys.map((k) => (b[k] === '' ? null : b[k]));
    return this.db.asUser(this.uid(req), async (c) => { await c.query(`update delivery.client_services set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; });
  }
}
