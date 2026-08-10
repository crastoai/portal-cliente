-- ============================================================================
-- 041 · Permissionamento do Portal — 4 papéis (access_level) + ficha profissional
--       do colaborador + estrutura de WhatsApp por-usuário.
--
-- POR QUÊ: o Portal só tinha owner/member (enum public.app_role). O Crasto quer 4 níveis
-- FINOS (admin | supervisor | agente | visualizador) SEM tocar o enum — o papel de
-- plataforma (crasto_admin) e o de DONO (client_owner) continuam acima de tudo. Junto,
-- uma "ficha do colaborador" (cargo, salário, admissão…) para o modal "Editar
-- Colaborador". Tudo ADITIVO e reversível (aplicado em prod no deploy, BEGIN/COMMIT
-- pelo script de apply — este arquivo NÃO abre transação, igual às migrações anteriores).
--
-- DECISÕES (Crasto, 2026-08-09):
--  - access_level e os campos de WhatsApp (não sensíveis) ficam em public.profiles.
--  - Os campos de RH (inclui SALÁRIO) vão para uma tabela dedicada public.team_members
--    com RLS deny-default: o salário do colega NÃO pode vazar pelo SELECT same-org do
--    profiles (RLS é ROW-level, não esconde coluna). Escrita só dono/admin (pela API:
--    service_role + guarda no código), leitura só a própria pessoa (+ dono/admin via API).
--  - NÃO mexe no enum public.app_role (owner/member/crasto_admin seguem sendo a fronteira
--    de segurança); o nível fino vive em access_level, que é DEFAULT de telas, não trava.
-- ============================================================================

-- 1) profiles: nível fino de acesso + estrutura de WhatsApp + suspender (aditivo) -----------
alter table public.profiles add column if not exists access_level   text;
alter table public.profiles add column if not exists wa_sender_name text;
alter table public.profiles add column if not exists wa_number      text;
-- active=false = colaborador SUSPENSO (perde o acesso ao Portal no boot) SEM ser excluído —
-- respeita "nunca hard-delete". O dono/admin liga/desliga; o boot (/identity/me) é a trava.
alter table public.profiles add column if not exists active         boolean not null default true;

-- access_level: null = sem nível fino — é o caso de owner/crasto_admin (estão acima dos 4).
alter table public.profiles drop constraint if exists profiles_access_level_chk;
alter table public.profiles add  constraint profiles_access_level_chk
  check (access_level is null or access_level in ('admin', 'supervisor', 'agente', 'visualizador'));

comment on column public.profiles.access_level   is 'Nível fino do colaborador (admin|supervisor|agente|visualizador). null = owner/crasto_admin (acima dos níveis). O enum role continua sendo a fronteira de segurança; access_level define o DEFAULT de telas.';
comment on column public.profiles.wa_sender_name is 'Nome exibido quando a agente falar em nome desta pessoa no WhatsApp. Só ESTRUTURA por enquanto (o envio liga depois).';
comment on column public.profiles.wa_number      is 'Número de WhatsApp do colaborador. Só ESTRUTURA (cadastro) — a automação de aviso liga depois.';

-- 2) team_members: ficha profissional/RH do colaborador (1 linha por pessoa) -----------------
-- Tabela dedicada por PRIVACIDADE: guarda SALÁRIO. RLS deny-default; o dono/admin escrevem
-- pela API (service_role + guarda gerenciaModulos), e a própria pessoa lê só a SUA ficha —
-- colega nenhum lê a do outro. Mesmo padrão de delivery.user_module_access.
create table if not exists public.team_members (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cpf_cnpj        text,           -- documento (PII) — aba "Dados & Acesso"
  telefone        text,           -- contato — aba "Dados & Acesso" (≠ wa_number)
  cargo           text,
  departamento    text,
  salario         numeric(14, 2),
  data_admissao   date,
  tipo_contrato   text,           -- ex.: 'clt' | 'pj' | 'estagio' | 'temporario' | ...
  cnpj_vinculado  text,
  observacoes     text,           -- notas internas do dono/admin (NÃO visíveis à própria pessoa)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_team_members_org on public.team_members (organization_id);

drop trigger if exists trg_team_members_updated on public.team_members;
create trigger trg_team_members_updated before update on public.team_members
  for each row execute function public.set_updated_at();

-- DENY-DEFAULT: RLS habilitada e SEM policy p/ authenticated → nenhum colega (nem a própria
-- pessoa) lê esta tabela direto. Só o dono/admin, pela API (service_role, que ignora RLS por
-- ser ENABLE e não FORCE) + guarda no código (gerenciaModulos). Protege salário/CPF/observações.
-- Mesma postura de delivery.user_module_access, porém SEM self-read (aqui há dado sensível).
alter table public.team_members enable row level security;
grant select, insert, update, delete on table public.team_members to service_role;
