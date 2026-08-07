-- ============================================================================
-- 040 · delivery.lead_potencial — POTENCIAL de venda do lead classificado pela IA (DeepSeek).
--
-- O farol do drill de Leads dependia de conversations.interest (quase sempre vazio) → aparecia
-- "indefinido". Aqui a IA lê a conversa e classifica: quente / morno / frio (+ motivo curto).
-- Cache por source_hash (sha1 da transcrição) → não re-gasta token se a conversa não mudou.
-- Preenchido por lote (job diário + ao abrir o modal). lead_id = id do contato (whatsapp.contacts).
-- Espelha delivery.lead_summary (039): admin vê tudo; cliente lê só a própria org; escrita service_role.
-- ============================================================================
create table if not exists delivery.lead_potencial (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  lead_id          uuid not null,
  potencial        text check (potencial in ('quente', 'morno', 'frio')),
  motivo           text,
  source_hash      text,
  model            text,
  is_current       boolean not null default true,
  generated_at     timestamptz not null default now()
);
create index if not exists lead_potencial_cur_idx on delivery.lead_potencial (organization_id, lead_id) where is_current;

alter table delivery.lead_potencial enable row level security;

grant select on table delivery.lead_potencial to authenticated;
grant select, insert, update, delete on table delivery.lead_potencial to service_role;

drop policy if exists lead_potencial_admin_all on delivery.lead_potencial;
create policy lead_potencial_admin_all on delivery.lead_potencial
  for all using (public.is_admin_viewing_all());

drop policy if exists lead_potencial_client_read on delivery.lead_potencial;
create policy lead_potencial_client_read on delivery.lead_potencial
  for select using (organization_id = public.current_org_id());
