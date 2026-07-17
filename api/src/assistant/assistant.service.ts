import { Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { AuditService } from '../common/audit.service';
import { JulieLlmService, JulieMsg, JulieTool } from './julie-llm.service';

// A JULIE — CFO de IA da Crasto.AI (admin-only).
// LÊ o financeiro e documentos (multimodal) E PROPÕE ações de escrita — mas nunca grava
// sozinha: a ferramenta de escrita só PREPARA a ação; o Crasto confirma num cartão na tela
// e só então o /execute roda a RPC de verdade (com Auditoria). "Julie propõe, Crasto confirma."
const SYSTEM = `Você é a Julie, a CFO (diretora financeira) de IA da Crasto.AI. Fala com o Carlos Crasto e o time, em português do Brasil, de forma objetiva, precisa e profissional. Valores sempre em Reais (R$), formato brasileiro.

O QUE VOCÊ FAZ:
- CONSULTA o financeiro pelas ferramentas de leitura (contas a pagar/receber, custos, caixa, transações) para responder com números REAIS.
- LÊ documentos anexados (nota fiscal, contrato social, comprovante) e EXTRAI os dados de forma organizada.
- EXECUTA ações no financeiro (criar conta a pagar/receber, criar custo, criar transação, dar baixa) — SEMPRE com confirmação.

CONFIRMAR ANTES DE EXECUTAR (regra de ouro, dinheiro é sério):
- Quando pedirem para criar/lançar/registrar/dar baixa, chame a ferramenta de escrita correspondente com os dados COMPLETOS e corretos.
- A ferramenta NÃO grava na hora: ela PREPARA a ação, e o Crasto vê um CARTÃO DE CONFIRMAÇÃO na tela. No seu texto, apresente em tópicos o que você preparou e peça para ele conferir e confirmar no cartão abaixo.
- NUNCA diga que já lançou/registrou/salvou — só depois que ele confirmar no cartão. Se faltar um dado essencial (valor, descrição, tipo), PERGUNTE antes de propor.
- Uma ação por vez: proponha uma, deixe confirmar, depois a próxima.

DOCUMENTOS:
- NOTA FISCAL anexada → extraia emitente/fornecedor, CNPJ, número da NF, emissão, vencimento, valor total e itens; classifique como a pagar ou a receber e JÁ PROPONHA a conta (criar_conta) preenchida (incluindo invoice_number = número da NF e due_date = vencimento).
- CONTRATO SOCIAL anexado → extraia razão social, CNPJ, data de abertura, sócios (nome/CPF/%), endereço. Para PREENCHER a ficha do cliente use atualizar_cliente (dados da empresa) e adicionar_cnpj (o CNPJ). Você precisa saber QUAL cliente: se o contexto já disser o cliente aberto, use o organization_id dele; senão pergunte ou use buscar_cliente pelo nome. NUNCA invente dados do cliente — só o que está no documento.

NUNCA invente número nem dado. Se não tem, use uma ferramenta ou diga que não tem. Seja concisa; use tópicos ao listar dados.`;

// Contexto opcional: o Crasto pode estar na ficha de um cliente. A tela manda o id; nós
// resolvemos o nome e dizemos à Julie qual é o cliente "aberto agora".
function linhaContexto(nome?: string | null, id?: string | null): string {
  if (!id) return '';
  return `\n\nCONTEXTO: o Crasto está agora na ficha do cliente ${nome ? `"${nome}" ` : ''}(organization_id = ${id}). Se ele anexar um contrato social ou pedir para atualizar dados deste cliente, use ESSE organization_id.`;
}

// Ferramentas de LEITURA (executam na hora) e de ESCRITA (só PROPÕEM → confirmação).
const READ = new Set(['resumo_financeiro', 'listar_contas', 'listar_custos', 'listar_transacoes', 'buscar_cliente']);
const WRITE = new Set(['criar_conta', 'criar_custo', 'criar_transacao', 'dar_baixa_conta', 'atualizar_cliente', 'adicionar_cnpj']);
// campos do cliente que a Julie pode preencher (whitelist — o resto é ignorado por segurança)
const CLIENTE_CAMPOS = ['name', 'tax_id', 'tax_id_type', 'founded_on', 'website', 'owner_name', 'notes', 'country', 'stage', 'status'];

const TOOLS: JulieTool[] = [
  { name: 'resumo_financeiro', description: 'Panorama do caixa: total a pagar, a receber e saldo em caixa.', parameters: { type: 'object', properties: {} } },
  { name: 'listar_contas', description: 'Lista contas a pagar (payable) ou a receber (receivable).', parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['payable', 'receivable'] }, status: { type: 'string', enum: ['pending', 'partial', 'paid', 'cancelled'] } } } },
  { name: 'listar_custos', description: 'Custos operacionais (ferramentas, infraestrutura, assinaturas).', parameters: { type: 'object', properties: { apenas_ativos: { type: 'boolean' } } } },
  { name: 'listar_transacoes', description: 'Movimentos de caixa (entradas=income, saídas=expense).', parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['income', 'expense'] }, status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] } } } },
  { name: 'criar_conta', description: 'PROPÕE uma conta a pagar ou a receber (não grava; o Crasto confirma).', parameters: { type: 'object', properties: {
    account_type: { type: 'string', enum: ['payable', 'receivable'], description: 'payable = a pagar; receivable = a receber' },
    description: { type: 'string' }, amount: { type: 'number', description: 'valor total em reais' },
    contact_name: { type: 'string', description: 'fornecedor (a pagar) ou cliente (a receber)' },
    category: { type: 'string' }, due_date: { type: 'string', description: 'vencimento AAAA-MM-DD' },
    payment_method: { type: 'string' }, invoice_number: { type: 'string', description: 'número da NF, se houver' },
    expense_type: { type: 'string', enum: ['consumo', 'revenda'] }, notes: { type: 'string' },
  }, required: ['account_type', 'description', 'amount'] } },
  { name: 'criar_custo', description: 'PROPÕE um custo operacional (não grava; o Crasto confirma).', parameters: { type: 'object', properties: {
    description: { type: 'string' }, vendor_name: { type: 'string' }, category: { type: 'string' },
    currency: { type: 'string', enum: ['BRL', 'USD', 'EUR'] }, amount_original: { type: 'number' }, exchange_rate: { type: 'number', description: 'cotação p/ BRL (1 se já em BRL)' },
    cost_type: { type: 'string', enum: ['fixo', 'variavel', 'unico'] }, recurrence: { type: 'string', enum: ['mensal', 'anual', 'pontual'] },
    next_payment_date: { type: 'string', description: 'AAAA-MM-DD' }, notes: { type: 'string' },
  }, required: ['description', 'amount_original'] } },
  { name: 'criar_transacao', description: 'PROPÕE um movimento de caixa (entrada/saída) já realizado ou pendente (não grava; o Crasto confirma).', parameters: { type: 'object', properties: {
    type: { type: 'string', enum: ['income', 'expense'] }, description: { type: 'string' }, amount: { type: 'number' },
    category: { type: 'string' }, transaction_date: { type: 'string', description: 'AAAA-MM-DD' }, contact_name: { type: 'string' },
    payment_method: { type: 'string' }, status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] }, notes: { type: 'string' },
  }, required: ['type', 'description', 'amount'] } },
  { name: 'dar_baixa_conta', description: 'PROPÕE marcar uma conta como PAGA (dar baixa). Use o id da conta (obtenha com listar_contas).', parameters: { type: 'object', properties: {
    id: { type: 'string', description: 'id da conta' }, amount_paid: { type: 'number', description: 'valor pago (padrão: total)' }, payment_date: { type: 'string', description: 'AAAA-MM-DD (padrão: hoje)' },
  }, required: ['id'] } },
  { name: 'buscar_cliente', description: 'Busca clientes (empresas) pelo nome para descobrir o organization_id.', parameters: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] } },
  { name: 'atualizar_cliente', description: 'PROPÕE preencher/atualizar dados da ficha de um cliente (não grava; o Crasto confirma). Use os dados extraídos de um contrato social.', parameters: { type: 'object', properties: {
    organization_id: { type: 'string', description: 'id do cliente (do contexto ou de buscar_cliente)' },
    name: { type: 'string', description: 'razão social / nome' }, tax_id: { type: 'string', description: 'CNPJ (ou CPF)' }, tax_id_type: { type: 'string', enum: ['CNPJ', 'CPF'] },
    founded_on: { type: 'string', description: 'data de abertura AAAA-MM-DD' }, website: { type: 'string' }, owner_name: { type: 'string', description: 'responsável / sócio principal' },
    country: { type: 'string' }, notes: { type: 'string' },
  }, required: ['organization_id'] } },
  { name: 'adicionar_cnpj', description: 'PROPÕE cadastrar um CNPJ (matriz/filial) para um cliente (não grava; o Crasto confirma).', parameters: { type: 'object', properties: {
    organization_id: { type: 'string' }, cnpj: { type: 'string' }, legal_name: { type: 'string', description: 'razão social' }, trade_name: { type: 'string', description: 'nome fantasia' }, is_headquarters: { type: 'boolean', description: 'é a matriz?' }, country: { type: 'string' },
  }, required: ['organization_id', 'cnpj'] } },
];

type Pending = { kind: string; payload: any; resumo: string };

@Injectable()
export class AssistantService {
  private log = new Logger('Julie');
  constructor(private readonly db: RlsDbService, private readonly llm: JulieLlmService, private readonly audit: AuditService) {}

  private brl(v: any) { return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`; }

  // Monta o payload de uma ação de escrita a partir dos args do modelo. Retorna a proposta
  // (kind+payload+resumo) OU um erro legível (p/ o modelo pedir o dado que faltou).
  private preparar(name: string, a: any): Pending | { erro: string } {
    if (name === 'criar_conta') {
      const desc = String(a?.description || '').trim();
      const amount = Number(a?.amount);
      if (!desc) return { erro: 'faltou a descrição da conta' };
      if (!(amount > 0)) return { erro: 'faltou o valor (amount) da conta' };
      const tipo = a?.account_type === 'receivable' ? 'receivable' : 'payable';
      const payload: any = { account_type: tipo, description: desc, amount, status: 'pending' };
      for (const k of ['contact_name', 'category', 'due_date', 'payment_method', 'invoice_number', 'expense_type', 'notes']) if (a?.[k]) payload[k] = a[k];
      const resumo = `Conta a ${tipo === 'payable' ? 'PAGAR' : 'RECEBER'} · ${desc} · ${this.brl(amount)}${a?.due_date ? ` · vence ${a.due_date}` : ''}${a?.contact_name ? ` · ${a.contact_name}` : ''}`;
      return { kind: name, payload, resumo };
    }
    if (name === 'criar_custo') {
      const desc = String(a?.description || '').trim();
      const orig = Number(a?.amount_original);
      if (!desc) return { erro: 'faltou a descrição do custo' };
      if (!(orig > 0)) return { erro: 'faltou o valor (amount_original) do custo' };
      const currency = ['USD', 'EUR', 'BRL'].includes(a?.currency) ? a.currency : 'BRL';
      const rate = currency === 'BRL' ? 1 : Number(a?.exchange_rate) || 1;
      const payload: any = { description: desc, currency, amount_original: orig, exchange_rate: rate, amount_brl: +(orig * rate).toFixed(2), cost_type: a?.cost_type || 'fixo', cost_nature: 'recorrente', recurrence: a?.recurrence || 'mensal', is_active: true };
      for (const k of ['vendor_name', 'category', 'next_payment_date', 'notes']) if (a?.[k]) payload[k] = a[k];
      const resumo = `Custo · ${desc} · ${currency} ${orig}${currency !== 'BRL' ? ` (≈ ${this.brl(payload.amount_brl)})` : ''} · ${payload.recurrence}`;
      return { kind: name, payload, resumo };
    }
    if (name === 'criar_transacao') {
      const desc = String(a?.description || '').trim();
      const amount = Number(a?.amount);
      if (!['income', 'expense'].includes(a?.type)) return { erro: 'diga se é entrada (income) ou saída (expense)' };
      if (!desc) return { erro: 'faltou a descrição da transação' };
      if (!(amount > 0)) return { erro: 'faltou o valor (amount) da transação' };
      const payload: any = { type: a.type, description: desc, amount, status: a?.status || 'completed' };
      for (const k of ['category', 'transaction_date', 'contact_name', 'payment_method', 'notes']) if (a?.[k]) payload[k] = a[k];
      const resumo = `${a.type === 'income' ? 'ENTRADA' : 'SAÍDA'} · ${desc} · ${this.brl(amount)}${a?.transaction_date ? ` · ${a.transaction_date}` : ''}`;
      return { kind: name, payload, resumo };
    }
    if (name === 'dar_baixa_conta') {
      const id = String(a?.id || '').trim();
      if (!id) return { erro: 'faltou o id da conta (use listar_contas para achar)' };
      const payload: any = { id };
      if (a?.amount_paid != null) payload.amount_paid = Number(a.amount_paid);
      if (a?.payment_date) payload.payment_date = a.payment_date;
      return { kind: name, payload, resumo: `Dar baixa (marcar PAGA) na conta ${id}` };
    }
    if (name === 'atualizar_cliente') {
      const org = String(a?.organization_id || '').trim();
      if (!org) return { erro: 'não sei qual cliente — use buscar_cliente ou abra a ficha do cliente' };
      const campos: any = {};
      for (const k of CLIENTE_CAMPOS) if (a?.[k] != null && a[k] !== '') campos[k] = a[k];
      if (!Object.keys(campos).length) return { erro: 'nenhum dado do cliente para preencher' };
      const resumo = `Atualizar cliente · ${Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(' · ')}`;
      return { kind: name, payload: { organization_id: org, campos }, resumo };
    }
    if (name === 'adicionar_cnpj') {
      const org = String(a?.organization_id || '').trim();
      const cnpj = String(a?.cnpj || '').trim();
      if (!org) return { erro: 'não sei qual cliente para o CNPJ' };
      if (!cnpj) return { erro: 'faltou o número do CNPJ' };
      const payload: any = { organization_id: org, country: a?.country || 'BR', reg_type: 'cnpj', cnpj, is_headquarters: a?.is_headquarters === true, is_active: true };
      for (const k of ['legal_name', 'trade_name']) if (a?.[k]) payload[k] = a[k];
      return { kind: name, payload, resumo: `Cadastrar CNPJ ${cnpj}${a?.legal_name ? ` · ${a.legal_name}` : ''}${a?.is_headquarters ? ' · matriz' : ''}` };
    }
    return { erro: 'ferramenta de escrita desconhecida' };
  }

  private async ler(uid: string, name: string, args: any): Promise<any> {
    return this.db.asUser(uid, async (c) => {
      const num = (v: any) => Number(v || 0);
      const restante = (r: any) => num(r.amount) - num(r.amount_paid);
      if (name === 'resumo_financeiro') {
        const pay = (await c.query(`select * from public.fin_accounts('payable', null)`)).rows;
        const rec = (await c.query(`select * from public.fin_accounts('receivable', null)`)).rows;
        const tx = (await c.query(`select * from public.fin_transactions(null, null)`)).rows;
        const abertas = (rows: any[]) => rows.filter((r) => r.status !== 'paid' && r.status !== 'cancelled');
        const soma = (rows: any[], f: (r: any) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
        const entradas = soma(tx.filter((r: any) => r.type === 'income' && r.status === 'completed'), (r) => num(r.amount));
        const saidas = soma(tx.filter((r: any) => r.type === 'expense' && r.status === 'completed'), (r) => num(r.amount));
        return { a_pagar: soma(abertas(pay), restante), a_receber: soma(abertas(rec), restante), saldo_em_caixa: entradas - saidas, contas_a_pagar_abertas: abertas(pay).length, contas_a_receber_abertas: abertas(rec).length };
      }
      if (name === 'listar_contas') return (await c.query(`select * from public.fin_accounts($1,$2)`, [args?.tipo || null, args?.status || null])).rows.slice(0, 50);
      if (name === 'listar_custos') return (await c.query(`select * from public.fin_costs($1)`, [args?.apenas_ativos === true ? true : null])).rows.slice(0, 80);
      if (name === 'listar_transacoes') return (await c.query(`select * from public.fin_transactions($1,$2)`, [args?.tipo || null, args?.status || null])).rows.slice(0, 50);
      if (name === 'buscar_cliente') {
        const q = `%${String(args?.nome || '').trim()}%`;
        return (await c.query(`select id, name, tax_id, stage from public.organizations where name ilike $1 order by name limit 12`, [q])).rows;
      }
      return { erro: 'ferramenta desconhecida: ' + name };
    });
  }

  async chat(uid: string, messages: JulieMsg[], contexto?: { organization_id?: string | null }): Promise<{ reply: string; pending?: Pending | null; uso?: any }> {
    const hist: JulieMsg[] = [...messages];
    let pending: Pending | null = null;
    let uso: any;
    // Se o Crasto está na ficha de um cliente, resolve o nome e diz à Julie qual é.
    let system = SYSTEM;
    const orgCtx = contexto?.organization_id ? String(contexto.organization_id) : '';
    if (orgCtx) {
      const nome = await this.db.asUser(uid, async (c) => (await c.query(`select name from public.organizations where id=$1`, [orgCtx])).rows[0]?.name).catch(() => null);
      system += linhaContexto(nome, orgCtx);
    }
    for (let volta = 0; volta < 4; volta++) {
      const turn = await this.llm.completeTools(system, hist, TOOLS);
      uso = turn.uso;
      if (!turn.calls.length) return { reply: turn.text || '(sem resposta)', pending, uso };
      hist.push({ role: 'assistant_call', calls: turn.calls });
      const results: { name: string; result: any }[] = [];
      for (const call of turn.calls) {
        if (WRITE.has(call.name)) {
          if (pending) { results.push({ name: call.name, result: { erro: 'uma ação por vez — peça para confirmar a anterior primeiro' } }); continue; }
          const prep = this.preparar(call.name, call.args);
          if ('erro' in prep) { results.push({ name: call.name, result: { erro: prep.erro } }); continue; }
          pending = prep;
          results.push({ name: call.name, result: { proposto: true, aguardando_confirmacao_do_crasto: true, resumo: prep.resumo } });
        } else if (READ.has(call.name)) {
          const result = await this.ler(uid, call.name, call.args).catch((e) => ({ erro: e.message }));
          results.push({ name: call.name, result });
        } else {
          results.push({ name: call.name, result: { erro: 'ferramenta desconhecida' } });
        }
      }
      hist.push({ role: 'tool_result', results });
    }
    return { reply: 'Precisei de muitos passos e parei por segurança. Pode reformular?', pending, uso };
  }

  // /execute — SÓ aqui grava, depois do Crasto confirmar. Roda a RPC no RLS do admin + Auditoria.
  async executar(req: any, uid: string, kind: string, payload: any): Promise<any> {
    if (!WRITE.has(kind)) throw new Error('ação não permitida');
    const r = await this.db.asUser(uid, async (c) => {
      if (kind === 'criar_conta') return (await c.query(`select public.fin_account_upsert($1) as r`, [payload])).rows[0]?.r;
      if (kind === 'criar_custo') return (await c.query(`select public.fin_cost_upsert($1) as r`, [payload])).rows[0]?.r;
      if (kind === 'criar_transacao') return (await c.query(`select public.fin_transaction_upsert($1) as r`, [payload])).rows[0]?.r;
      if (kind === 'dar_baixa_conta') {
        const conta = (await c.query(`select * from public.fin_accounts(null,null)`)).rows.find((x: any) => x.id === payload.id);
        if (!conta) throw new Error('conta não encontrada');
        const hoje = new Date().toISOString().slice(0, 10);
        const pay = { id: conta.id, account_type: conta.account_type, status: 'paid', amount_paid: payload.amount_paid ?? conta.amount, payment_date: payload.payment_date ?? hoje };
        return (await c.query(`select public.fin_account_upsert($1) as r`, [pay])).rows[0]?.r;
      }
      if (kind === 'atualizar_cliente') {
        // UPDATE dinâmico só com colunas da whitelist (mesmo padrão do identity.controller).
        const campos = payload?.campos || {};
        const cols = Object.keys(campos).filter((k) => CLIENTE_CAMPOS.includes(k));
        if (!cols.length) throw new Error('nenhum campo válido');
        const sets = cols.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
        await c.query(`update public.organizations set ${sets} where id = $1`, [payload.organization_id, ...cols.map((k) => campos[k])]);
        return { atualizado: cols };
      }
      if (kind === 'adicionar_cnpj') return (await c.query(`select public.admin_registration_upsert($1) as r`, [payload])).rows[0]?.r;
      throw new Error('ação desconhecida');
    });
    await this.audit.log(req, 'julie_' + kind, { system: 'portal', ctx: { payload } });
    return { ok: true, resultado: r };
  }
}
