-- 049 — Redução de despesas: coluna prev_monthly (custo mensal ANTERIOR) em operational_costs.
-- Aplicado em produção (Management API) 2026-08-27. Card "Redução de despesas" = (prev_monthly - custo_mensal_atual) anualizado.
alter table finance.operational_costs add column if not exists prev_monthly numeric;
-- fin_cost_upsert atualizado (via API) para gravar prev_monthly.
-- Dados: OpenAI anual (R$3.240) -> is_active=false (cancelado 2026-08-26); criado ChatGPT Pro (OpenAI) R$99/mês, prev_monthly=270.
