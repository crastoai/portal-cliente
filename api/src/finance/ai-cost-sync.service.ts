import { Injectable } from '@nestjs/common';
import { createSign } from 'crypto';
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
  private async projectMap(): Promise<Record<string, string | null>> {
    return this.db.asService(async (c) => {
      try {
        const rs = (await c.query(`select project_id, organization_id from automation.gcp_project_map`)).rows;
        const m: Record<string, string | null> = {};
        for (const r of rs) m[r.project_id] = r.organization_id || null;
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
    const map = await this.projectMap();
    let totalGeral = 0, linhas = 0, semMap = 0;
    for (const row of rows) {
      const pid = String(row?.f?.[0]?.v || '');
      const total = Number(row?.f?.[2]?.v || 0);
      if (!pid || !isFinite(total)) continue;
      const orgId = map[pid] ?? null;
      if (!orgId) semMap++;
      await this.gravar(uid, 'google', 'gemini', total, start, end, orgId);
      totalGeral += total; linhas++;
    }
    return { provider: 'google', ok: true, cost: totalGeral, linhas, ...(semMap > 0 ? { erro: `${semMap} projeto(s) sem mapeamento — abra a UI de "Projetos GCP" e vincule à organização.` } : {}) };
  }

  /** Sincroniza os provedores com custo real. Nunca lança: devolve status por provedor. */
  async sync(uid: string, opts?: { from?: string; to?: string }): Promise<{ periodo: { start: string; end: string }; resultados: Resultado[] }> {
    const { start, end } = this.periodo(opts?.from, opts?.to);
    const resultados: Resultado[] = [];
    for (const fn of [this.anthropic.bind(this), this.openai.bind(this), this.google.bind(this)]) {
      try { resultados.push(await fn(uid, start, end)); }
      catch (e: any) { resultados.push({ provider: 'desconhecido', ok: false, erro: e?.message || 'falha' }); }
    }
    return { periodo: { start, end }, resultados };
  }
}
