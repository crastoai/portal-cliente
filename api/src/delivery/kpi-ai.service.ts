import { Injectable, Logger } from '@nestjs/common';
import { JulieLlmService } from '../assistant/julie-llm.service';

// ANÁLISE DE IA por KPI do Cockpit. Manda os números REAIS da operação ao LLM (DeepSeek, a MESMA
// chave dos agentes — o custo soma nessa chave/empresa) e recebe, para CADA KPI, {tom, motivo,
// impacto, acao} — a "sugestão da IA" que o dono lê no card. NÃO bloqueia o cockpit: gera em
// BACKGROUND e cacheia por hash dos dados (30 min); enquanto não há análise da IA, o front usa a
// análise determinística como rede de segurança (nunca fica em branco, nunca inventa número).
type Analise = { tom: 'green' | 'amber' | 'red'; motivo: string; impacto: string; acao: string };

@Injectable()
export class KpiAiService {
  private log = new Logger('KpiAi');
  private cache = new Map<string, { hash: string; ts: number; analises: Record<string, Analise> }>();
  private inflight = new Set<string>();
  private TTL = 30 * 60 * 1000;
  constructor(private readonly llm: JulieLlmService) {}

  private SYSTEM =
    'Você é a inteligência analítica do Cockpit da Crasto.AI, falando direto ao DONO do negócio. ' +
    'Recebe os KPIs REAIS da operação (WhatsApp/CRM) e devolve, para CADA KPI presente no input, uma análise curta e acionável. ' +
    'Para cada KPI, quatro campos: "tom" (green=saudável, amber=observar, red=atenção — vermelho é a MAIOR oportunidade de ganho, nunca "fracasso"), ' +
    '"motivo" (por que está assim, 1 frase, citando o número), "impacto" (o que significa em dinheiro/conversão/velocidade/custo para o negócio, 1 frase) e ' +
    '"acao" (o que fazer, 1 frase objetiva). ' +
    'REGRAS: use SOMENTE os números fornecidos — nunca invente dado; pense em REGRA DE NEGÓCIO, não em tecnicalidade; pt-BR, direto, humano, sem jargão. ' +
    'Responda APENAS um objeto JSON (sem texto fora dele) no formato ' +
    '{"automacao":{"tom":"","motivo":"","impacto":"","acao":""},"sla":{...},"funil":{...},"volume":{...},"roi":{...},"antesdepois":{...}}. ' +
    'Inclua SÓ as chaves cujos dados vieram no input.';

  /** Devolve o cache atual na hora (ou null) e dispara a regeneração em background quando necessário. */
  analisar(orgId: string | null | undefined, dados: any): Record<string, Analise> | null {
    if (!orgId || !dados || !Object.keys(dados).length) return null;
    const hash = this.hash(JSON.stringify(dados));
    const c = this.cache.get(orgId);
    const fresh = !!c && c.hash === hash && Date.now() - c.ts < this.TTL;
    if (!fresh && !this.inflight.has(orgId)) {
      this.inflight.add(orgId);
      this.gerar(orgId, hash, dados).finally(() => this.inflight.delete(orgId));
    }
    return c?.analises ?? null;
  }

  private async gerar(orgId: string, hash: string, dados: any): Promise<void> {
    try {
      const turn = await this.llm.complete(this.SYSTEM, JSON.stringify(dados).slice(0, 8000), { provider: 'deepseek' });
      const parsed = this.extrair(turn.text || '');
      if (parsed) { this.cache.set(orgId, { hash, ts: Date.now(), analises: parsed }); this.log.log(`analise KPI gerada (${Object.keys(parsed).length} cards)`); }
    } catch (e: any) {
      this.log.warn(`analise KPI falhou: ${e?.message}`);
    }
  }

  private extrair(raw: string): Record<string, Analise> | null {
    try {
      const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
      if (s < 0 || e <= s) return null;
      const obj = JSON.parse(raw.slice(s, e + 1));
      const out: Record<string, Analise> = {};
      for (const [k, v] of Object.entries(obj || {})) {
        const a = v as any;
        if (a && typeof a === 'object' && a.motivo) {
          out[k] = {
            tom: ['green', 'amber', 'red'].includes(a.tom) ? a.tom : 'amber',
            motivo: String(a.motivo).slice(0, 240),
            impacto: String(a.impacto || '').slice(0, 280),
            acao: String(a.acao || '').slice(0, 240),
          };
        }
      }
      return Object.keys(out).length ? out : null;
    } catch { return null; }
  }

  private hash(s: string): string { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
}
