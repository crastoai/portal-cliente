-- ============================================================================
-- 002 · MÓDULOS DENTRO DO PORTAL + MÉTRICA DE USO POR USUÁRIO
--
-- Contexto (decisão do Crasto · 2026-07-23): o Portal é o sistema mãe e o cliente acessa
-- TODOS os módulos por ele, com vários usuários por empresa e métrica por pessoa. Hoje os
-- módulos vivem no Lovable e abrem em NOVA ABA com login/senha compartilhados da empresa —
-- o que impede medir uso e impede acesso por pessoa.
--
-- Esta migration é o degrau 1 de 3, e é ADITIVA (nada muda para quem já está configurado):
--   `link`  = comportamento de hoje (nova aba). Default — quem não configurou não sente nada.
--   `embed` = abre DENTRO do Portal (tela cheia, "Voltar ao Portal"), como o WhatsApp CRM.
--             Verificado: apps do Lovable não bloqueiam iframe (sem X-Frame-Options nem
--             CSP frame-ancestors), então isso funciona sem tocar no Lovable.
--   `sso`   = embed + sessão do próprio usuário no destino. Modelado agora, LIGADO DEPOIS:
--             depende de cada app do Lovable validar o token do Portal (é o que o wacrm já
--             faz em produção via JWKS). Quando os módulos saírem do Lovable para bancos
--             separados, este contrato continua valendo — a migração fica invisível.
--
-- A métrica NÃO espera o SSO: mesmo com credencial compartilhada, é o PORTAL que abre o
-- módulo, então é aqui que se sabe quem abriu, o quê e por quanto tempo.
-- ============================================================================

-- 1) Como cada instância abre. Default 'link' = nada muda até alguém escolher outro modo.
alter table delivery.client_modules
  add column if not exists access_mode text not null default 'link';

alter table delivery.client_modules drop constraint if exists client_modules_access_mode_chk;
alter table delivery.client_modules
  add constraint client_modules_access_mode_chk check (access_mode in ('link', 'embed', 'sso'));

-- 2) Sessões de uso — quem abriu, qual módulo, quando, por quanto tempo.
--    Tabela mutável de propósito (heartbeat): `audit.events` é append-only e serve à trilha
--    de segurança; duração de uso é outra pergunta e pede outro formato. Não é duplicação:
--    trilha (imutável) × métrica (sessão viva).
create table if not exists delivery.module_sessions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  client_module_id  uuid not null references delivery.client_modules(id) on delete cascade,
  vdi_module_id     uuid,
  user_id           uuid not null,
  mode              text not null default 'embed',
  started_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),  -- heartbeat: aba fechada no tapa ainda deixa duração
  ended_at          timestamptz
);

create index if not exists module_sessions_org_idx  on delivery.module_sessions (organization_id, started_at desc);
create index if not exists module_sessions_user_idx on delivery.module_sessions (user_id, started_at desc);
create index if not exists module_sessions_cm_idx   on delivery.module_sessions (client_module_id, started_at desc);

alter table delivery.module_sessions enable row level security;

-- GRANT é outra camada, anterior à RLS: sem ele o papel `authenticated` leva "permission
-- denied" antes mesmo de a policy ser avaliada. Delete de fora: histórico de uso não se apaga.
grant select, insert, update on table delivery.module_sessions to authenticated;
grant select, insert, update, delete on table delivery.module_sessions to service_role;

-- RLS (mesma doutrina do resto: quem pode o quê é decidido no banco).
drop policy if exists module_sessions_admin_all on delivery.module_sessions;
create policy module_sessions_admin_all on delivery.module_sessions
  for all using (public.is_admin_viewing_all());

-- Ler: a empresa vê o uso da própria empresa (métrica por usuário é dado do cliente).
drop policy if exists module_sessions_org_read on delivery.module_sessions;
create policy module_sessions_org_read on delivery.module_sessions
  for select using (organization_id = public.current_org_id());

-- Escrever: só a própria sessão, só na própria org. Ninguém carimba uso no nome de outro.
drop policy if exists module_sessions_own_insert on delivery.module_sessions;
create policy module_sessions_own_insert on delivery.module_sessions
  for insert with check (user_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists module_sessions_own_update on delivery.module_sessions;
create policy module_sessions_own_update on delivery.module_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
