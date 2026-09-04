-- ============================================================================
-- 065 · FINANCEIRO MULTITENANT — Fase 7: endurecimento
--
-- (1) finance.documents nasceu SEM RLS (migration 062). Liga a RLS para igualar as
--     demais tabelas do schema (deny-by-default no acesso direto; as RPCs SECURITY
--     DEFINER continuam funcionando pois rodam como owner). Não há grant direto a
--     authenticated/anon em finance.* — auditado 2026-09-04 (direct_grants = []).
-- (2) owner_org_id vira NOT NULL nas 4 tabelas do módulo. Seguro: backfill (063)
--     provou 0 nulos e as RPCs (064) sempre carimbam owner via fin_scope_org().
--     SET NOT NULL revalida as linhas existentes — aborta sozinho se houver nulo.
--
-- NÃO toca em ai_usage/gcp_map (Núcleo). DB-only: nenhum deploy de api/web.
-- Aplicada em prod via Management API em 2026-09-04.
-- ============================================================================
begin;

alter table finance.documents enable row level security;

alter table finance.accounts          alter column owner_org_id set not null;
alter table finance.operational_costs alter column owner_org_id set not null;
alter table finance.transactions      alter column owner_org_id set not null;
alter table finance.documents         alter column owner_org_id set not null;

commit;
