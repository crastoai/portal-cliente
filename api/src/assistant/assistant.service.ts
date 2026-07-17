import { Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { JulieLlmService, JulieMsg, JulieTool } from './julie-llm.service';

// A JULIE — CFO de IA da Crasto.AI (admin-only). FASE 1: ela CONSULTA o financeiro e LÊ
// documentos anexados (nota fiscal, contrato) para EXTRAIR e APRESENTAR — mas AINDA NÃO grava
// nada. A escrita (criar lançamento etc.) entra na Fase 2, sempre com confirmar-antes.
const SYSTEM = `Você é a Julie, a CFO (diretora financeira) de IA da Crasto.AI. Fala com o Carlos Crasto e o time, em português do Brasil, de forma objetiva, precisa e profissional. Valores sempre em Reais (R$), formato brasileiro.

O QUE VOCÊ FAZ AGORA (Fase 1):
- CONSULTA o financeiro pelas ferramentas (contas a pagar/receber, custos, caixa, transações) para responder com números REAIS.
- LÊ documentos que forem anexados (nota fiscal, contrato social, comprovante) e EXTRAI os dados de forma organizada, mostrando o que encontrou para o Crasto conferir.

REGRA DE OURO — você AINDA NÃO grava nada no sistema nesta fase. Quando pedirem para registrar/criar/alterar/dar baixa em algo, você PREPARA os dados (mostra exatamente o que seria lançado, em tópicos) e avisa com clareza: "Deixei pronto para lançar; a execução automática entra na próxima fase — confirme os dados e eu registro assim que for liberada." NUNCA diga que registrou/salvou algo — porque não registrou.

NUNCA invente número. Se não tem o dado, chame uma ferramenta; se ainda assim não tiver, diga que não tem. Ao ler uma nota fiscal, extraia: emitente/fornecedor, CNPJ, número da NF, data de emissão, vencimento (se houver), valor total, itens/descrição, e classifique como conta a pagar ou receber. Ao ler um contrato social: razão social, CNPJ, sócios (nome, CPF, % participação), endereço, data de abertura.

Seja concisa. Use tópicos quando listar dados. Termine oferecendo o próximo passo.`;

const TOOLS: JulieTool[] = [
  { name: 'resumo_financeiro', description: 'Panorama do caixa agora: total a pagar, a receber e saldo em caixa. Use quando perguntarem "como está o financeiro", saldo, quanto devo, etc.', parameters: { type: 'object', properties: {} } },
  { name: 'listar_contas', description: 'Lista contas a pagar (payable) ou a receber (receivable), opcionalmente por status.', parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['payable', 'receivable'] }, status: { type: 'string', enum: ['pending', 'partial', 'paid', 'cancelled'] } } } },
  { name: 'listar_custos', description: 'Custos operacionais (ferramentas, infraestrutura, assinaturas).', parameters: { type: 'object', properties: { apenas_ativos: { type: 'boolean' } } } },
  { name: 'listar_transacoes', description: 'Movimentos de caixa (entradas=income, saídas=expense).', parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['income', 'expense'] }, status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] } } } },
];

@Injectable()
export class AssistantService {
  private log = new Logger('Julie');
  constructor(private readonly db: RlsDbService, private readonly llm: JulieLlmService) {}

  // Executa a ferramenta de LEITURA no contexto RLS do admin (as RPCs fin_* revalidam admin).
  private async executar(uid: string, name: string, args: any): Promise<any> {
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
        return {
          a_pagar: soma(abertas(pay), restante),
          a_receber: soma(abertas(rec), restante),
          saldo_em_caixa: entradas - saidas,
          contas_a_pagar_abertas: abertas(pay).length,
          contas_a_receber_abertas: abertas(rec).length,
        };
      }
      if (name === 'listar_contas') return (await c.query(`select * from public.fin_accounts($1,$2)`, [args?.tipo || null, args?.status || null])).rows.slice(0, 50);
      if (name === 'listar_custos') return (await c.query(`select * from public.fin_costs($1)`, [args?.apenas_ativos === true ? true : null])).rows.slice(0, 80);
      if (name === 'listar_transacoes') return (await c.query(`select * from public.fin_transactions($1,$2)`, [args?.tipo || null, args?.status || null])).rows.slice(0, 50);
      return { erro: 'ferramenta desconhecida: ' + name };
    });
  }

  async chat(uid: string, messages: JulieMsg[]): Promise<{ reply: string; uso?: any }> {
    const hist: JulieMsg[] = [...messages];
    let ultimoUso: any;
    // Máx. 4 voltas: modelo → (pede ferramenta → executamos NÓS → devolve) → resposta.
    for (let volta = 0; volta < 4; volta++) {
      const turn = await this.llm.completeTools(SYSTEM, hist, TOOLS);
      ultimoUso = turn.uso;
      if (!turn.calls.length) return { reply: turn.text || '(sem resposta)', uso: ultimoUso };
      hist.push({ role: 'assistant_call', calls: turn.calls });
      const results: { name: string; result: any }[] = [];
      for (const call of turn.calls) {
        const result = await this.executar(uid, call.name, call.args).catch((e) => ({ erro: e.message }));
        results.push({ name: call.name, result });
      }
      hist.push({ role: 'tool_result', results });
    }
    return { reply: 'Precisei de muitos passos e parei por segurança. Pode reformular o pedido?', uso: ultimoUso };
  }
}
