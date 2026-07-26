-- 022 · Central de notificações (agregada): responsável no ticket + "visto" por usuário
-- assigned_to: quem está atuando na demanda — 'agente_ia' (Jorge), 'john' ou 'crasto' (ou null).
-- notifications_seen_at: marca quando o usuário abriu o sino (pra apagar o vermelho).
alter table support.tickets add column if not exists assigned_to text;
alter table support.tickets drop constraint if exists tickets_assigned_to_check;
alter table support.tickets
  add constraint tickets_assigned_to_check
  check (assigned_to is null or assigned_to = any (array['agente_ia'::text, 'john'::text, 'crasto'::text]));

alter table public.profiles add column if not exists notifications_seen_at timestamp with time zone;

comment on column support.tickets.assigned_to is 'Responsável pela demanda: agente_ia (Jorge), john, crasto. Aparece na notificação (quem está atuando).';
