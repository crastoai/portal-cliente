-- ============================================================================
-- 004 · BASE DE CONHECIMENTO DO CLIENTE — reuniões & minutas
--
-- Pedido do Crasto (2026-07-24): um lugar para guardar a transcrição/minuta de cada reunião
-- com o cliente, evidenciando o que aconteceu naquele dia (data, quem participou, o que foi
-- falado, quem registrou). Vira a "base de conhecimento daquele cliente" e alimenta o
-- detalhamento do sistema (o que foi combinado, contratado, decidido).
--
-- Regra do Crasto: só dado REAL. Esta tabela nasce vazia; o que aparecer para o cliente é
-- exatamente o que a Crasto.AI registrou — nada fictício.
-- ============================================================================
create table if not exists delivery.client_meetings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  meeting_at       timestamptz not null,       -- data e hora da reunião (dia/mês/ano/hora/min)
  title            text not null,              -- ex.: "Kickoff", "Alinhamento de escopo"
  attendees        text,                       -- quem participou (texto livre)
  summary          text,                       -- resumo/pauta (o que ficou decidido)
  transcript       text,                       -- transcrição/minuta completa
  created_by       uuid,                       -- quem registrou (admin da Crasto.AI)
  created_by_name  text,                       -- nome de quem registrou, para exibir (Crasto/Jhon)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists client_meetings_org_idx on delivery.client_meetings (organization_id, meeting_at desc);

alter table delivery.client_meetings enable row level security;

-- GRANT antes da RLS (o papel authenticated leva "permission denied" sem isto).
grant select on table delivery.client_meetings to authenticated;
grant select, insert, update, delete on table delivery.client_meetings to service_role;

-- Leitura: a EMPRESA vê as reuniões da própria org (é a base de conhecimento dela). Admin vê tudo.
drop policy if exists client_meetings_read on delivery.client_meetings;
create policy client_meetings_read on delivery.client_meetings
  for select using (organization_id = public.current_org_id() or public.is_crasto_admin());

-- Escrita: só a Crasto.AI (quem faz a reunião e registra a minuta) — via service_role no
-- middle-end, com o papel de admin validado no controller. O cliente nunca escreve aqui.
