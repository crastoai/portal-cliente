-- ============================================================================
-- 038 · delivery.user_sessions — RELÓGIO DE PONTO do lado do PORTAL (espelha o wacrm).
--
-- O relógio de ponto (Cockpit) já mede o tempo ativo no WhatsApp CRM (public.user_sessions do
-- wacrm). Este é o equivalente NO PORTAL, para o merge Portal+wacrm por user_id contar o trabalho
-- ativo nos DOIS sistemas. Mesmo modelo: started_at + last_ping_at (aba aberta) + last_active_at
-- (ATIVIDADE REAL, via heartbeat) + logout_at/logout_reason (break de 30 min / manual).
-- "Tempo logado" = soma(coalesce(logout_at, last_active_at, last_ping_at) - started_at).
--
-- RLS espelha delivery.module_sessions (migr 002 + 003): self vê o próprio; client_owner vê a
-- equipe da própria org; crasto_admin vê tudo. Escrita own_insert/own_update pelo próprio usuário;
-- o fechamento forçado (idle_timeout) roda com service_role (passa por cima da RLS).
-- Idempotente. Aplicar manualmente pela session pooler (5432), dentro de transação.
-- ============================================================================
create table if not exists delivery.user_sessions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null,
  started_at        timestamptz not null default now(),
  last_ping_at      timestamptz not null default now(),
  last_active_at    timestamptz not null default now(),
  logout_at         timestamptz,
  logout_reason     text check (logout_reason in ('manual', 'idle_timeout', 'session_expired'))
);
create index if not exists user_sessions_org_idx  on delivery.user_sessions (organization_id, started_at desc);
create index if not exists user_sessions_user_idx on delivery.user_sessions (user_id, started_at desc);
create index if not exists user_sessions_open_idx on delivery.user_sessions (user_id) where logout_at is null;

alter table delivery.user_sessions enable row level security;

grant select, insert, update on table delivery.user_sessions to authenticated;
grant select, insert, update, delete on table delivery.user_sessions to service_role;

-- crasto_admin vê tudo (base: 002)
drop policy if exists user_sessions_admin_all on delivery.user_sessions;
create policy user_sessions_admin_all on delivery.user_sessions
  for all using (public.is_admin_viewing_all());

-- self vê o próprio (base: 003)
drop policy if exists user_sessions_self_read on delivery.user_sessions;
create policy user_sessions_self_read on delivery.user_sessions
  for select using (user_id = auth.uid());

-- client_owner vê a equipe da própria org (base: 003; papel lido no banco via public.profiles)
drop policy if exists user_sessions_owner_read on delivery.user_sessions;
create policy user_sessions_owner_read on delivery.user_sessions
  for select using (
    organization_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.organization_id = delivery.user_sessions.organization_id
         and p.role::text = 'client_owner'
    )
  );

-- só a própria sessão, na própria org
drop policy if exists user_sessions_own_insert on delivery.user_sessions;
create policy user_sessions_own_insert on delivery.user_sessions
  for insert with check (user_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists user_sessions_own_update on delivery.user_sessions;
create policy user_sessions_own_update on delivery.user_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
