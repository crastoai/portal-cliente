-- ============================================================================
-- 039 · delivery.lead_summary — cache do RESUMO de conversa de um LEAD (Cockpit → drill Leads).
--
-- Gerado sob demanda pelo botão "Gerar resumo" (Psiquê/DeepSeek). Append-only + is_current +
-- source_hash (sha1 da transcrição) → NÃO regenera/gasta token se a conversa não mudou; o botão
-- "Regenerar" (force) ignora o cache. lead_id = id do contato (whatsapp.contacts, no wacrm).
-- Espelha delivery.cockpit_narrative (033): admin vê tudo; cliente lê só a própria org; escrita
-- só service_role (o serviço grava via asService). Idempotente. Aplicar pela session pooler 5432.
-- ============================================================================
create table if not exists delivery.lead_summary (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id         uuid not null,
  summary         text,
  source_hash     text,
  model           text,
  tokens_in       int,
  tokens_out      int,
  is_current      boolean not null default true,
  generated_at    timestamptz not null default now()
);
create index if not exists lead_summary_cur_idx on delivery.lead_summary (organization_id, lead_id) where is_current;

alter table delivery.lead_summary enable row level security;

grant select on table delivery.lead_summary to authenticated;
grant select, insert, update, delete on table delivery.lead_summary to service_role;

drop policy if exists lead_summary_admin_all on delivery.lead_summary;
create policy lead_summary_admin_all on delivery.lead_summary
  for all using (public.is_admin_viewing_all());

drop policy if exists lead_summary_client_read on delivery.lead_summary;
create policy lead_summary_client_read on delivery.lead_summary
  for select using (organization_id = public.current_org_id());
