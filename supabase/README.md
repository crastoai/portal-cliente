# Portal · Banco (Supabase) — migrations

Versionamento **append-only** dos objetos do banco do Portal (schema `finance` e as RPCs
`fin_*` / `my_faturas`, etc.). Até 2026-07-20 essas funções viviam **só no banco**, sem
registro no repositório — este diretório passa a ser o histórico das mudanças.

## Como funciona

- **`migrations/000_baseline_finance.sql`** — *snapshot* do schema `finance` (tabelas
  `accounts`, `operational_costs`, `transactions` + as 8 RPCs financeiras + RLS) como está
  hoje, **já incluindo** o fix de status/datas por-parcela (20/07/2026). Não é um bootstrap
  do zero garantido: o **banco de produção continua a fonte da verdade**; o baseline captura
  o que existe para termos um ponto de partida versionado.
- **Cada alteração nova = uma migration numerada nova** (`001_...sql`, `002_...sql`, …).
  Nunca edite um arquivo já aplicado — crie o próximo número. Escreva idempotente quando der
  (`create or replace`, `create table if not exists`; mudança de tipo de retorno de função
  exige `drop function` + `create`).

## Como aplicar

Hoje é **manual**, contra o Supabase do Portal (não há runner automático):

- Conexão: `DATABASE_URL` do serviço `portal-cliente/api` no EasyPanel (senha **só no
  cofre** — nunca aqui). Use a **session pooler (porta 5432)** para DDL, não a transaction
  pooler (6543), que trava DDL.
- Rode a migration dentro de **uma transação com verificação** e só faça `commit` se os
  asserts passarem (para mudança em função de isolamento/financeira, teste o comportamento
  antes de confirmar). Foi assim que a `001`+ e o baseline foram aplicados.

## Escopo atual

O baseline cobre o **núcleo financeiro** (contas, custos operacionais, transações e as RPCs
que a tela `admin/Financeiro.tsx` e o `billing`/`my_faturas` usam). Outros objetos do banco
do Portal (demais RPCs, outros schemas) **ainda não estão capturados** — adicione-os
incrementalmente conforme forem tocados, cada um na sua migration.

> Padrão espelhado do `wacrm/supabase/migrations`. Governança de dados: ver o guarda-chuva
> em `00_Governance/`.
