import { Injectable } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { uploadGeminiFile } from '../common/gemini-files';

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
    if (rt.provider === 'google') return this.gemini(rt, system, messages, tools);
    if (rt.provider === 'deepseek') {
      // DeepSeek é texto puro (não lê PDF/imagem/áudio). Se tem anexo, falha claro em vez de
      // fingir que leu. O Portal pode: (a) trocar temporariamente pra Gemini via llm_runtime,
      // ou (b) processar sem o anexo se ele não for essencial.
      const temAnexo = messages.some((m: any) => Array.isArray(m.attachments) && m.attachments.length);
      if (temAnexo) throw new Error('DeepSeek não lê anexos (PDF/imagem/áudio) — pra Julie processar arquivos, mude o provedor default pra Google/Gemini em Modelos LLM.');
      return this.deepseek(rt, system, messages, tools);
    }
    throw new Error(`Provedor "${rt.provider}" ainda não tem adaptador na Julie. Suportados: google, deepseek.`);
  }

  private async gemini(rt: any, system: string, messages: JulieMsg[], tools: JulieTool[]): Promise<JulieTurn> {
    // Model configurável (JULIE_MODEL) → padrão do cofre → gemini-2.5-pro (GA, estável).
    const model = process.env.JULIE_MODEL || (rt.model && rt.model !== 'gemini' ? rt.model : 'gemini-2.5-pro');
    // Onde há ANEXO, sobe o arquivo pela File API e referencia por `file_data` (em vez de
    // `inline_data` base64) — assim o teto de ~20MB por request some. Só há upload quando
    // existe anexo; texto puro não passa por aqui.
    const contents: any[] = [];
    for (const m of messages as any[]) {
      if (m.role === 'assistant_call') { contents.push({ role: 'model', parts: m.calls.map((c: any) => ({ functionCall: { name: c.name, args: c.args || {} } })) }); continue; }
      // Gemini exige que `response` seja um OBJETO. Ferramentas que devolvem array/escalar
      // (listar_contas, buscar_cliente…) davam 400 → 500. Embrulhamos em {resultado:...}.
      if (m.role === 'tool_result') { contents.push({ role: 'user', parts: m.results.map((r: any) => ({ functionResponse: { name: r.name, response: (r.result && typeof r.result === 'object' && !Array.isArray(r.result)) ? r.result : { resultado: r.result ?? null } } })) }); continue; }
      const parts: any[] = [];
      if (m.text) parts.push({ text: m.text });
      // sobe em LOTES de 6 (rápido, sem disparar 100 uploads de uma vez e levar 429 da File API)
      const atts = (m.attachments || []) as any[];
      for (let i = 0; i < atts.length; i += 6) {
        const lote = await Promise.all(atts.slice(i, i + 6).map(async (a: any) => {
          const bytes = Buffer.from(a.data || '', 'base64');
          const f = await uploadGeminiFile(rt.api_key, bytes, a.mime, 'anexo');
          return { file_data: { mime_type: f.mimeType, file_uri: f.uri } };
        }));
        parts.push(...lote);
      }
      if (!parts.length) parts.push({ text: '' });
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
    }
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

  /**
   * DEEPSEEK — API OpenAI-compatible. Aqui a Julie NÃO usa multimodal (guarded no completeTools).
   * Motivo pra estar aqui: reduzir custo em consultas de texto puro (financeiro, chat interno,
   * classificação) — DeepSeek v4-flash é ~35× mais barato que GPT-4o-mini. Ative trocando
   * `llm_runtime` no Portal pra `{ provider: 'deepseek', model: 'deepseek-v4-flash', api_key: ... }`.
   */
  private async deepseek(rt: any, system: string, messages: JulieMsg[], tools: JulieTool[]): Promise<JulieTurn> {
    const model = process.env.JULIE_MODEL || rt.model || 'deepseek-v4-flash';
    const msgs: any[] = [{ role: 'system', content: system }];
    for (const m of messages as any[]) {
      if (m.role === 'assistant_call') {
        msgs.push({ role: 'assistant', tool_calls: m.calls.map((c: any, i: number) => ({ id: `call_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) });
      } else if (m.role === 'tool_result') {
        for (let i = 0; i < m.results.length; i++) msgs.push({ role: 'tool', tool_call_id: `call_${i}`, content: JSON.stringify(m.results[i].result ?? {}) });
      } else {
        msgs.push({ role: m.role, content: m.text });
      }
    }
    const t0 = Date.now();
    const body: any = { model, max_tokens: 4000, messages: msgs, temperature: 0.2 };
    if (tools.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + rt.api_key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 402) throw new Error('DeepSeek sem saldo — faça top-up em platform.deepseek.com/top_up.');
      throw new Error(`DeepSeek respondeu ${r.status}: ${String(j?.error?.message || '').slice(0, 220)}`);
    }
    const msg = j?.choices?.[0]?.message || {};
    const calls = (msg.tool_calls || []).map((tc: any) => ({ name: tc.function?.name, args: JSON.parse(tc.function?.arguments || '{}') }));
    const text = msg.content || '';
    if (!calls.length && !text.trim()) throw new Error('DeepSeek não devolveu resposta.');
    return { text, calls, uso: { model, ms: Date.now() - t0, tokens_in: j?.usage?.prompt_tokens, tokens_out: j?.usage?.completion_tokens } };
  }
}
