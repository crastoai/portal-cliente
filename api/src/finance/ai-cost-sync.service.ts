import { Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';

// Sincroniza o CUSTO REAL de IA direto das APIs de billing dos provedores para finance.ai_costs.
// REALIDADE (docs oficiais): os provedores agregam por DIA, não "tempo real". Custo real só sai
// com CHAVE DE ADMIN (diferente da de inferência): Anthropic `sk-ant-admin…` (cofre: anthropic_admin),
// OpenAI admin com escopo api.usage.read (cofre: openai_admin). Gemini não tem API de custo
// (Cloud Billing) → estimado por tokens em outra frente. Aqui: Anthropic + OpenAI (billed em US$).
type Resultado = { provider: string; ok: boolean; cost?: number; linhas?: number; erro?: string };

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

  // Grava/atualiza UMA linha por provedor+mês (marca purpose='auto-sync' p/ não duplicar no re-sync).
  private async gravar(uid: string, provider: string, platform: string, cost: number, start: string, end: string): Promise<number> {
    return this.db.asUser(uid, async (c) => {
      const ex = (await c.query(`select id from finance.ai_costs where provider=$1 and purpose='auto-sync' and period_start=$2`, [provider, start])).rows[0];
      const row: any = { provider, platform, purpose: 'auto-sync', kind: 'interno', status: 'active', cost: +cost.toFixed(2), period_start: start, period_end: end };
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

  /** Sincroniza os provedores com API de custo real (US$). Nunca lança: devolve status por provedor. */
  async sync(uid: string, opts?: { from?: string; to?: string }): Promise<{ periodo: { start: string; end: string }; resultados: Resultado[] }> {
    const { start, end } = this.periodo(opts?.from, opts?.to);
    const resultados: Resultado[] = [];
    for (const fn of [this.anthropic.bind(this), this.openai.bind(this)]) {
      try { resultados.push(await fn(uid, start, end)); }
      catch (e: any) { resultados.push({ provider: 'desconhecido', ok: false, erro: e?.message || 'falha' }); }
    }
    return { periodo: { start, end }, resultados };
  }
}
