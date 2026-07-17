import { Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';

// Motor de IA da Julie (a CFO). Portado do PortalLlmService do CRM, mas NATIVO do Portal:
// a chave/modelo vêm do COFRE via RPC `llm_runtime()` lida como service_role — nunca em env
// nem no front. Hoje roda no Gemini (multimodal: lê PDF/imagem/áudio inline) com ferramentas.
export type JulieMsg =
  | { role: 'user'; text: string; attachments?: { mime: string; data: string }[] }
  | { role: 'assistant'; text: string }
  | { role: 'assistant_call'; calls: { name: string; args: any }[] }
  | { role: 'tool_result'; results: { name: string; result: any }[] };
export type JulieTool = { name: string; description: string; parameters: any };
export type JulieTurn = { text: string; calls: { name: string; args: any }[]; uso?: { model: string; ms: number; tokens_in?: number; tokens_out?: number } };

@Injectable()
export class JulieLlmService {
  private log = new Logger('Julie-LLM');
  private cache?: { at: number; rt: any };
  constructor(private readonly db: RlsDbService) {}

  // {provider, model, api_key} do cofre do Portal (mesmo RPC que o CRM usa por REST — aqui in-process).
  private async runtime(): Promise<any> {
    if (this.cache && Date.now() - this.cache.at < 60000) return this.cache.rt;
    const rt = await this.db.asService(async (c) => (await c.query(`select public.llm_runtime() as r`)).rows[0]?.r);
    if (!rt) throw new Error('Configuração de IA do Portal indisponível (llm_runtime).');
    if (!rt.api_key) throw new Error(`Sem chave do provedor "${rt.provider}" no cofre do Portal.`);
    this.cache = { at: Date.now(), rt };
    return rt;
  }

  /** Diagnóstico: provedor/modelo/tem-chave — SEM revelar a chave. */
  async describe(): Promise<{ provider?: string; model?: string; hasKey: boolean }> {
    const rt = await this.runtime().catch(() => null);
    return { provider: rt?.provider, model: rt?.model, hasKey: !!rt?.api_key };
  }

  async completeTools(system: string, messages: JulieMsg[], tools: JulieTool[]): Promise<JulieTurn> {
    const rt = await this.runtime();
    if (rt.provider !== 'google') throw new Error(`A Julie hoje roda no Gemini; provedor padrão atual é "${rt.provider}". Ajuste em Modelos LLM.`);
    return this.gemini(rt, system, messages, tools);
  }

  private async gemini(rt: any, system: string, messages: JulieMsg[], tools: JulieTool[]): Promise<JulieTurn> {
    // Model configurável (JULIE_MODEL) → padrão do cofre → gemini-2.5-pro (GA, estável).
    const model = process.env.JULIE_MODEL || (rt.model && rt.model !== 'gemini' ? rt.model : 'gemini-2.5-pro');
    const contents = messages.map((m: any) => {
      if (m.role === 'assistant_call') return { role: 'model', parts: m.calls.map((c: any) => ({ functionCall: { name: c.name, args: c.args || {} } })) };
      // Gemini exige que `response` seja um OBJETO. Ferramentas que devolvem array/escalar
      // (listar_contas, buscar_cliente…) davam 400 → 500. Embrulhamos em {resultado:...}.
      if (m.role === 'tool_result') return { role: 'user', parts: m.results.map((r: any) => ({ functionResponse: { name: r.name, response: (r.result && typeof r.result === 'object' && !Array.isArray(r.result)) ? r.result : { resultado: r.result ?? null } } })) };
      const parts: any[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const a of (m.attachments || [])) parts.push({ inline_data: { mime_type: a.mime, data: a.data } });
      if (!parts.length) parts.push({ text: '' });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
    const body: any = {
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
    };
    if (tools.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];

    const t0 = Date.now();
    // Chave no HEADER (x-goog-api-key), NUNCA na URL — url vaza em log/histórico.
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': rt.api_key }, body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini respondeu ${r.status}: ${String(j?.error?.message || '').slice(0, 220)}`);
    const parts: any[] = j?.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((x) => x.functionCall).map((x) => ({ name: x.functionCall.name, args: x.functionCall.args || {} }));
    const text = parts.filter((x) => x.text).map((x) => x.text).join('');
    if (!calls.length && !text.trim()) throw new Error(`Gemini não devolveu resposta (${j?.candidates?.[0]?.finishReason || 'sem motivo'}).`);
    const u = j?.usageMetadata || {};
    return { text, calls, uso: { model, ms: Date.now() - t0, tokens_in: u.promptTokenCount, tokens_out: u.candidatesTokenCount } };
  }
}
