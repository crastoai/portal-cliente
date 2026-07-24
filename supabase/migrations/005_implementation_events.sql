-- ============================================================================
-- 005 · HISTÓRICO DE IMPLANTAÇÃO — o quê / quando / QUEM implantou
--
-- Pedido do Crasto (2026-07-24): ao clicar no card "Implantação" do portal do cliente,
-- abrir um histórico do que foi de fato implantado, a DATA (dia/mês/ano/hora/min) e QUEM
-- implantou (Crasto/Jhon) — quem fez o quê. Hoje só temos o % de rollout (quanto), não o
-- registro de cada marco (o quê/quando/quem).
--
-- Regra do Crasto: só dado REAL. Esta tabela nasce vazia; o card só mostra o que a
-- Crasto.AI registrou — nada fictício. Sem evento registrado, o histórico aparece vazio.
-- ============================================================================
create table if not exists delivery.implementation_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- Instância/módulo a que o marco se refere (opcional). Se nulo, é um marco geral da
  -- implantação. ON DELETE SET NULL: apagar a instância não apaga o histórico do marco.
  client_module_id  uuid references delivery.client_modules(id) on delete set null,
  happened_at       timestamptz not null,        -- quando aconteceu (dia/mês/ano/hora/min)
  title             text not null,               -- o quê: "Agente publicado", "Templates aprovados"…
  detail            text,                         -- detalhes/observações do marco
  performed_by_name text,                         -- QUEM implantou (Crasto / Jhon) — texto livre
  created_by        uuid,                         -- quem registrou (admin da Crasto.AI)
  created_by_name   text,                         -- nome de quem registrou, para exibir
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists implementation_events_org_idx on delivery.implementation_events (organization_id, happened_at desc);

alter table delivery.implementation_events enable row level security;

-- GRANT antes da RLS (authenticated leva "permission denied" sem isto).
grant select on table delivery.implementation_events to authenticated;
grant select, insert, update, delete on table delivery.implementation_events to service_role;

-- Leitura: a EMPRESA vê os marcos da própria org (é a implantação DELA). Admin vê tudo.
drop policy if exists implementation_events_read on delivery.implementation_events;
create policy implementation_events_read on delivery.implementation_events
  for select using (organization_id = public.current_org_id() or public.is_crasto_admin());

-- Escrita: só a Crasto.AI (quem implanta e registra o marco) — via service_role no middle-end,
-- com o papel de admin validado no controller. O cliente nunca escreve aqui.
