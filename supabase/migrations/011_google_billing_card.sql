-- ============================================================================
-- 011 · GOOGLE CLOUD BILLING (custo real do Gemini) — card na tela de Integrações
--
-- Pedido do Crasto (2026-07-24): trazer o custo REAL do Gemini (o mais usado), automático como
-- OpenAI/Anthropic. O Gemini não tem API de custo com key simples — o custo é do Google Cloud
-- Billing, lido do BigQuery Export com uma Service Account. Este card guarda: project_id/dataset/
-- billing_account (meta, não-secreto) + o JSON da service account (Vault). O sync (ai-cost-sync)
-- gera o token OAuth a partir do JSON e consulta o BigQuery.
-- ============================================================================
insert into automation.integrations (key, display_name, status)
  values ('google_billing', 'Google Cloud Billing (Gemini)', 'disconnected')
  on conflict (key) do nothing;
