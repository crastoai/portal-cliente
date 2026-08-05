-- ============================================================================
-- 037 — client_services faltava GRANT p/ service_role (mesma classe do 036)
-- ----------------------------------------------------------------------------
-- O snapshot da Psiquê (PsiqueService.snapshot → gerarNarrativa) lê
-- delivery.client_services via asService (service_role) para montar as "conquistas".
-- Sem o grant, o Postgres nega a tabela → o snapshot estoura → a narrativa do hero
-- NÃO é gerada (o cliente vê o texto fixo de fallback em vez do texto da IA).
--
-- (As faltas de grant em finance.* são INTENCIONAIS: o cliente lê finança apenas via
--  funções SECURITY DEFINER (my_faturas etc.), nunca direto na tabela — por isso não
--  são concedidas aqui.)
-- ============================================================================

grant select on table delivery.client_services to service_role;
