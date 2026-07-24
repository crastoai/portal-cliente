import { Injectable } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { AuditService } from '../common/audit.service';
import { JulieLlmService, JulieMsg, JulieTool } from './julie-llm.service';

// A JULIE — CFO de IA da Crasto.AI (admin-only). LÊ o financeiro e documentos (multimodal),
// EXECUTA ações no financeiro E no cadastro de clientes — sempre PROPONDO (cartão de
// confirmação); só o /execute grava, com Auditoria. "Julie propõe, Crasto confirma."
const SYSTEM = `Você é a Julie, a assistente virtual da Crasto.AI — forte em finanças e no cadastro de clientes. Fala com o Carlos Crasto e o time em português do Brasil: objetiva, precisa, profissional e proativa. Valores sempre em Reais (R$), formato brasileiro.

COMO VOCÊ PENSA (skills):
- Você raciocina com DATAS: sabe a data de hoje (abaixo). "Esse mês" = o mês corrente; "vencida" = com vencimento (due_date) ANTERIOR a hoje e ainda não paga; "próximos N dias" = use contas_vencendo. Nunca chute datas.
- Você é PROATIVA: ao dar um panorama, aponte riscos (contas vencidas, saldo baixo, concentração num cliente) sem alarmar.
- Você é FIEL AOS DADOS: todo número vem de uma ferramenta ou de um documento anexado. Se não tem o dado, use a ferramenta certa; se ainda não tiver, diga que não tem. NUNCA invente valor, data, CNPJ ou nome.
- Você é CLARA: respostas curtas, com tópicos quando listar; destaque o que importa.

FERRAMENTAS — LEITURA (respondem na hora): resumo_financeiro, listar_contas, listar_custos, listar_transacoes, contas_vencendo, buscar_cliente, detalhe_cliente.

FERRAMENTAS — ESCRITA (só PREPARAM; o Crasto confirma num cartão). Você CRIA, ATUALIZA e EXCLUI:
- Financeiro: criar_conta, atualizar_conta, dar_baixa_conta, excluir_conta, criar_custo, atualizar_custo, criar_transacao, atualizar_transacao.
- Cadastro do cliente: atualizar_cliente, adicionar_cnpj, adicionar_socio/atualizar_socio/remover_socio, adicionar_pessoa/atualizar_pessoa/remover_pessoa, adicionar_telefone/atualizar_telefone/remover_telefone.
Para ATUALIZAR ou EXCLUIR algo que já existe (uma conta, pessoa, telefone, sócio, custo, transação), primeiro descubra o ID: use listar_contas/listar_custos/listar_transacoes (financeiro) ou detalhe_cliente (pessoas, telefones, sócios — ele devolve o id de cada um). Nunca invente id.
CONFIRMAR ANTES DE EXECUTAR (regra de ouro): ao pedir para criar/alterar/lançar/dar baixa/cadastrar, chame a ferramenta de escrita com dados COMPLETOS e corretos. Ela NÃO grava: prepara e o Crasto vê um cartão de confirmação. No seu texto, mostre em tópicos o que preparou e peça para conferir e confirmar no cartão. NUNCA diga que já lançou/salvou antes da confirmação. Se faltar um dado essencial, PERGUNTE.
VÁRIAS AÇÕES DE UMA VEZ: quando um documento pede vários cadastros (ex.: preencher a ficha inteira de um cliente, ou lançar várias contas), CHAME TODAS as ferramentas de escrita necessárias no MESMO turno — elas entram todas num único cartão e o Crasto confirma tudo junto. Não peça para confirmar uma de cada vez.

CONTAS PARCELADAS: se o cliente/contrato paga em N vezes, use criar_conta com amount = VALOR TOTAL do contrato, payment_installments = número de parcelas e due_date = data da 1ª parcela (opcional payment_day_of_month = dia fixo de vencimento). O sistema gera as N parcelas automaticamente. Não crie N contas separadas.

DOCUMENTOS (multimodal):
- NOTA FISCAL → extraia emitente/fornecedor, CNPJ, número da NF, emissão, vencimento, valor total, itens; classifique a pagar/receber e proponha criar_conta preenchida (invoice_number = número da NF; due_date = vencimento).
- CONTRATO (social ou de prestação de serviço) → extraia razão social, CNPJ, abertura, endereço, SÓCIOS (nome, CPF, %), PESSOAS de contato e TELEFONES. Para preencher a ficha do cliente, proponha DE UMA VEZ: atualizar_cliente (dados da empresa + plano), adicionar_cnpj (o CNPJ), adicionar_socio (cada sócio), adicionar_pessoa (cada contato) e adicionar_telefone (cada telefone). Se o contrato tem valor e parcelas, proponha também criar_conta a receber (parcelada). Descubra o cliente pelo contexto (cliente aberto) ou buscar_cliente. Só grave o que está no documento.`;

const READ = new Set(['resumo_financeiro', 'listar_contas', 'listar_custos', 'listar_transacoes', 'contas_vencendo', 'buscar_cliente', 'detalhe_cliente']);
const WRITE = new Set([
  'criar_conta', 'atualizar_conta', 'dar_baixa_conta', 'excluir_conta',
  'criar_custo', 'atualizar_custo', 'criar_transacao', 'atualizar_transacao',
  'atualizar_cliente', 'adicionar_cnpj',
  'adicionar_socio', 'atualizar_socio', 'remover_socio',
  'adicionar_pessoa', 'atualizar_pessoa', 'remover_pessoa',
  'adicionar_telefone', 'atualizar_telefone', 'remover_telefone',
]);
const CLIENTE_CAMPOS = ['name', 'tax_id', 'tax_id_type', 'founded_on', 'website', 'owner_name', 'notes', 'country', 'stage', 'status', 'plan'];
const CONTA_CAMPOS = ['description', 'amount', 'due_date', 'status', 'contact_name', 'category', 'payment_method', 'invoice_number', 'expense_type', 'notes'];
const CUSTO_CAMPOS = ['description', 'vendor_name', 'category', 'currency', 'amount_original', 'exchange_rate', 'amount_brl', 'recurrence', 'cost_type', 'next_payment_date', 'is_active', 'notes'];
const TX_CAMPOS = ['type', 'category', 'amount', 'description', 'status', 'transaction_date', 'contact_name', 'payment_method', 'notes'];
const PESSOA_CAMPOS = ['full_name', 'role', 'email', 'birthday', 'is_primary', 'notes'];
const TEL_CAMPOS = ['number', 'label', 'country_code', 'is_primary'];
const SOCIO_CAMPOS = ['full_name', 'cpf', 'role_title', 'ownership_percentage', 'is_ceo'];

// Gera as parcelas (payment_schedule) — mesma regra da tela Financeiro (buildSchedule):
// N parcelas mensais a partir da 1ª data, no dia fixo (ou no dia da 1ª data). Datas montadas
// pelos componentes locais (sem toISOString/UTC) para não escorregar o dia.
function gerarParcelas(n: number, first: string, day: any, val: number): any[] {
  const out: any[] = [];
  if (!n || n < 1 || !first) return out;
  const base = new Date(first + 'T00:00:00');
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, day ? Number(day) : base.getDate());
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ installment: i + 1, date: iso, amount: Number(val || 0), status: 'pending' });
  }
  return out;
}

function dataHoje(): string {
  const d = new Date();
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const ext = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  return `${ext} (${iso})`;
}
function linhaContexto(nome?: string | null, id?: string | null): string {
  if (!id) return '';
  return `\n\nCONTEXTO: o Crasto está agora na ficha do cliente ${nome ? `"${nome}" ` : ''}(organization_id = ${id}). Se ele anexar um contrato social ou pedir para atualizar/cadastrar dados deste cliente, use ESSE organization_id.`;
}

const P = (props: any, required?: string[]) => ({ type: 'object', properties: props, ...(required ? { required } : {}) });
const TOOLS: JulieTool[] = [
  { name: 'resumo_financeiro', description: 'Panorama do caixa: total a pagar, a receber e saldo em caixa.', parameters: P({}) },
  { name: 'listar_contas', description: 'Lista contas a pagar (payable) ou a receber (receivable).', parameters: P({ tipo: { type: 'string', enum: ['payable', 'receivable'] }, status: { type: 'string', enum: ['pending', 'partial', 'paid', 'cancelled'] } }) },
  { name: 'listar_custos', description: 'Custos operacionais (ferramentas, infra, assinaturas).', parameters: P({ apenas_ativos: { type: 'boolean' } }) },
  { name: 'listar_transacoes', description: 'Movimentos de caixa (entradas=income, saídas=expense).', parameters: P({ tipo: { type: 'string', enum: ['income', 'expense'] }, status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] } }) },
  { name: 'contas_vencendo', description: 'Contas (a pagar e a receber) que vencem nos próximos N dias, marcando as já vencidas.', parameters: P({ dias: { type: 'number', description: 'janela em dias (padrão 30)' } }) },
  { name: 'buscar_cliente', description: 'Busca clientes (empresas) pelo nome para achar o organization_id.', parameters: P({ nome: { type: 'string' } }, ['nome']) },
  { name: 'detalhe_cliente', description: 'Ficha 360 de um cliente: dados da empresa, CNPJs e sócios.', parameters: P({ organization_id: { type: 'string' } }, ['organization_id']) },

  { name: 'criar_conta', description: 'PROPÕE criar uma conta a pagar ou a receber. Para PARCELADO: amount = valor TOTAL, payment_installments = nº de parcelas, due_date = 1ª parcela (o sistema gera as parcelas).', parameters: P({
    account_type: { type: 'string', enum: ['payable', 'receivable'] }, description: { type: 'string' }, amount: { type: 'number', description: 'valor total (do contrato, se parcelado)' },
    contact_name: { type: 'string' }, category: { type: 'string' }, due_date: { type: 'string', description: 'AAAA-MM-DD (1ª parcela)' },
    payment_installments: { type: 'number', description: 'nº de parcelas (1 = à vista)' }, payment_day_of_month: { type: 'number', description: 'dia fixo de vencimento (opcional)' },
    payment_method: { type: 'string' }, invoice_number: { type: 'string' }, expense_type: { type: 'string', enum: ['consumo', 'revenda'] }, notes: { type: 'string' },
  }, ['account_type', 'description', 'amount']) },
  { name: 'atualizar_conta', description: 'PROPÕE alterar uma conta existente (use o id de listar_contas).', parameters: P({
    id: { type: 'string' }, description: { type: 'string' }, amount: { type: 'number' }, due_date: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'partial', 'paid', 'cancelled'] }, contact_name: { type: 'string' }, category: { type: 'string' }, payment_method: { type: 'string' }, notes: { type: 'string' },
  }, ['id']) },
  { name: 'dar_baixa_conta', description: 'PROPÕE marcar uma conta como PAGA (dar baixa).', parameters: P({ id: { type: 'string' }, amount_paid: { type: 'number' }, payment_date: { type: 'string' } }, ['id']) },
  { name: 'criar_custo', description: 'PROPÕE um custo operacional.', parameters: P({
    description: { type: 'string' }, vendor_name: { type: 'string' }, category: { type: 'string' }, currency: { type: 'string', enum: ['BRL', 'USD', 'EUR'] },
    amount_original: { type: 'number' }, exchange_rate: { type: 'number' }, cost_type: { type: 'string', enum: ['fixo', 'variavel', 'unico'] }, recurrence: { type: 'string', enum: ['mensal', 'anual', 'pontual'] }, next_payment_date: { type: 'string' }, notes: { type: 'string' },
  }, ['description', 'amount_original']) },
  { name: 'criar_transacao', description: 'PROPÕE um movimento de caixa (entrada/saída).', parameters: P({
    type: { type: 'string', enum: ['income', 'expense'] }, description: { type: 'string' }, amount: { type: 'number' }, category: { type: 'string' }, transaction_date: { type: 'string' }, contact_name: { type: 'string' }, payment_method: { type: 'string' }, status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] }, notes: { type: 'string' },
  }, ['type', 'description', 'amount']) },
  { name: 'atualizar_cliente', description: 'PROPÕE preencher/atualizar dados da empresa de um cliente (do contrato).', parameters: P({
    organization_id: { type: 'string' }, name: { type: 'string' }, tax_id: { type: 'string' }, tax_id_type: { type: 'string', enum: ['CNPJ', 'CPF'] }, founded_on: { type: 'string', description: 'AAAA-MM-DD' }, website: { type: 'string' }, owner_name: { type: 'string', description: 'dono / presidente' }, plan: { type: 'string', description: 'plano contratado' }, country: { type: 'string' }, notes: { type: 'string' },
  }, ['organization_id']) },
  { name: 'adicionar_cnpj', description: 'PROPÕE cadastrar um CNPJ (matriz/filial) de um cliente.', parameters: P({ organization_id: { type: 'string' }, cnpj: { type: 'string' }, legal_name: { type: 'string' }, trade_name: { type: 'string' }, is_headquarters: { type: 'boolean' }, country: { type: 'string' } }, ['organization_id', 'cnpj']) },
  { name: 'adicionar_socio', description: 'PROPÕE cadastrar um sócio (do contrato social).', parameters: P({ organization_id: { type: 'string' }, full_name: { type: 'string' }, cpf: { type: 'string' }, role_title: { type: 'string' }, ownership_percentage: { type: 'number', description: 'participação em %' }, is_ceo: { type: 'boolean' } }, ['organization_id', 'full_name']) },
  { name: 'adicionar_pessoa', description: 'PROPÕE cadastrar uma PESSOA de contato do cliente (Pessoas da empresa).', parameters: P({ organization_id: { type: 'string' }, full_name: { type: 'string' }, role: { type: 'string', description: 'cargo (dono, diretor…)' }, email: { type: 'string' }, birthday: { type: 'string', description: 'AAAA-MM-DD' }, is_primary: { type: 'boolean' } }, ['organization_id', 'full_name']) },
  { name: 'adicionar_telefone', description: 'PROPÕE cadastrar um TELEFONE do cliente.', parameters: P({ organization_id: { type: 'string' }, number: { type: 'string' }, label: { type: 'string', description: 'Celular, Fixo, WhatsApp…' }, country_code: { type: 'string', description: 'ex.: +55' }, is_primary: { type: 'boolean' } }, ['organization_id', 'number']) },

  // ATUALIZAR / EXCLUIR (use o id de detalhe_cliente ou listar_*)
  { name: 'excluir_conta', description: 'PROPÕE EXCLUIR uma conta financeira (id de listar_contas).', parameters: P({ id: { type: 'string' } }, ['id']) },
  { name: 'atualizar_custo', description: 'PROPÕE alterar um custo (id de listar_custos).', parameters: P({ id: { type: 'string' }, description: { type: 'string' }, vendor_name: { type: 'string' }, category: { type: 'string' }, currency: { type: 'string', enum: ['BRL', 'USD', 'EUR'] }, amount_original: { type: 'number' }, exchange_rate: { type: 'number' }, recurrence: { type: 'string', enum: ['mensal', 'anual', 'pontual'] }, next_payment_date: { type: 'string' }, is_active: { type: 'boolean' }, notes: { type: 'string' } }, ['id']) },
  { name: 'atualizar_transacao', description: 'PROPÕE alterar uma transação (id de listar_transacoes).', parameters: P({ id: { type: 'string' }, type: { type: 'string', enum: ['income', 'expense'] }, description: { type: 'string' }, amount: { type: 'number' }, category: { type: 'string' }, transaction_date: { type: 'string' }, contact_name: { type: 'string' }, payment_method: { type: 'string' }, status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] }, notes: { type: 'string' } }, ['id']) },
  { name: 'atualizar_socio', description: 'PROPÕE alterar um sócio (id de detalhe_cliente).', parameters: P({ id: { type: 'string' }, full_name: { type: 'string' }, cpf: { type: 'string' }, role_title: { type: 'string' }, ownership_percentage: { type: 'number' }, is_ceo: { type: 'boolean' } }, ['id']) },
  { name: 'remover_socio', description: 'PROPÕE remover um sócio (id de detalhe_cliente).', parameters: P({ id: { type: 'string' } }, ['id']) },
  { name: 'atualizar_pessoa', description: 'PROPÕE alterar uma pessoa de contato (id de detalhe_cliente).', parameters: P({ id: { type: 'string' }, full_name: { type: 'string' }, role: { type: 'string' }, email: { type: 'string' }, birthday: { type: 'string', description: 'AAAA-MM-DD' }, is_primary: { type: 'boolean' }, notes: { type: 'string' } }, ['id']) },
  { name: 'remover_pessoa', description: 'PROPÕE remover uma pessoa de contato (id de detalhe_cliente).', parameters: P({ id: { type: 'string' } }, ['id']) },
  { name: 'atualizar_telefone', description: 'PROPÕE alterar um telefone (id de detalhe_cliente).', parameters: P({ id: { type: 'string' }, number: { type: 'string' }, label: { type: 'string' }, country_code: { type: 'string' }, is_primary: { type: 'boolean' } }, ['id']) },
  { name: 'remover_telefone', description: 'PROPÕE remover um telefone (id de detalhe_cliente).', parameters: P({ id: { type: 'string' } }, ['id']) },
];

type Pending = { kind: string; payload: any; resumo: string };

@Injectable()
export class AssistantService {
  constructor(private readonly db: RlsDbService, private readonly llm: JulieLlmService, private readonly audit: AuditService) {}

  private brl(v: any) { return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`; }

  private preparar(name: string, a: any): Pending | { erro: string } {
    if (name === 'criar_conta') {
      const desc = String(a?.description || '').trim(); const amount = Number(a?.amount);
      if (!desc) return { erro: 'faltou a descrição da conta' };
      if (!(amount > 0)) return { erro: 'faltou o valor (amount) da conta' };
      const tipo = a?.account_type === 'receivable' ? 'receivable' : 'payable';
      const payload: any = { account_type: tipo, description: desc, amount, status: 'pending' };
      for (const k of ['contact_name', 'category', 'due_date', 'payment_method', 'invoice_number', 'expense_type', 'notes']) if (a?.[k]) payload[k] = a[k];
      // PARCELADO: gera o payment_schedule (o total é `amount`; cada parcela = total/n).
      const inst = Number(a?.payment_installments || 0);
      let resumoParc = '';
      if (inst > 1) {
        const first = String(a?.due_date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return { erro: 'para parcelar, informe a data da 1ª parcela (due_date, AAAA-MM-DD)' };
        const val = +(amount / inst).toFixed(2);
        const schedule = gerarParcelas(inst, first, a?.payment_day_of_month, val);
        payload.contract_total = amount;
        payload.payment_installments = inst;
        if (a?.payment_day_of_month) payload.payment_day_of_month = Number(a.payment_day_of_month);
        payload.payment_schedule = schedule;
        payload.due_date = schedule[0]?.date || first;
        resumoParc = ` · ${inst}x de ${this.brl(val)} (1º venc ${schedule[0]?.date})`;
      }
      return { kind: name, payload, resumo: `Conta a ${tipo === 'payable' ? 'PAGAR' : 'RECEBER'} · ${desc} · ${this.brl(amount)}${resumoParc || (a?.due_date ? ` · vence ${a.due_date}` : '')}${a?.contact_name ? ` · ${a.contact_name}` : ''}` };
    }
    if (name === 'atualizar_conta') {
      const id = String(a?.id || '').trim(); if (!id) return { erro: 'faltou o id da conta (use listar_contas)' };
      const campos: any = {}; for (const k of CONTA_CAMPOS) if (a?.[k] != null && a[k] !== '') campos[k] = a[k];
      if (campos.amount != null) campos.amount = Number(campos.amount);
      if (!Object.keys(campos).length) return { erro: 'nada para alterar na conta' };
      return { kind: name, payload: { id, campos }, resumo: `Alterar conta · ${Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(' · ')}` };
    }
    if (name === 'dar_baixa_conta') {
      const id = String(a?.id || '').trim(); if (!id) return { erro: 'faltou o id da conta (use listar_contas)' };
      const payload: any = { id }; if (a?.amount_paid != null) payload.amount_paid = Number(a.amount_paid); if (a?.payment_date) payload.payment_date = a.payment_date;
      return { kind: name, payload, resumo: `Dar baixa (marcar PAGA) na conta ${id}` };
    }
    if (name === 'criar_custo') {
      const desc = String(a?.description || '').trim(); const orig = Number(a?.amount_original);
      if (!desc) return { erro: 'faltou a descrição do custo' };
      if (!(orig > 0)) return { erro: 'faltou o valor (amount_original) do custo' };
      const currency = ['USD', 'EUR', 'BRL'].includes(a?.currency) ? a.currency : 'BRL';
      const rate = currency === 'BRL' ? 1 : Number(a?.exchange_rate) || 1;
      const payload: any = { description: desc, currency, amount_original: orig, exchange_rate: rate, amount_brl: +(orig * rate).toFixed(2), cost_type: a?.cost_type || 'fixo', cost_nature: 'recorrente', recurrence: a?.recurrence || 'mensal', is_active: true };
      for (const k of ['vendor_name', 'category', 'next_payment_date', 'notes']) if (a?.[k]) payload[k] = a[k];
      return { kind: name, payload, resumo: `Custo · ${desc} · ${currency} ${orig}${currency !== 'BRL' ? ` (≈ ${this.brl(payload.amount_brl)})` : ''} · ${payload.recurrence}` };
    }
    if (name === 'criar_transacao') {
      const desc = String(a?.description || '').trim(); const amount = Number(a?.amount);
      if (!['income', 'expense'].includes(a?.type)) return { erro: 'diga se é entrada (income) ou saída (expense)' };
      if (!desc) return { erro: 'faltou a descrição da transação' };
      if (!(amount > 0)) return { erro: 'faltou o valor (amount) da transação' };
      const payload: any = { type: a.type, description: desc, amount, status: a?.status || 'completed' };
      for (const k of ['category', 'transaction_date', 'contact_name', 'payment_method', 'notes']) if (a?.[k]) payload[k] = a[k];
      return { kind: name, payload, resumo: `${a.type === 'income' ? 'ENTRADA' : 'SAÍDA'} · ${desc} · ${this.brl(amount)}${a?.transaction_date ? ` · ${a.transaction_date}` : ''}` };
    }
    if (name === 'atualizar_cliente') {
      const org = String(a?.organization_id || '').trim(); if (!org) return { erro: 'não sei qual cliente — use buscar_cliente ou abra a ficha do cliente' };
      const campos: any = {}; for (const k of CLIENTE_CAMPOS) if (a?.[k] != null && a[k] !== '') campos[k] = a[k];
      if (!Object.keys(campos).length) return { erro: 'nenhum dado do cliente para preencher' };
      return { kind: name, payload: { organization_id: org, campos }, resumo: `Atualizar cliente · ${Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(' · ')}` };
    }
    if (name === 'adicionar_cnpj') {
      const org = String(a?.organization_id || '').trim(); const cnpj = String(a?.cnpj || '').trim();
      if (!org) return { erro: 'não sei qual cliente para o CNPJ' };
      if (!cnpj) return { erro: 'faltou o número do CNPJ' };
      const payload: any = { organization_id: org, country: a?.country || 'BR', reg_type: 'cnpj', cnpj, is_headquarters: a?.is_headquarters === true, is_active: true };
      for (const k of ['legal_name', 'trade_name']) if (a?.[k]) payload[k] = a[k];
      return { kind: name, payload, resumo: `Cadastrar CNPJ ${cnpj}${a?.legal_name ? ` · ${a.legal_name}` : ''}${a?.is_headquarters ? ' · matriz' : ''}` };
    }
    if (name === 'adicionar_socio') {
      const org = String(a?.organization_id || '').trim(); const nome = String(a?.full_name || '').trim();
      if (!org) return { erro: 'não sei qual cliente para o sócio' };
      if (!nome) return { erro: 'faltou o nome do sócio' };
      const payload: any = { organization_id: org, full_name: nome, is_ceo: a?.is_ceo === true };
      for (const k of ['cpf', 'role_title']) if (a?.[k]) payload[k] = a[k];
      if (a?.ownership_percentage != null && a.ownership_percentage !== '') payload.ownership_percentage = Number(a.ownership_percentage);
      return { kind: name, payload, resumo: `Sócio · ${nome}${a?.cpf ? ` · CPF ${a.cpf}` : ''}${payload.ownership_percentage != null ? ` · ${payload.ownership_percentage}%` : ''}${a?.is_ceo ? ' · CEO' : ''}` };
    }
    if (name === 'adicionar_pessoa') {
      const org = String(a?.organization_id || '').trim(); const nome = String(a?.full_name || '').trim();
      if (!org) return { erro: 'não sei qual cliente para a pessoa' };
      if (!nome) return { erro: 'faltou o nome da pessoa' };
      const payload: any = { organization_id: org, full_name: nome, is_primary: a?.is_primary === true };
      for (const k of ['role', 'email', 'birthday', 'notes']) if (a?.[k]) payload[k] = a[k];
      return { kind: name, payload, resumo: `Pessoa · ${nome}${a?.role ? ` · ${a.role}` : ''}${a?.email ? ` · ${a.email}` : ''}` };
    }
    if (name === 'adicionar_telefone') {
      const org = String(a?.organization_id || '').trim(); const num = String(a?.number || '').trim();
      if (!org) return { erro: 'não sei qual cliente para o telefone' };
      if (!num) return { erro: 'faltou o número do telefone' };
      const payload: any = { organization_id: org, number: num, label: a?.label || 'Celular', country_code: a?.country_code || '+55', is_primary: a?.is_primary === true };
      return { kind: name, payload, resumo: `Telefone · ${payload.country_code} ${num}${a?.label ? ` · ${a.label}` : ''}` };
    }

    // ---- ATUALIZAR / EXCLUIR (por id) ----
    const idDe = () => { const id = String(a?.id || '').trim(); return id || null; };
    if (name === 'excluir_conta') {
      const id = idDe(); if (!id) return { erro: 'faltou o id da conta (use listar_contas)' };
      return { kind: name, payload: { id }, resumo: `EXCLUIR conta ${id}` };
    }
    if (name === 'atualizar_custo') {
      const id = idDe(); if (!id) return { erro: 'faltou o id do custo (use listar_custos)' };
      const campos: any = {}; for (const k of CUSTO_CAMPOS) if (a?.[k] != null && a[k] !== '') campos[k] = a[k];
      if (!Object.keys(campos).length) return { erro: 'nada para alterar no custo' };
      if (campos.amount_original != null) { // recalcula o valor em R$
        const cur = campos.currency || 'BRL'; const rate = cur === 'BRL' ? 1 : (Number(campos.exchange_rate) || 1);
        campos.amount_brl = +(Number(campos.amount_original) * rate).toFixed(2);
      }
      return { kind: name, payload: { id, campos }, resumo: `Alterar custo · ${Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(' · ')}` };
    }
    if (name === 'atualizar_transacao') {
      const id = idDe(); if (!id) return { erro: 'faltou o id da transação (use listar_transacoes)' };
      const campos: any = {}; for (const k of TX_CAMPOS) if (a?.[k] != null && a[k] !== '') campos[k] = a[k];
      if (campos.amount != null) campos.amount = Number(campos.amount);
      if (!Object.keys(campos).length) return { erro: 'nada para alterar na transação' };
      return { kind: name, payload: { id, campos }, resumo: `Alterar transação · ${Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(' · ')}` };
    }
    if (name === 'atualizar_socio' || name === 'atualizar_pessoa' || name === 'atualizar_telefone') {
      const campoSet = name === 'atualizar_socio' ? SOCIO_CAMPOS : name === 'atualizar_pessoa' ? PESSOA_CAMPOS : TEL_CAMPOS;
      const rot = name === 'atualizar_socio' ? 'sócio' : name === 'atualizar_pessoa' ? 'pessoa' : 'telefone';
      const id = idDe(); if (!id) return { erro: `faltou o id (use detalhe_cliente para ver o id do ${rot})` };
      const campos: any = {}; for (const k of campoSet) if (a?.[k] != null && a[k] !== '') campos[k] = a[k];
      if (name === 'atualizar_socio' && campos.ownership_percentage != null) campos.ownership_percentage = Number(campos.ownership_percentage);
      if (!Object.keys(campos).length) return { erro: `nada para alterar no ${rot}` };
      return { kind: name, payload: { id, campos }, resumo: `Alterar ${rot} · ${Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(' · ')}` };
    }
    if (name === 'remover_socio' || name === 'remover_pessoa' || name === 'remover_telefone') {
      const rot = name === 'remover_socio' ? 'sócio' : name === 'remover_pessoa' ? 'pessoa' : 'telefone';
      const id = idDe(); if (!id) return { erro: `faltou o id (use detalhe_cliente para ver o id do ${rot})` };
      return { kind: name, payload: { id }, resumo: `Remover ${rot} ${id}` };
    }
    return { erro: 'ferramenta de escrita desconhecida' };
  }

  private async ler(uid: string, name: string, args: any): Promise<any> {
    return this.db.asUser(uid, async (c) => {
      const num = (v: any) => Number(v || 0);
      const restante = (r: any) => num(r.amount) - num(r.amount_paid);
      const abertas = (rows: any[]) => rows.filter((r) => r.status !== 'paid' && r.status !== 'cancelled');
      if (name === 'resumo_financeiro') {
        const pay = (await c.query(`select * from public.fin_accounts('payable', null)`)).rows;
        const rec = (await c.query(`select * from public.fin_accounts('receivable', null)`)).rows;
        const tx = (await c.query(`select * from public.fin_transactions(null, null)`)).rows;
        const soma = (rows: any[], f: (r: any) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
        const entradas = soma(tx.filter((r: any) => r.type === 'income' && r.status === 'completed'), (r) => num(r.amount));
        const saidas = soma(tx.filter((r: any) => r.type === 'expense' && r.status === 'completed'), (r) => num(r.amount));
        const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
        const vencidas = (rows: any[]) => abertas(rows).filter((r) => r.due_date && new Date(r.due_date) < hoje0);
        return { a_pagar: soma(abertas(pay), restante), a_receber: soma(abertas(rec), restante), saldo_em_caixa: entradas - saidas, pagar_vencidas: soma(vencidas(pay), restante), receber_vencidas: soma(vencidas(rec), restante) };
      }
      if (name === 'listar_contas') return (await c.query(`select * from public.fin_accounts($1,$2)`, [args?.tipo || null, args?.status || null])).rows.slice(0, 50);
      if (name === 'listar_custos') return (await c.query(`select * from public.fin_costs($1)`, [args?.apenas_ativos === true ? true : null])).rows.slice(0, 80);
      if (name === 'listar_transacoes') return (await c.query(`select * from public.fin_transactions($1,$2)`, [args?.tipo || null, args?.status || null])).rows.slice(0, 50);
      if (name === 'contas_vencendo') {
        const dias = Number(args?.dias) > 0 ? Number(args.dias) : 30;
        const limite = new Date(); limite.setDate(limite.getDate() + dias); limite.setHours(23, 59, 59, 999);
        const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
        const pay = (await c.query(`select * from public.fin_accounts('payable', null)`)).rows;
        const rec = (await c.query(`select * from public.fin_accounts('receivable', null)`)).rows;
        const filtro = (rows: any[]) => abertas(rows).filter((r) => r.due_date && new Date(r.due_date) <= limite)
          .map((r) => ({ id: r.id, descricao: r.description, contato: r.contact_name, vencimento: r.due_date, valor: num(r.amount), restante: restante(r), vencida: new Date(r.due_date) < hoje0 }))
          .sort((x, y) => (x.vencimento < y.vencimento ? -1 : 1));
        return { janela_dias: dias, a_pagar: filtro(pay), a_receber: filtro(rec) };
      }
      if (name === 'buscar_cliente') return (await c.query(`select id, name, tax_id, stage from public.organizations where name ilike $1 order by name limit 12`, [`%${String(args?.nome || '').trim()}%`])).rows;
      if (name === 'detalhe_cliente') {
        const org = String(args?.organization_id || '').trim(); if (!org) return { erro: 'faltou o organization_id' };
        const cliente = (await c.query(`select id,name,tax_id,tax_id_type,founded_on,website,owner_name,plan,country,stage,status,notes from public.organizations where id=$1`, [org])).rows[0] || null;
        const cnpjs = (await c.query(`select cnpj, legal_name, trade_name, is_headquarters, is_active from crm.company_cnpjs where organization_id=$1 order by is_headquarters desc`, [org])).rows;
        // ids incluídos: a Julie usa para atualizar/remover sócio, pessoa e telefone.
        const socios = (await c.query(`select id, full_name, cpf, role_title, ownership_percentage, is_ceo from crm.company_partners where organization_id=$1 and is_active order by is_ceo desc`, [org])).rows;
        const pessoas = (await c.query(`select id, full_name, role, email, birthday, is_primary from crm.people where organization_id=$1 order by is_primary desc, full_name`, [org])).rows;
        const telefones = (await c.query(`select id, label, country_code, number, is_primary from crm.phones where organization_id=$1 order by is_primary desc`, [org])).rows;
        return { cliente, cnpjs, socios, pessoas, telefones };
      }
      return { erro: 'ferramenta desconhecida: ' + name };
    });
  }

  async chat(uid: string, messages: JulieMsg[], contexto?: { organization_id?: string | null }): Promise<{ reply: string; pending?: Pending[] | null; uso?: any }> {
    const hist: JulieMsg[] = [...messages];
    // VÁRIAS ações podem ser propostas num turno só (ex.: preencher a ficha inteira de um
    // contrato) — todas entram no MESMO cartão e o Crasto confirma tudo junto.
    const pendings: Pending[] = [];
    let uso: any;
    let system = SYSTEM + `\n\nHOJE é ${dataHoje()}.`;
    const orgCtx = contexto?.organization_id ? String(contexto.organization_id) : '';
    if (orgCtx) {
      const nome = await this.db.asUser(uid, async (c) => (await c.query(`select name from public.organizations where id=$1`, [orgCtx])).rows[0]?.name).catch(() => null);
      system += linhaContexto(nome, orgCtx);
    }
    for (let volta = 0; volta < 5; volta++) {
      const turn = await this.llm.completeTools(system, hist, TOOLS);
      uso = turn.uso;
      if (!turn.calls.length) return { reply: turn.text || '(sem resposta)', pending: pendings.length ? pendings : null, uso };
      hist.push({ role: 'assistant_call', calls: turn.calls });
      const results: { name: string; result: any }[] = [];
      for (const call of turn.calls) {
        if (WRITE.has(call.name)) {
          if (pendings.length >= 25) { results.push({ name: call.name, result: { erro: 'muitas ações de uma vez — peça para confirmar estas antes de propor mais' } }); continue; }
          const prep = this.preparar(call.name, call.args);
          if ('erro' in prep) { results.push({ name: call.name, result: { erro: prep.erro } }); continue; }
          pendings.push(prep);
          results.push({ name: call.name, result: { proposto: true, aguardando_confirmacao_do_crasto: true, resumo: prep.resumo } });
        } else if (READ.has(call.name)) {
          results.push({ name: call.name, result: await this.ler(uid, call.name, call.args).catch((e) => ({ erro: e.message })) });
        } else {
          results.push({ name: call.name, result: { erro: 'ferramenta desconhecida' } });
        }
      }
      hist.push({ role: 'tool_result', results });
    }
    return { reply: 'Precisei de muitos passos e parei por segurança. Pode reformular?', pending: pendings.length ? pendings : null, uso };
  }

  // /execute — SÓ aqui grava, depois do Crasto confirmar. Roda no RLS do admin + Auditoria.
  async executar(req: any, uid: string, kind: string, payload: any): Promise<any> {
    if (!WRITE.has(kind)) throw new Error('ação não permitida');
    const r = await this.db.asUser(uid, async (c) => {
      if (kind === 'criar_conta') return (await c.query(`select public.fin_account_upsert($1) as r`, [payload])).rows[0]?.r;
      if (kind === 'atualizar_conta') {
        const conta = (await c.query(`select * from public.fin_accounts(null,null)`)).rows.find((x: any) => x.id === payload.id);
        if (!conta) throw new Error('conta não encontrada');
        return (await c.query(`select public.fin_account_upsert($1) as r`, [{ id: conta.id, account_type: conta.account_type, ...payload.campos }])).rows[0]?.r;
      }
      if (kind === 'dar_baixa_conta') {
        const conta = (await c.query(`select * from public.fin_accounts(null,null)`)).rows.find((x: any) => x.id === payload.id);
        if (!conta) throw new Error('conta não encontrada');
        const hoje = new Date().toISOString().slice(0, 10);
        return (await c.query(`select public.fin_account_upsert($1) as r`, [{ id: conta.id, account_type: conta.account_type, status: 'paid', amount_paid: payload.amount_paid ?? conta.amount, payment_date: payload.payment_date ?? hoje }])).rows[0]?.r;
      }
      if (kind === 'criar_custo') return (await c.query(`select public.fin_cost_upsert($1) as r`, [payload])).rows[0]?.r;
      if (kind === 'criar_transacao') return (await c.query(`select public.fin_transaction_upsert($1) as r`, [payload])).rows[0]?.r;
      if (kind === 'atualizar_cliente') {
        const cols = Object.keys(payload?.campos || {}).filter((k) => CLIENTE_CAMPOS.includes(k));
        if (!cols.length) throw new Error('nenhum campo válido');
        const sets = cols.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
        await c.query(`update public.organizations set ${sets} where id = $1`, [payload.organization_id, ...cols.map((k) => payload.campos[k])]);
        return { atualizado: cols };
      }
      if (kind === 'adicionar_cnpj') return (await c.query(`select public.admin_registration_upsert($1) as r`, [payload])).rows[0]?.r;
      if (kind === 'adicionar_socio') {
        // RLS `partners_admin_all` = is_crasto_admin() → o admin grava direto (sem RPC).
        return (await c.query(
          `insert into crm.company_partners (organization_id, full_name, cpf, role_title, ownership_percentage, is_ceo, is_active)
           values ($1,$2,$3,$4,$5,$6,true) returning id`,
          [payload.organization_id, payload.full_name, payload.cpf ?? null, payload.role_title ?? null, payload.ownership_percentage ?? null, payload.is_ceo === true],
        )).rows[0];
      }
      if (kind === 'adicionar_pessoa') {
        // RLS `people_admin` = is_crasto_admin() → grava direto (mesma tabela da tela).
        return (await c.query(
          `insert into crm.people (organization_id, full_name, role, email, birthday, is_primary, notes)
           values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [payload.organization_id, payload.full_name, payload.role ?? null, payload.email ?? null,
           payload.birthday ? String(payload.birthday).slice(0, 10) : null, payload.is_primary === true, payload.notes ?? null],
        )).rows[0];
      }
      if (kind === 'adicionar_telefone') {
        // RLS `phones_admin` = is_crasto_admin() → grava direto.
        return (await c.query(
          `insert into crm.phones (organization_id, label, country_code, number, is_primary)
           values ($1,$2,$3,$4,$5) returning id`,
          [payload.organization_id, payload.label ?? null, payload.country_code ?? null, payload.number, payload.is_primary === true],
        )).rows[0];
      }

      // ---- ATUALIZAR / EXCLUIR ----
      if (kind === 'excluir_conta') { await c.query(`select public.fin_account_delete($1)`, [payload.id]); return { excluido: payload.id }; }
      if (kind === 'atualizar_custo') return (await c.query(`select public.fin_cost_upsert($1) as r`, [{ id: payload.id, ...(payload.campos || {}) }])).rows[0]?.r;
      if (kind === 'atualizar_transacao') return (await c.query(`select public.fin_transaction_upsert($1) as r`, [{ id: payload.id, ...(payload.campos || {}) }])).rows[0]?.r;
      if (kind === 'atualizar_socio') {
        const s = payload.campos || {};
        return (await c.query(
          `update crm.company_partners set full_name=coalesce($2,full_name), cpf=coalesce($3,cpf), role_title=coalesce($4,role_title),
             ownership_percentage=coalesce($5,ownership_percentage), is_ceo=coalesce($6,is_ceo) where id=$1 returning id`,
          [payload.id, s.full_name ?? null, s.cpf ?? null, s.role_title ?? null, s.ownership_percentage ?? null, s.is_ceo ?? null])).rows[0];
      }
      if (kind === 'remover_socio') { await c.query(`update crm.company_partners set is_active=false where id=$1`, [payload.id]); return { removido: payload.id }; }
      if (kind === 'atualizar_pessoa') {
        const s = payload.campos || {};
        return (await c.query(
          `update crm.people set full_name=coalesce($2,full_name), role=coalesce($3,role), email=coalesce($4,email),
             birthday=coalesce($5::date,birthday), is_primary=coalesce($6,is_primary), notes=coalesce($7,notes), updated_at=now() where id=$1 returning id`,
          [payload.id, s.full_name ?? null, s.role ?? null, s.email ?? null, s.birthday ? String(s.birthday).slice(0, 10) : null, s.is_primary ?? null, s.notes ?? null])).rows[0];
      }
      if (kind === 'remover_pessoa') { await c.query(`delete from crm.people where id=$1`, [payload.id]); return { removido: payload.id }; }
      if (kind === 'atualizar_telefone') {
        const s = payload.campos || {};
        return (await c.query(
          `update crm.phones set number=coalesce($2,number), label=coalesce($3,label), country_code=coalesce($4,country_code), is_primary=coalesce($5,is_primary) where id=$1 returning id`,
          [payload.id, s.number ?? null, s.label ?? null, s.country_code ?? null, s.is_primary ?? null])).rows[0];
      }
      if (kind === 'remover_telefone') { await c.query(`delete from crm.phones where id=$1`, [payload.id]); return { removido: payload.id }; }

      throw new Error('ação desconhecida');
    });
    await this.audit.log(req, 'julie_' + kind, { system: 'portal', ctx: { payload } });
    return { ok: true, resultado: r };
  }
}
