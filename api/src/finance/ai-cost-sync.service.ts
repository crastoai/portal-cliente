import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'crypto';
import { Pool } from 'pg';
import { RlsDbService } from '../common/rls-db.service';

// Sincroniza o CUSTO REAL de IA direto das APIs de billing dos provedores para finance.ai_costs.
// REALIDADE (docs oficiais): os provedores agregam por DIA, não "tempo real". Custo real só sai
// com CHAVE DE ADMIN (diferente da de inferência): Anthropic `sk-ant-admin…` (cofre: anthropic_admin),
// OpenAI admin com escopo api.usage.read (cofre: openai_admin). GEMINI: não tem API de custo com
// key simples — o custo é do Google Cloud Billing, lido do BigQuery Export com uma Service Account
// (integração google_billing). Aqui: Anthropic + OpenAI (US$) + Google/Gemini (moeda da conta, BRL).
type Resultado = { provider: string; ok: boolean; cost?: number; linhas?: number; erro?: string };

const b64url = (s: string | Buffer) => Buffer.from(s as any).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Soma recursiva de todos os `amount.value` da resposta (defensivo p/ variações de shape).
function somarAmounts(obj: any): number {
  let v = 0;
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (o.amount && o.amount.value != null) v += Number(o.amount.value) || 0;
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') walk(o[k]);
  };
  walk(obj);
  return v;
}

@Injectable()
export class AiCostSyncService {
  private log = new Logger('AiCostSync');
  // Pool cross-DB pro wacrm (só criado se WACRM_DATABASE_URL estiver setada). Lazy: só abre
  // quando o sync do DeepSeek roda pela 1ª vez. Reusado nas próximas rodadas (pooler Supabase).
  private wacrmPool?: Pool;
  private wacrmDb(): Pool | null {
    const url = process.env.WACRM_DATABASE_URL;
    if (!url) return null;
    if (!this.wacrmPool) {
      this.wacrmPool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
        max: 3, // sync roda em série; 3 dá folga sem estourar o pooler do wacrm
        connectionTimeoutMillis: 8000,
      });
    }
    return this.wacrmPool;
  }
  constructor(private readonly db: RlsDbService) {}

  private revealKey(provider: string): Promise<string | null> {
    return this.db.asService(async (c) => { try { return (await c.query(`select public.reveal_provider_key($1) as k`, [provider])).rows[0]?.k ?? null; } catch { return null; } });
  }

  private periodo(from?: string, to?: string): { start: string; end: string } {
    const now = new Date();
    const start = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = to || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { start, end };
  }

  // Grava/atualiza UMA linha por (provider, purpose, organization_id, mês).
  // organization_id = null → linha "interno/plataforma" (fallback, ex.: chave global do Portal).
  // organization_id preenchido → linha "cliente" (custo do cliente X naquele provedor/mês).
  // O `purpose='auto-sync'` distingue do lançamento manual do operador.
  private async gravar(uid: string, provider: string, platform: string, cost: number, start: string, end: string, organizationId?: string | null): Promise<number> {
    return this.db.asUser(uid, async (c) => {
      // O schema `finance` não é acessível direto pelo authenticated → dedup pela RPC do painel
      // (admin_ai_cost) e escrita pela RPC (fin_ai_cost_upsert, que revalida admin). Nada de
      // SELECT direto em finance.* (era o "permission denied for schema finance").
      const panel = (await c.query(`select public.admin_ai_cost($1,$2) as r`, [start, end])).rows[0]?.r || {};
      const orgKey = organizationId || null;
      const ex = (panel.rows || []).find((x: any) => x.provider === provider && x.purpose === 'auto-sync' && (x.organization_id || null) === orgKey);
      const row: any = { provider, platform, purpose: 'auto-sync', kind: orgKey ? 'cliente' : 'interno', status: 'active', cost: +cost.toFixed(2), period_start: start, period_end: end, organization_id: orgKey };
      if (ex?.id) row.id = ex.id;
      await c.query(`select public.fin_ai_cost_upsert($1)`, [row]);
      return 1;
    });
  }

  private async anthropic(uid: string, start: string, end: string): Promise<Resultado> {
    const key = await this.revealKey('anthropic_admin');
    if (!key) return { provider: 'anthropic', ok: false, erro: 'falta a Admin key da Anthropic no cofre (provedor "anthropic_admin", formato sk-ant-admin…).' };
    const r = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${start}T00:00:00Z&ending_at=${end}T23:59:59Z`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return { provider: 'anthropic', ok: false, erro: `Anthropic ${r.status}: ${String(j?.error?.message || '').slice(0, 120)}` };
    const cost = somarAmounts(j) / 100; // Anthropic devolve o valor em CENTAVOS (string)
    const linhas = await this.gravar(uid, 'anthropic', 'claude_api', cost, start, end);
    return { provider: 'anthropic', ok: true, cost, linhas };
  }

  private async openai(uid: string, start: string, end: string): Promise<Resultado> {
    const key = await this.revealKey('openai_admin');
    if (!key) return { provider: 'openai', ok: false, erro: 'falta a Admin key da OpenAI no cofre (provedor "openai_admin", escopo api.usage.read).' };
    const st = Math.floor(new Date(start + 'T00:00:00Z').getTime() / 1000);
    const et = Math.floor(new Date(end + 'T23:59:59Z').getTime() / 1000);
    const r = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${st}&end_time=${et}&bucket_width=1d&limit=180`, { headers: { Authorization: 'Bearer ' + key } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return { provider: 'openai', ok: false, erro: `OpenAI ${r.status}: ${String(j?.error?.message || j?.error || '').slice(0, 120)}` };
    const cost = somarAmounts(j); // OpenAI devolve em US$
    const linhas = await this.gravar(uid, 'openai', 'gpt', cost, start, end);
    return { provider: 'openai', ok: true, cost, linhas };
  }

  // ── GOOGLE / GEMINI — custo real do Google Cloud Billing via BigQuery Export ──
  // Gera um access token OAuth a partir da Service Account (JWT RS256) e consulta a tabela do
  // billing export somando o custo LÍQUIDO (cost + créditos) do Gemini no período.
  private async googleToken(sa: any): Promise<string | null> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
      const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/bigquery.readonly', aud, iat: now, exp: now + 3600 }));
      const signer = createSign('RSA-SHA256'); signer.update(`${header}.${claim}`); signer.end();
      const sig = b64url(signer.sign(sa.private_key));
      const r = await fetch(aud, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claim}.${sig}`,
      });
      const j: any = await r.json().catch(() => ({}));
      return j?.access_token ?? null;
    } catch { return null; }
  }
  private googleMeta(): Promise<any> {
    return this.db.asService(async (c) => { try { return (await c.query(`select meta from automation.integration_configs where key='google_billing'`)).rows[0]?.meta || {}; } catch { return {}; } });
  }
  // Lê o mapa project_id → organization_id (registrado pelo admin em /financeiro/custo-ia).
  // Cache implícito: chamado 1× por sync. Se o project_id vier do BQ e não estiver mapeado,
  // o custo daquele projeto vira "Interno / plataforma" (organization_id=null) — visível na UI
  // p/ o operador saber que falta cadastrar.
  private async projectMap(): Promise<Record<string, { orgId: string | null; ignore: boolean }>> {
    return this.db.asService(async (c) => {
      try {
        const rs = (await c.query(`select project_id, organization_id, ignore from automation.gcp_project_map`)).rows;
        const m: Record<string, { orgId: string | null; ignore: boolean }> = {};
        for (const r of rs) m[r.project_id] = { orgId: r.organization_id || null, ignore: !!r.ignore };
        return m;
      } catch { return {}; }
    });
  }

  private async google(uid: string, start: string, end: string): Promise<Resultado> {
    const raw = await this.revealKey('google_billing');
    if (!raw) return { provider: 'google', ok: false, erro: 'falta a Service Account (JSON) do Google no cofre — integração "Google Cloud Billing (Gemini)".' };
    let sa: any; try { sa = JSON.parse(raw); } catch { return { provider: 'google', ok: false, erro: 'Service Account inválida (o segredo não é um JSON válido).' }; }
    const meta = await this.googleMeta();
    const safe = (s: any) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const proj = safe(meta.project_id), ds = safe(meta.dataset), ba = safe(meta.billing_account).replace(/-/g, '_');
    if (!proj || !ds || !ba) return { provider: 'google', ok: false, erro: 'faltam Project ID / dataset / conta de faturamento na integração Google.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { provider: 'google', ok: false, erro: 'período inválido.' };
    const token = await this.googleToken(sa);
    if (!token) return { provider: 'google', ok: false, erro: 'não autentiquei a Service Account no Google (verifique o JSON e os papéis BigQuery).' };
    // Quebra por project.id — cada projeto GCP é 1 cliente (chave própria do AI Studio). Antes
    // vinha agregado ("Interno / plataforma"): impossível separar custo por cliente.
    const sql = `SELECT project.id AS project_id, project.name AS project_name,
                        SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c),0)) AS total
      FROM \`${proj}.${ds}.gcp_billing_export_v1_${ba}\`
      WHERE (LOWER(service.description) LIKE '%gemini%' OR LOWER(service.description) LIKE '%generative language%')
        AND DATE(usage_start_time) BETWEEN '${start}' AND '${end}'
      GROUP BY project_id, project_name`;
    const r = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${proj}/queries`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 30000 }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return { provider: 'google', ok: false, erro: `BigQuery ${r.status}: ${String(j?.error?.message || '').slice(0, 140)}` };
    const rows: any[] = j?.rows || [];
    if (!rows.length) return { provider: 'google', ok: true, cost: 0, linhas: 0 };
    // O sync é a fonte da verdade do Gemini no período — apaga e regrava, evita duplicata
    // quando o admin cadastra o mapa DEPOIS do 1º sync (antes: 1 linha sem org + 1 com org,
    // porque o dedup do gravar() é (provider,purpose,org), não sabe reconciliar).
    await this.db.asUser(uid, async (c) => { await c.query(`select public.fin_ai_cost_delete_auto_sync('google', $1, $2)`, [start, end]); });
    const map = await this.projectMap();
    let totalGeral = 0, linhas = 0, semMap = 0, ignorados = 0;
    for (const row of rows) {
      const pid = String(row?.f?.[0]?.v || '');
      const total = Number(row?.f?.[2]?.v || 0);
      if (!pid || !isFinite(total)) continue;
      const entry = map[pid];
      if (entry?.ignore) { ignorados++; continue; } // chave global antiga, projetos pessoais, etc.
      const orgId = entry?.orgId ?? null;
      if (!orgId) semMap++;
      await this.gravar(uid, 'google', 'gemini', total, start, end, orgId);
      totalGeral += total; linhas++;
    }
    const notas: string[] = [];
    if (semMap > 0) notas.push(`${semMap} projeto(s) sem mapeamento — cadastre em Financeiro > Custo IA > "Projetos GCP".`);
    if (ignorados > 0) notas.push(`${ignorados} projeto(s) ignorado(s).`);
    return { provider: 'google', ok: true, cost: totalGeral, linhas, ...(notas.length ? { erro: notas.join(' ') } : {}) };
  }

  // ── DEEPSEEK — custo ESTIMADO por cliente, calculado a partir dos tokens gastos ──
  // DeepSeek NÃO tem API oficial de custo por período (só /user/balance = saldo restante).
  // Solução: cross-DB → puxa direto do wacrm.runtime_events (que já grava tokens_in/out por
  // agente a cada chamada LLM, via obs.evento), soma por organization_id × modelo, multiplica
  // pelo pricing oficial (doc lida ao vivo em 2026-08-04), grava em finance.ai_costs.
  // Regravação a cada sync: apaga auto-sync do período e reescreve — evita duplicata quando
  // o admin roda o botão várias vezes.
  //
  // Precisão: usa o preço "cache miss" da doc DeepSeek (pior caso). Se o modelo usar cache
  // com frequência, o custo REAL vai ser 1-3% menor. Melhor superestimar 1% que subestimar.
  // Preços por 1M tokens [input, output] em USD. Atualizar aqui quando DeepSeek mudar preço.
  private static readonly DEEPSEEK_PRICE: Record<string, [number, number]> = {
    'deepseek-v4-flash': [0.14, 0.28],
    'deepseek-v4-pro': [0.435, 0.87],
  };
  private async deepseek(uid: string, start: string, end: string): Promise<Resultado> {
    const wacrm = this.wacrmDb();
    if (!wacrm) return { provider: 'deepseek', ok: false, erro: 'falta WACRM_DATABASE_URL no .env desta API — sem ela, não consigo agregar tokens do wacrm.' };
    // Agrega tokens por organization_id × modelo no período. Considera SÓ eventos LLM ok=true
    // com provider=deepseek. Data usa timezone SP (mesmo padrão do resto do financeiro).
    let rows: { organization_id: string | null; model: string; ti: number; too: number }[];
    try {
      const c = await wacrm.connect();
      try {
        const r = await c.query(
          `select organization_id, name as model,
                  coalesce(sum((detail->>'tokens_in')::bigint), 0)::bigint as ti,
                  coalesce(sum((detail->>'tokens_out')::bigint), 0)::bigint as too
             from whatsapp.runtime_events
            where kind = 'llm' and ok = true
              and (detail->>'provider') = 'deepseek'
              and (created_at at time zone 'America/Sao_Paulo')::date between $1::date and $2::date
            group by organization_id, name`,
          [start, end],
        );
        rows = r.rows.map((x: any) => ({ organization_id: x.organization_id, model: x.model, ti: Number(x.ti), too: Number(x.too) }));
      } finally { c.release(); }
    } catch (e: any) {
      return { provider: 'deepseek', ok: false, erro: `falha ao ler wacrm: ${(e.message || '').slice(0, 160)}` };
    }
    if (!rows.length) return { provider: 'deepseek', ok: true, cost: 0, linhas: 0 };
    // Reescreve limpo (mesmo padrão do Google): apaga auto-sync deepseek do período e regrava.
    await this.db.asUser(uid, async (c) => { await c.query(`select public.fin_ai_cost_delete_auto_sync('deepseek', $1, $2)`, [start, end]); });
    // O painel financeiro mostra R$. O pricing DeepSeek é em USD → converto pra BRL (a mesma
    // moeda do Google, que já vem em BRL do BigQuery). Taxa por env (USD_BRL), default 5.40.
    const USD_BRL = Number(process.env.USD_BRL) || 5.40;
    // Soma por org (agregando todos os modelos daquela org num único lançamento).
    const byOrg = new Map<string, number>(); // org → custo em BRL
    let totalGeral = 0;
    for (const r of rows) {
      // Modelo desconhecido → assume flash (nunca ignora silenciosamente: melhor estimar que sumir).
      const preco = AiCostSyncService.DEEPSEEK_PRICE[r.model] || AiCostSyncService.DEEPSEEK_PRICE['deepseek-v4-flash'];
      const brl = ((r.ti / 1e6) * preco[0] + (r.too / 1e6) * preco[1]) * USD_BRL;
      const orgKey = r.organization_id || '__internal__';
      byOrg.set(orgKey, (byOrg.get(orgKey) || 0) + brl);
      totalGeral += brl;
    }
    let linhas = 0;
    for (const [orgKey, brl] of byOrg.entries()) {
      if (brl < 0.005) continue; // ignora migalha < meio centavo (evita ruído)
      const orgId = orgKey === '__internal__' ? null : orgKey;
      await this.gravar(uid, 'deepseek', 'deepseek_api', brl, start, end, orgId);
      linhas++;
    }
    return { provider: 'deepseek', ok: true, cost: totalGeral, linhas };
  }

  /**
   * VISÃO DE DONO (CEO) — métricas de NEGÓCIO do custo de IA, não só o número bruto.
   * O que o Carlos precisa/tem dor de ver:
   *  - economia_deepseek: quanto ele ECONOMIZA usando DeepSeek em vez do Gemini (a decisão dele
   *    de trocar pra cortar custo — provada em R$)
   *  - run_rate: projeção de fechamento do mês (custo atual ÷ dias corridos × dias do mês)
   *  - por_cliente: custo de IA + leads + conversas + custo POR LEAD e POR CONVERSA (unit economics)
   *  - ranking implícito (por_cliente vem ordenado por custo desc)
   * Cross-DB: custo vem do Portal (finance via RPC); tokens/leads/conversas vêm do wacrm.
   */
  async insights(uid: string, opts?: { from?: string; to?: string }): Promise<any> {
    const { start, end } = this.periodo(opts?.from, opts?.to);
    const USD_BRL = Number(process.env.USD_BRL) || 5.40;
    // 1) Custo por cliente (BRL) do período — via RPC do painel (mesma fonte da tela).
    const panel = await this.db.asUser(uid, async (c) => (await c.query(`select public.admin_ai_cost($1,$2) as r`, [start, end])).rows[0]?.r || {});
    const byClient: any[] = (panel.by_client || []).filter((r: any) => r.organization_id);
    const custoOrg = new Map<string, number>(byClient.map((r: any) => [r.organization_id, Number(r.cost || 0)]));
    const nomeOrg = new Map<string, string>(byClient.map((r: any) => [r.organization_id, r.organization_name]));
    const custoTotal = Number(panel.summary?.total || 0);

    // 2) wacrm: tokens DeepSeek (economia), leads e conversas ativas por org no período.
    const wacrm = this.wacrmDb();
    let dsTokens: any[] = [], leads: any[] = [], convs: any[] = [], nomes: any[] = [];
    if (wacrm) {
      const c = await wacrm.connect();
      try {
        nomes = (await c.query(`select id, name from public.organizations`)).rows;
        dsTokens = (await c.query(`
          select organization_id,
                 coalesce(sum((detail->>'tokens_in')::bigint),0) ti,
                 coalesce(sum((detail->>'tokens_out')::bigint),0) too
            from whatsapp.runtime_events
           where kind='llm' and ok=true and (detail->>'provider')='deepseek'
             and (created_at at time zone 'America/Sao_Paulo')::date between $1::date and $2::date
           group by 1`, [start, end])).rows;
        leads = (await c.query(`
          select organization_id, count(*)::int n from whatsapp.leads
           where (created_at at time zone 'America/Sao_Paulo')::date between $1::date and $2::date
           group by 1`, [start, end])).rows;
        convs = (await c.query(`
          select cv.organization_id, count(distinct cv.id)::int n
            from whatsapp.conversations cv
           where exists (select 1 from whatsapp.messages m where m.conversation_id=cv.id
                          and (m.created_at at time zone 'America/Sao_Paulo')::date between $1::date and $2::date)
           group by 1`, [start, end])).rows;
      } finally { c.release(); }
    }
    const leadsOrg = new Map<string, number>(leads.map((r: any) => [r.organization_id, Number(r.n)]));
    const convsOrg = new Map<string, number>(convs.map((r: any) => [r.organization_id, Number(r.n)]));
    // Nome do cliente: prioriza o do painel (com custo); senão o do wacrm (org com atividade sem custo).
    for (const r of nomes) if (r.id && !nomeOrg.has(r.id)) nomeOrg.set(r.id, r.name);

    // RECEITA (MRR) por cliente — derivada dos CONTRATOS recorrentes (recebíveis) no financeiro:
    // MRR = total do contrato ÷ meses de vigência. Só conta recorrente (validade em meses > 0);
    // serviço avulso (workshop, setup) NÃO entra na mensalidade. É a base do farol de margem.
    const mrrOrg = new Map<string, number>();
    try {
      const recebiveis = await this.db.asUser(uid, async (c) => (await c.query(`select * from public.fin_accounts('receivable', null)`)).rows);
      for (const a of recebiveis as any[]) {
        const org = a.organization_id;
        const meses = String(a.contract_validity_unit) === 'months' ? Number(a.contract_validity_value || 0) : 0;
        const total = Number(a.contract_total || a.amount || 0);
        if (!org || meses <= 0 || total <= 0) continue; // avulso/sem-vigência não é MRR
        mrrOrg.set(org, (mrrOrg.get(org) || 0) + total / meses);
      }
    } catch { /* sem receita cadastrada → margem fica indisponível, farol cinza */ }

    // Economia DeepSeek: o que pagaria no Gemini Flash − o que paga no DeepSeek Flash (mesmos tokens).
    const GEM: [number, number] = [0.30, 2.5], DS: [number, number] = [0.14, 0.28];
    let economiaBrl = 0, ttGemBrl = 0, ttDsBrl = 0;
    for (const r of dsTokens) {
      const ti = Number(r.ti), too = Number(r.too);
      const gem = (ti / 1e6 * GEM[0] + too / 1e6 * GEM[1]) * USD_BRL;
      const ds = (ti / 1e6 * DS[0] + too / 1e6 * DS[1]) * USD_BRL;
      economiaBrl += gem - ds; ttGemBrl += gem; ttDsBrl += ds;
    }

    // Run-rate: projeta o fechamento do mês pela proporção de dias corridos.
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const projetado = diaHoje > 0 ? (custoTotal / diaHoje) * diasMes : custoTotal;

    // FARÓIS de margem — quanto da RECEITA (MRR) do cliente a IA consome (regra de negócio):
    //   🟢 verde  = IA < 5% da receita   → saudável
    //   🟠 laranja= 5%–15%               → atenção
    //   🔴 vermelho= > 15% OU margem negativa → prejuízo/crítico
    //   ⚪ cinza   = sem receita cadastrada → não dá pra avaliar a margem
    // Thresholds por env (FAROL_VERDE_PCT / FAROL_LARANJA_PCT) — default 5 e 15.
    const V = Number(process.env.FAROL_VERDE_PCT) || 5, L = Number(process.env.FAROL_LARANJA_PCT) || 15;
    const farolDe = (pct: number | null): 'verde' | 'laranja' | 'vermelho' | 'cinza' => {
      if (pct == null) return 'cinza';
      if (pct < V) return 'verde';
      if (pct <= L) return 'laranja';
      return 'vermelho';
    };
    // Unit economics + margem por cliente (ordenado por custo desc = ranking dos mais caros).
    const orgIds = new Set<string>([...custoOrg.keys(), ...leadsOrg.keys(), ...convsOrg.keys(), ...mrrOrg.keys()]);
    const porCliente = [...orgIds].map((org) => {
      const custo = custoOrg.get(org) || 0;
      const nl = leadsOrg.get(org) || 0, nc = convsOrg.get(org) || 0;
      const mrr = mrrOrg.get(org) || 0;
      const pctIa = mrr > 0 ? Math.round((custo / mrr) * 10000) / 100 : null; // % da receita consumido pela IA
      return {
        organization_id: org, cliente: nomeOrg.get(org) || '—',
        custo_ia: Math.round(custo * 100) / 100,
        leads: nl, conversas: nc,
        custo_por_lead: nl > 0 ? Math.round((custo / nl) * 100) / 100 : null,
        custo_por_conversa: nc > 0 ? Math.round((custo / nc) * 100) / 100 : null,
        mrr: mrr > 0 ? Math.round(mrr * 100) / 100 : null,
        margem_apos_ia: mrr > 0 ? Math.round((mrr - custo) * 100) / 100 : null,
        pct_receita_ia: pctIa,
        farol: farolDe(pctIa),
      };
    }).filter((r) => r.custo_ia > 0 || r.leads > 0 || r.conversas > 0 || (r.mrr || 0) > 0)
      .sort((a, b) => (b.mrr || 0) - (a.mrr || 0) || b.custo_ia - a.custo_ia);

    return {
      periodo: { start, end },
      economia_deepseek: { brl: Math.round(economiaBrl * 100) / 100, seria_gemini: Math.round(ttGemBrl * 100) / 100, custa_deepseek: Math.round(ttDsBrl * 100) / 100, pct: ttGemBrl > 0 ? Math.round((economiaBrl / ttGemBrl) * 100) : 0 },
      run_rate: { atual: Math.round(custoTotal * 100) / 100, projetado_mes: Math.round(projetado * 100) / 100, dia_hoje: diaHoje, dias_mes: diasMes },
      por_cliente: porCliente,
    };
  }

  /** Sincroniza os provedores com custo real. Nunca lança: devolve status por provedor. */
  async sync(uid: string, opts?: { from?: string; to?: string }): Promise<{ periodo: { start: string; end: string }; resultados: Resultado[] }> {
    const { start, end } = this.periodo(opts?.from, opts?.to);
    const resultados: Resultado[] = [];
    for (const fn of [this.anthropic.bind(this), this.openai.bind(this), this.google.bind(this), this.deepseek.bind(this)]) {
      try { resultados.push(await fn(uid, start, end)); }
      catch (e: any) { resultados.push({ provider: 'desconhecido', ok: false, erro: e?.message || 'falha' }); }
    }
    return { periodo: { start, end }, resultados };
  }
}
