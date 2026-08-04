import { Injectable } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { JulieLlmService } from '../assistant/julie-llm.service';

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
export class PsiqueService {
  constructor(private readonly db: RlsDbService, private readonly llm: JulieLlmService) {}

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

  // Baseline atual (vigente) de uma org — para o admin conferir/editar.
  async listar(orgId: string) {
    return this.db.asService(async (c) => (await c.query(
      `select metric,label,valor_antes,unidade,status,fonte,baseline_date,created_by_name,created_at
         from delivery.client_baseline where organization_id=$1 and is_current order by metric`, [orgId])).rows);
  }
}
