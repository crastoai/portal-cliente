-- ============================================================================
-- 001 · PERMISSÃO MÓDULO × USUÁRIO (sub-acessos do Portal — Blueprint v1.1 Fase 2)
--
-- ADITIVO e reversível. Hoje um módulo é liberado por ORG (delivery.client_modules); esta
-- tabela deixa o DONO (client_owner) restringir QUAIS módulos um USUÁRIO específico vê.
--
-- Regra: SEM linhas para um usuário = ele vê TODOS os módulos ativos da org (comportamento
-- atual, sem regressão). COM linhas = restrito exatamente a esses vdi_module_id.
--
-- Acesso: RLS habilitada SEM policies (deny-default, padrão dos schemas sensíveis) — só o
-- middle-end (service_role) acessa, e o controller valida quem pode ler/gravar (dono/admin).
-- ============================================================================
create table if not exists delivery.user_module_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  vdi_module_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, vdi_module_id)
);
create index if not exists idx_uma_user on delivery.user_module_access (user_id);
create index if not exists idx_uma_org on delivery.user_module_access (organization_id);
alter table delivery.user_module_access enable row level security;
