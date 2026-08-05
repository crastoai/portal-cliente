import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { RlsDbService } from '../common/rls-db.service';
import { JulieLlmService } from '../assistant/julie-llm.service';
import { WacrmMetricsService } from '../delivery/wacrm-metrics.service';

// PSIQUÊ — a inteligência do Cockpit (Meus Resultados). Roda no DeepSeek (garantia do Crasto).
// Fase 1: extrai o "antes" (Baseline de Entrada) de uma transcrição de reunião / texto, e grava
// em delivery.client_baseline. A narrativa diária (antes×depois em texto) entra no item 1.4.
// Regra de ouro: NUNCA inventa número — só extrai o que o texto afirma; sem número = 'nao_informado'.

// Chaves de métrica que casam com o Cockpit (para juntar antes↔depois). Unidades canônicas:
//   tempo_resposta = segundos · automacao = % · novos_leads/atendimentos = número/mês ·
//   custo_atendimento = R$/mês · horas_equipe = horas/mês
const METRICAS_VALIDAS = ['tempo_resposta', 'automacao', 'novos_leads', 'atendimentos', 'custo_atendimento', 'horas_equipe'];
const STATUS_VALIDOS = ['informado', 'nao_tinha', 'nao_informado', 'medido'];

export type BaselineMetric = { metric: string; label: string; valor_antes: number | null; unidade: string; status: string };

@Injectable()
export class PsiqueService implements OnModuleInit {
  private readonly logp = new Logger('Psique');
  constructor(private readonly db: RlsDbService, private readonly llm: JulieLlmService, private readonly wacrm: WacrmMetricsService) {}

  // AUTOMAÇÃO: renova a narrativa dos clientes ativos 1× no boot e a cada 24h. Só regenera quando o
  // snapshot muda (hash) — barato. Gate por env PSIQUE_DAILY=off. (Multi-réplica: adicionar lock.)
  onModuleInit() {
    if (process.env.PSIQUE_DAILY === 'off') return;
    setTimeout(() => this.rodarDiario().catch(() => {}), 90_000);
    setInterval(() => this.rodarDiario().catch(() => {}), 24 * 3600 * 1000);
  }
  async rodarDiario() {
    const orgs = await this.db.asService(async (c) => (await c.query(`select distinct organization_id from delivery.client_modules`)).rows.map((r: any) => r.organization_id));
    let n = 0;
    for (const org of orgs) { const r = await this.gerarNarrativa(org).catch(() => null); if (r && (r as any).ok) n++; }
    this.logp.log(`narrativa diária: ${n}/${orgs.length} regeneradas`);
  }

  private readonly SYSTEM = [
    'PAPEL: você é a Psiquê, a inteligência de resultados da Crasto.AI. Sua tarefa é extrair o BASELINE ("antes") de um cliente a partir de um texto — normalmente a transcrição de uma reunião comercial ou uma descrição da situação atual dele, ANTES de contratar a Crasto.AI.',
    'OBJETIVO: identificar, quando o texto disser, os indicadores de atendimento/negócio que o cliente tinha ANTES.',
    'FORMATO: responda SOMENTE um JSON válido, sem comentários, no formato:',
    '{ "metrics": [ { "metric": "<chave>", "label": "<rótulo curto pt-BR>", "valor_antes": <número|null>, "unidade": "<s|%|R$|>", "status": "informado|nao_tinha|nao_informado" } ] }',
    'CHAVES PERMITIDAS (use exatamente estas): tempo_resposta (tempo de 1ª resposta no atendimento, EM SEGUNDOS) · automacao (% do atendimento feito por IA) · novos_leads (leads captados por mês) · atendimentos (conversas/atendimentos por mês) · custo_atendimento (custo mensal de atendimento em R$) · horas_equipe (horas/mês da equipe no atendimento).',
    'CONVERSÕES: tempo sempre em SEGUNDOS (2 horas → 7200; 30 min → 1800). Dinheiro como número (R$ 8.400 → 8400). Percentual como número (62% → 62).',
    'FREIO (anti-alucinação, obrigatório):',
    ' • Só inclua uma métrica se o texto a MENCIONAR. Se não for mencionada, NÃO a inclua (não invente).',
    ' • Se o cliente disser que NÃO tinha aquilo (ex.: "não tínhamos IA", "não respondíamos fora do horário") → status "nao_tinha" e valor_antes null.',
    ' • Se mencionar mas sem número claro → status "nao_informado" e valor_antes null.',
    ' • Se der um número → status "informado" e valor_antes com o número convertido.',
    ' • NUNCA invente valores. Na dúvida, use "nao_informado". É melhor faltar do que mentir.',
    'Devolva o JSON e nada mais.',
  ].join('\n');

  // Extrai o JSON da resposta do modelo (tolera cercas ```json e texto ao redor).
  private parseJson(text: string): any {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fence ? fence[1] : text;
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s < 0 || e < 0) throw new Error('Psiquê não devolveu JSON.');
    return JSON.parse(raw.slice(s, e + 1));
  }

  // Normaliza + valida uma métrica vinda do modelo (descarta chave/estado inválido; nunca deixa lixo entrar).
  private normalizar(m: any): BaselineMetric | null {
    const metric = String(m?.metric || '').trim();
    if (!METRICAS_VALIDAS.includes(metric)) return null;
    let status = String(m?.status || 'nao_informado').trim();
    if (!STATUS_VALIDOS.includes(status)) status = 'nao_informado';
    let valor: number | null = m?.valor_antes == null || m?.valor_antes === '' ? null : Number(m.valor_antes);
    if (valor != null && !Number.isFinite(valor)) valor = null;
    if (status !== 'informado' && status !== 'medido') valor = null; // coerência: só há número quando informado/medido
    if (status === 'informado' && valor == null) status = 'nao_informado';
    return { metric, label: String(m?.label || metric).slice(0, 80), valor_antes: valor, unidade: String(m?.unidade || '').slice(0, 8), status };
  }

  // Grava as métricas do baseline (append-only): marca as anteriores da mesma métrica como não-vigentes.
  async gravar(orgId: string, metrics: BaselineMetric[], fonte: string, opts: { baselineDate?: string | null; createdBy?: string | null; createdByName?: string | null }) {
    if (!metrics.length) return { ok: true, gravadas: 0 };
    return this.db.asService(async (c) => {
      for (const m of metrics) {
        await c.query(`update delivery.client_baseline set is_current=false where organization_id=$1 and metric=$2 and is_current`, [orgId, m.metric]);
        await c.query(
          `insert into delivery.client_baseline(organization_id,metric,label,valor_antes,unidade,status,fonte,baseline_date,created_by,created_by_name)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [orgId, m.metric, m.label, m.valor_antes, m.unidade, m.status, fonte || 'manual', opts.baselineDate || null, opts.createdBy || null, opts.createdByName || null]);
      }
      return { ok: true, gravadas: metrics.length };
    });
  }

  // Salva baseline digitado à mão pelo admin — passa pela MESMA normalização/validação do extrator.
  async salvarManual(orgId: string, raw: any[], fonte: string, opts: { baselineDate?: string | null; createdBy?: string | null; createdByName?: string | null }) {
    const metrics = (Array.isArray(raw) ? raw : []).map((m) => this.normalizar(m)).filter(Boolean) as BaselineMetric[];
    const res = await this.gravar(orgId, metrics, fonte || 'manual', opts);
    return { ...res, metrics };
  }

  // Extrai o baseline de um TEXTO (transcrição/descrição) via DeepSeek e grava.
  async extrairBaseline(orgId: string, texto: string, fonte: string, opts: { baselineDate?: string | null; createdBy?: string | null; createdByName?: string | null }) {
    if (!texto || texto.trim().length < 10) throw new Error('Texto insuficiente para extrair o baseline.');
    const turn = await this.llm.complete(this.SYSTEM, texto.slice(0, 24000), { provider: 'deepseek' });
    const parsed = this.parseJson(turn.text);
    const metrics = (Array.isArray(parsed?.metrics) ? parsed.metrics : []).map((m: any) => this.normalizar(m)).filter(Boolean) as BaselineMetric[];
    const res = await this.gravar(orgId, metrics, fonte || 'reunião', opts);
    return { ...res, metrics, uso: turn.uso };
  }

  // ── RECOMENDADOR do Catálogo ("Amplie sua operação") — DeepSeek sugere a solução, SEM preço ──
  private readonly SYSTEM_RECO = [
    'PAPEL: você é a Psiquê, consultora de soluções da Crasto.AI, ajudando o cliente a descobrir o que contratar.',
    'O QUE A CRASTO.AI OFERECE (combináveis): Consultoria de Gestão com IA (mapeia processos e implanta com indicadores) · Implementação sob medida com Claude Code · Agente de IA sob medida (Agente Crasto) · WhatsApp CRM com IA · Automações & Integrações (n8n / APIs / MCP) · Tráfego Pago gerenciado com IA · BI & Dashboards · Gestão de Processos · Treinamento & Onboarding.',
    'OBJETIVO: dada a necessidade do cliente, recomende a(s) solução(ões) que resolvem — pode COMBINAR 2 quando fizer sentido.',
    'FORMATO: responda SOMENTE JSON: { "recomendacao": "<1 a 2 frases dizendo o que combina e por quê, tom pt-BR claro>", "solucoes": ["<nome1>", "<nome2>"] }.',
    'FREIO (obrigatório): NUNCA cite preço, valor, mensalidade, R$ ou qualquer número de dinheiro. O valor é sempre definido em reunião — a UI já leva pra isso. Só recomende do que a Crasto oferece acima. Se a necessidade não for de IA/automação/gestão, seja honesta e sugira uma reunião pra entender. JSON e nada mais.',
  ].join('\n');

  async recomendar(texto: string) {
    if (!texto || texto.trim().length < 5) throw new Error('Descreva um pouco melhor o que você precisa.');
    const turn = await this.llm.complete(this.SYSTEM_RECO, texto.slice(0, 4000), { provider: 'deepseek' });
    const p = this.parseJson(turn.text);
    return {
      recomendacao: String(p?.recomendacao || '').slice(0, 400) || null,
      solucoes: (Array.isArray(p?.solucoes) ? p.solucoes : []).slice(0, 3).map((s: any) => String(s).slice(0, 60)).filter(Boolean),
    };
  }

  // Baseline atual (vigente) de uma org — para o admin conferir/editar.
  async listar(orgId: string) {
    return this.db.asService(async (c) => (await c.query(
      `select metric,label,valor_antes,unidade,status,fonte,baseline_date,created_by_name,created_at
         from delivery.client_baseline where organization_id=$1 and is_current order by metric`, [orgId])).rows);
  }

  // ── NARRATIVA (hero do Cockpit · Meus Resultados) — item 1.4 ──────────────────
  private readonly SYSTEM_NARR = [
    'PAPEL: você é a Psiquê, a inteligência de resultados da Crasto.AI, falando com o CLIENTE no topo do painel dele (Cockpit · Meus Resultados). Tom pt-BR, claro, humano e honesto.',
    'OBJETIVO: escrever a narrativa de resultados a partir do SNAPSHOT (dados reais do cliente).',
    'FORMATO: responda SOMENTE JSON: { "headline": "<frase de impacto>", "destaques": [ { "n": "<número>", "l": "<rótulo curto>" } ], "resumo": "<1 a 2 frases>" }.',
    'HEADLINE: se houver "antes" E "depois" de tempo de resposta, escreva no espírito "Você respondia em X. Agora, em Y."; senão use o resultado mais forte do "depois" (ex.: "Sua IA já atende N% das conversas."). Sem dado forte → uma frase honesta e acolhedora sobre acompanhar os resultados.',
    'DESTAQUES: até 3, SÓ com números reais do snapshot (ex.: % atendido pela IA, novos leads, conversas). Formate (62 → "62%").',
    'RESUMO: 1 a 2 frases honestas sobre o que a IA já mudou.',
    'FREIO (anti-alucinação): use APENAS o que está no snapshot. NUNCA invente número. Se um dado faltar, não o cite. Melhor curto e verdadeiro do que grande e falso. JSON e nada mais.',
  ].join('\n');

  private fmtSeg(s: number) { return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(1)}h`; }

  // Snapshot client-safe (antes + depois + conquistas + implantação). SEM margem/custo/VDI.
  private async snapshot(orgId: string) {
    const base = await this.db.asService(async (c) => {
      const antes = (await c.query(`select metric,label,valor_antes,unidade,status from delivery.client_baseline where organization_id=$1 and is_current`, [orgId])).rows;
      const conquistas = (await c.query(
        `select coalesce(cm.label,m.name) as titulo, cm.rollout_status as status from delivery.client_modules cm join catalog.vdi_modules m on m.id=cm.vdi_module_id where cm.organization_id=$1
         union all select service_name, status from delivery.client_services where organization_id=$1`, [orgId])).rows;
      const impl = (await c.query(`select overall_progress from delivery.implementations where organization_id=$1 order by created_at desc limit 1`, [orgId])).rows[0];
      return { antes, conquistas, implantacao_pct: impl?.overall_progress ?? null };
    });
    const live = await this.wacrm.resultados(orgId).catch(() => null);
    const depois: any = {};
    if (live) {
      if (live.tempo_resposta != null) depois.tempo_resposta = `${live.tempo_resposta}s (${this.fmtSeg(live.tempo_resposta)})`;
      if (live.automacao != null) depois.atendido_pela_ia_pct = live.automacao;
      if (live.atendimentos != null) depois.conversas_atendidas_mes = live.atendimentos;
      if (live.novos_leads != null) depois.novos_leads_mes = live.novos_leads;
    }
    return { antes: base.antes, depois, conquistas: base.conquistas, implantacao_pct: base.implantacao_pct };
  }

  // Gera/regenera a narrativa do cliente via DeepSeek. Só regenera se o snapshot mudou (hash),
  // a menos que force=true (botão "regerar agora"). Append-only + is_current.
  async gerarNarrativa(orgId: string, opts?: { force?: boolean }) {
    const snap = await this.snapshot(orgId);
    const hash = createHash('sha1').update(JSON.stringify(snap)).digest('hex').slice(0, 16);
    const cur = await this.db.asService(async (c) => (await c.query(`select snapshot_hash from delivery.cockpit_narrative where organization_id=$1 and is_current limit 1`, [orgId])).rows[0]);
    if (!opts?.force && cur?.snapshot_hash === hash) return { skipped: true, motivo: 'snapshot sem mudança' };
    const turn = await this.llm.complete(this.SYSTEM_NARR, JSON.stringify(snap), { provider: 'deepseek' });
    const parsed = this.parseJson(turn.text);
    const narrative = {
      headline: String(parsed?.headline || '').slice(0, 200) || null,
      destaques: (Array.isArray(parsed?.destaques) ? parsed.destaques : []).slice(0, 3)
        .map((d: any) => ({ n: String(d?.n ?? '').slice(0, 20), l: String(d?.l ?? '').slice(0, 60) })).filter((d: any) => d.n && d.l),
      resumo: String(parsed?.resumo || '').slice(0, 400) || null,
      gerado_em: new Date().toISOString(),
    };
    await this.db.asService(async (c) => {
      await c.query(`update delivery.cockpit_narrative set is_current=false where organization_id=$1 and is_current`, [orgId]);
      await c.query(`insert into delivery.cockpit_narrative(organization_id,narrative,snapshot_hash,model,tokens_in,tokens_out) values ($1,$2,$3,$4,$5,$6)`,
        [orgId, JSON.stringify(narrative), hash, turn.uso?.model ?? null, turn.uso?.tokens_in ?? null, turn.uso?.tokens_out ?? null]);
    });
    return { ok: true, narrative, uso: turn.uso };
  }
}
