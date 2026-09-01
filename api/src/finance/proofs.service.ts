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

// ============================================================================
// LEITOR UNIFICADO (Fatia 2) — COMPROVANTE **ou** EXTRATO no mesmo caminho.
// A IA detecta o tipo e devolve SEMPRE uma LISTA de lançamentos (comprovante = 1).
// Recebe o CONTEXTO da empresa (clientes e fornecedores reais, vindos do banco) para
// conseguir dizer o que é da Crasto e o que não é — sem isso ela chutaria.
// Continua só LENDO: quem grava é o operador, na tela, depois de conferir.
// ============================================================================

export type LancamentoLido = {
  data: string | null;
  valor: number | null;              // SEMPRE positivo; o sinal vai em `sentido`
  sentido: 'credito' | 'debito' | null;
  descricao: string | null;          // histórico da linha do extrato
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  tipo: 'pix' | 'ted' | 'doc' | 'boleto' | 'transferencia' | 'cartao' | 'tarifa' | 'outro' | null;
  id_transacao: string | null;       // E2E / autenticação — usado p/ travar duplicidade
  natureza: 'receita_cliente' | 'custo' | 'interna' | 'imposto' | 'pessoal' | 'desconhecido';
  match_sugerido: string | null;     // nome do cliente/fornecedor do CONTEXTO que casa
  confianca: number;
};

export type DocLido = {
  tipo_documento: 'comprovante' | 'extrato' | 'desconhecido';
  instituicao: string | null;
  titular: string | null;
  periodo: string | null;
  lancamentos: LancamentoLido[];
  aviso: string | null;
};

export type ContextoEmpresa = { clientes: string[]; fornecedores: string[] };

function promptDoc(ctx: ContextoEmpresa, filename?: string): string {
  const lista = (a: string[]) => (a.length ? a.map((x) => `  - ${x}`).join('\n') : '  (nenhum cadastrado)');
  return [
    'Você lê documentos financeiros brasileiros: COMPROVANTES de pagamento (Pix, TED, boleto, transferência) e EXTRATOS bancários.',
    'Detecte qual dos dois é o documento e devolva TODOS os lançamentos que ele contém.',
    '',
    'CONTEXTO DA EMPRESA (use para classificar — NÃO invente nomes fora destas listas):',
    'Empresa: Crasto.com Tecnologia e Neurociências Ltda ("Crasto.AI", "Crasto").',
    'CLIENTES conhecidos (dinheiro que ENTRA):',
    lista(ctx.clientes),
    'FORNECEDORES/CUSTOS conhecidos (dinheiro que SAI):',
    lista(ctx.fornecedores),
    '',
    'Devolva SOMENTE um objeto JSON assim:',
    `{
  "tipo_documento": "comprovante"|"extrato"|"desconhecido",
  "instituicao": string|null,
  "titular": string|null,
  "periodo": string|null,
  "aviso": string|null,
  "lancamentos": [{
    "data": "YYYY-MM-DD"|null,
    "valor": number|null,
    "sentido": "credito"|"debito"|null,
    "descricao": string|null,
    "contraparte_nome": string|null,
    "contraparte_documento": string|null,
    "tipo": "pix"|"ted"|"doc"|"boleto"|"transferencia"|"cartao"|"tarifa"|"outro"|null,
    "id_transacao": string|null,
    "natureza": "receita_cliente"|"custo"|"interna"|"imposto"|"pessoal"|"desconhecido",
    "match_sugerido": string|null,
    "confianca": number
  }]
}`,
    '',
    'REGRAS OBRIGATÓRIAS:',
    '- EXTRATO: devolva TODAS as linhas de movimentação, uma por uma, inclusive as que não reconhecer. NUNCA resuma, agrupe ou pule linhas.',
    '- Linhas de SALDO (saldo anterior, saldo do dia, saldo final) NÃO são lançamentos — não inclua.',
    '- COMPROVANTE: devolva exatamente 1 lançamento.',
    '- Use APENAS o que está VISÍVEL. Campo que não aparece = null. NUNCA invente valor, data, nome ou ID.',
    '- "valor" sempre POSITIVO, número com ponto decimal (R$ 2.000,00 -> 2000.00). O sinal vai em "sentido": credito = entrou, debito = saiu.',
    '- "data" em ISO YYYY-MM-DD (11/08/2026 -> 2026-08-11). Se o extrato só traz dia/mês, use o ano do período do documento.',
    '- "natureza": "receita_cliente" = entrada de um CLIENTE da lista (ou claramente pagamento de serviço prestado); "custo" = saída para fornecedor/serviço da empresa; "interna" = transferência entre contas da PRÓPRIA empresa ou do sócio, aplicação, resgate, pagamento de fatura do próprio cartão (NÃO é receita nem despesa); "imposto" = DAS/tributos/taxas de governo; "pessoal" = claramente gasto pessoal, não da empresa; "desconhecido" = não dá para afirmar.',
    '- Na dúvida use "desconhecido". É MUITO melhor devolver "desconhecido" do que classificar errado.',
    '- "match_sugerido" só quando o nome da contraparte casa com alguém das listas do contexto; senão null.',
    '- "confianca" de 0 a 1 por lançamento.',
    '- Responda só o JSON, sem texto antes/depois, sem ```.',
    filename ? `Dica (NÃO é fonte de verdade, só contexto): o arquivo se chama "${filename}".` : '',
  ].filter(Boolean).join('\n');
}

export async function lerDocumentoFinanceiro(
  apiKey: string,
  fileBase64: string,
  mime: string,
  ctx: ContextoEmpresa,
  filename?: string,
  model = process.env.PROOFS_MODEL || 'gemini-2.5-flash',
): Promise<DocLido> {
  const body = {
    contents: [{ role: 'user', parts: [{ text: promptDoc(ctx, filename) }, { inline_data: { mime_type: mime || 'image/jpeg', data: fileBase64 } }] }],
    // Extrato rende MUITA saída (uma linha por lançamento) — orçamento folgado, senão o JSON trunca.
    generationConfig: { temperature: 0, response_mime_type: 'application/json', maxOutputTokens: 32768, thinkingConfig: { thinkingBudget: 0 } },
  };
  const call = async (m: string) => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  };
  let res = await call(model);
  if (!res.ok && (res.status === 404 || /not found|not supported/i.test(String(res.j?.error?.message || ''))) && model !== 'gemini-flash-latest') {
    res = await call('gemini-flash-latest');
  }
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${String(res.j?.error?.message || '').slice(0, 200)}`);
  const cand = res.j?.candidates?.[0];
  const raw = (cand?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
  if (!raw) throw new Error(`Gemini não devolveu leitura (${cand?.finishReason || 'sem motivo'}).`);
  // MAX_TOKENS = extrato grande truncado: melhor falhar alto do que entregar lista pela metade.
  if (cand?.finishReason === 'MAX_TOKENS') throw new Error('O documento é grande demais e a leitura foi truncada — envie o extrato em partes (por mês, por exemplo).');
  let obj: any;
  try {
    obj = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim());
  } catch {
    throw new Error('A IA não devolveu um JSON válido do documento.');
  }
  const numOrNull = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
  const strOrNull = (v: any) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
  const NAT = ['receita_cliente', 'custo', 'interna', 'imposto', 'pessoal', 'desconhecido'];
  const lancs: LancamentoLido[] = (Array.isArray(obj?.lancamentos) ? obj.lancamentos : [])
    .map((l: any) => {
      const v = numOrNull(l?.valor);
      const nat = String(l?.natureza || '');
      return {
        data: strOrNull(l?.data),
        valor: v === null ? null : Math.abs(v),
        sentido: l?.sentido === 'credito' || l?.sentido === 'debito' ? l.sentido : (v !== null && v < 0 ? 'debito' : null),
        descricao: strOrNull(l?.descricao),
        contraparte_nome: strOrNull(l?.contraparte_nome),
        contraparte_documento: strOrNull(l?.contraparte_documento),
        tipo: strOrNull(l?.tipo) as any,
        id_transacao: strOrNull(l?.id_transacao),
        natureza: (NAT.includes(nat) ? nat : 'desconhecido') as any,
        match_sugerido: strOrNull(l?.match_sugerido),
        confianca: Math.max(0, Math.min(1, numOrNull(l?.confianca) ?? 0)),
      };
    })
    .filter((l: LancamentoLido) => l.valor !== null || l.data !== null); // descarta linha vazia
  const td = String(obj?.tipo_documento || '');
  return {
    tipo_documento: (['comprovante', 'extrato'].includes(td) ? td : 'desconhecido') as any,
    instituicao: strOrNull(obj?.instituicao),
    titular: strOrNull(obj?.titular),
    periodo: strOrNull(obj?.periodo),
    lancamentos: lancs,
    aviso: strOrNull(obj?.aviso),
  };
}

@Injectable()
export class ProofsService {
  constructor(private readonly db: RlsDbService) {}

  // Contexto REAL da empresa (clientes e fornecedores do próprio banco) — é o que permite
  // à IA dizer "isso é da Crasto". Escopado por RLS no usuário que pediu.
  async contexto(userId: string): Promise<ContextoEmpresa> {
    return this.db.asUser(userId, async (c) => {
      const acc = await c.query(`select * from public.fin_accounts(null,null)`).catch(() => ({ rows: [] as any[] }));
      const cst = await c.query(`select * from public.fin_costs(null)`).catch(() => ({ rows: [] as any[] }));
      const uniq = (a: any[]) => Array.from(new Set(a.map((x) => String(x || '').trim()).filter(Boolean))).slice(0, 200);
      return {
        clientes: uniq((acc.rows || []).filter((r: any) => r.account_type === 'receivable').map((r: any) => r.contact_name)),
        fornecedores: uniq([
          ...(cst.rows || []).map((r: any) => r.vendor_name),
          ...(acc.rows || []).filter((r: any) => r.account_type === 'payable').map((r: any) => r.contact_name),
        ]),
      };
    });
  }

  async readDoc(userId: string, fileBase64: string, mime: string, filename?: string): Promise<DocLido> {
    const [key, ctx] = await Promise.all([this.googleKey(), this.contexto(userId).catch(() => ({ clientes: [], fornecedores: [] }))]);
    return lerDocumentoFinanceiro(key, fileBase64, mime, ctx, filename);
  }

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
