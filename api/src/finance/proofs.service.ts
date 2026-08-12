import { Injectable } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';

// ============================================================================
// COMPROVANTES (Fatia 1) — leitura de comprovante de pagamento por IA (Gemini).
// O cliente paga (Pix) e manda o comprovante; a IA LÊ a imagem e extrai valor/
// data/hora/pagador para o operador CONCILIAR com a parcela (1 clique).
//
// Só usa o que está VISÍVEL na imagem (FREIO anti-alucinação) — se não achar um
// campo, devolve null; nunca inventa. A baixa em si (marcar a parcela paga) é
// decisão HUMANA na tela — este serviço só PROPÕE.
//
// A chave do Gemini vem do COFRE do Portal (reveal_provider_key('google')),
// nunca de env/front — igual à Julie (julie-llm.service).
// ============================================================================

export type ComprovanteExtraido = {
  legivel: boolean; // a imagem é mesmo um comprovante legível?
  valor: number | null; // R$ (número), ex.: 2000.00
  data: string | null; // YYYY-MM-DD (data do pagamento)
  hora: string | null; // HH:MM (24h) se aparecer
  tipo: 'pix' | 'ted' | 'doc' | 'boleto' | 'transferencia' | 'outro' | null;
  pagador_nome: string | null;
  pagador_documento: string | null; // CPF/CNPJ do pagador, como aparece
  recebedor_nome: string | null;
  instituicao: string | null; // banco/instituição de origem
  id_transacao: string | null; // E2E / autenticação / ID da transação
  resumo: string | null; // 1 linha em pt-BR: "PIX de R$ 2.000 em 11/08/2026"
  confianca: number; // 0..1 — o quão seguro a IA está da leitura
};

const CAMPOS = `{
  "legivel": boolean,            // true só se a imagem é um comprovante de pagamento legível
  "valor": number|null,          // valor pago em reais, ponto decimal (ex.: 2000.00). null se não achar
  "data": "YYYY-MM-DD"|null,     // data do pagamento (converta dd/mm/aaaa -> ISO). null se não achar
  "hora": "HH:MM"|null,          // hora do pagamento em 24h, se aparecer
  "tipo": "pix"|"ted"|"doc"|"boleto"|"transferencia"|"outro"|null,
  "pagador_nome": string|null,   // quem PAGOU (origem)
  "pagador_documento": string|null, // CPF/CNPJ do pagador, exatamente como aparece
  "recebedor_nome": string|null, // quem RECEBEU (destino)
  "instituicao": string|null,    // banco/instituição de origem
  "id_transacao": string|null,   // E2E / código de autenticação / ID
  "resumo": string|null,         // uma linha pt-BR, ex.: "PIX de R$ 2.000,00 em 11/08/2026"
  "confianca": number            // 0 a 1, o quão seguro você está da leitura
}`;

function prompt(filename?: string): string {
  return [
    'Você é um extrator de dados de COMPROVANTES de pagamento brasileiros (Pix, TED, boleto, transferência).',
    'Leia a imagem e devolva SOMENTE um objeto JSON com EXATAMENTE estes campos:',
    CAMPOS,
    'REGRAS (obrigatórias):',
    '- Use APENAS o que está VISÍVEL na imagem. Se um campo não aparece, devolva null. NUNCA invente.',
    '- Se a imagem NÃO for um comprovante de pagamento (ou estiver ilegível), devolva "legivel": false e os demais campos null.',
    '- "valor" é número (ponto decimal), sem "R$" nem separador de milhar. Ex.: R$ 2.000,00 -> 2000.00',
    '- "data" no formato ISO YYYY-MM-DD. Ex.: 11/08/2026 -> 2026-08-11.',
    '- Responda só o JSON, sem texto antes/depois, sem ```.',
    filename ? `Dica (NÃO é fonte de verdade, só contexto): o arquivo se chama "${filename}".` : '',
  ].filter(Boolean).join('\n');
}

// Chamada crua ao Gemini (inline_data) — isolada e pura p/ facilitar teste.
// Retorna o objeto extraído já validado/normalizado.
export async function extrairComprovante(
  apiKey: string,
  imageBase64: string,
  mime: string,
  filename?: string,
  model = process.env.PROOFS_MODEL || 'gemini-2.5-flash',
): Promise<ComprovanteExtraido> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt(filename) },
          { inline_data: { mime_type: mime || 'image/jpeg', data: imageBase64 } },
        ],
      },
    ],
    // thinkingBudget:0 — sem isso o Gemini 2.5 gasta o orçamento de saída "pensando" e
    // TRUNCA o JSON (bug pego no teste com comprovante real). maxOutputTokens folgado.
    generationConfig: { temperature: 0, response_mime_type: 'application/json', maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  };
  const call = async (m: string) => {
    // Chave no HEADER (x-goog-api-key), nunca na URL (url vaza em log/histórico).
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  };
  let res = await call(model);
  // Modelo aposentado/404 -> tenta o alias "latest" (mesma lição do wacrm: gemini-flash-latest).
  if (!res.ok && (res.status === 404 || /not found|not supported/i.test(String(res.j?.error?.message || ''))) && model !== 'gemini-flash-latest') {
    res = await call('gemini-flash-latest');
  }
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${String(res.j?.error?.message || '').slice(0, 200)}`);
  const parts: any[] = res.j?.candidates?.[0]?.content?.parts || [];
  const raw = parts.map((p) => p?.text || '').join('').trim();
  if (!raw) throw new Error(`Gemini não devolveu leitura (${res.j?.candidates?.[0]?.finishReason || 'sem motivo'}).`);
  let obj: any;
  try {
    obj = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim());
  } catch {
    throw new Error('A IA não devolveu um JSON válido do comprovante.');
  }
  const numOrNull = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
  const strOrNull = (v: any) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
  return {
    legivel: obj.legivel !== false && (obj.valor != null || obj.data != null || obj.id_transacao != null),
    valor: numOrNull(obj.valor),
    data: strOrNull(obj.data),
    hora: strOrNull(obj.hora),
    tipo: strOrNull(obj.tipo) as any,
    pagador_nome: strOrNull(obj.pagador_nome),
    pagador_documento: strOrNull(obj.pagador_documento),
    recebedor_nome: strOrNull(obj.recebedor_nome),
    instituicao: strOrNull(obj.instituicao),
    id_transacao: strOrNull(obj.id_transacao),
    resumo: strOrNull(obj.resumo),
    confianca: Math.max(0, Math.min(1, numOrNull(obj.confianca) ?? 0)),
  };
}

@Injectable()
export class ProofsService {
  constructor(private readonly db: RlsDbService) {}

  // Chave do Gemini do cofre do Portal (mesmo RPC da Julie); env só como último recurso.
  private async googleKey(): Promise<string> {
    const k = await this.db
      .asService(async (c) => (await c.query(`select public.reveal_provider_key('google') as k`)).rows[0]?.k)
      .catch(() => null);
    const key = k || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    if (!key) throw new Error('Sem chave Google/Gemini no cofre do Portal — configure em Modelos LLM para ler comprovantes.');
    return key;
  }

  async extract(imageBase64: string, mime: string, filename?: string): Promise<ComprovanteExtraido> {
    const key = await this.googleKey();
    return extrairComprovante(key, imageBase64, mime, filename);
  }
}
