-- 050 — Conciliação (extrato Nubank ago/2026): pagamento de custos operacionais.
-- Aplicado em produção (Management API) 2026-08-27.
alter table finance.operational_costs add column if not exists amount_paid numeric default 0;
alter table finance.operational_costs add column if not exists payment_date timestamptz;
-- fin_cost_upsert atualizado (via API) p/ gravar amount_paid/payment_date.
-- Baixa das ferramentas pagas no cartão em ago (fonte: extrato Nubank Cartão fatura 2026-09-04):
--   Anthropic(Claude) 1.150,24 (14/08) · LinkedIn 1.439,88 (10/08) · Google Workspace 245,40 (02/08)
--   · Wispr Flow 299,92 (14/08) · Supabase 307,51 (11/08) · Hostinger 1.141,45 (19/08) · Google One 96,99 (02/08).
-- (Anthropic uso 108,65 / Deepseek 56,28 / Gemini 120,36 / Higgsfield 27,59 = IA em finance.ai_usage.)
