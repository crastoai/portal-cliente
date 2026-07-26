-- 019 · CHECK de stage — "contract" do expand-contract (retira legados qualificado/contato)
-- Seguro agora: o front novo (no ar) só manda 'oportunidade'. Primeiro normaliza qualquer linha
-- legada, depois aperta a CHECK para os 4 estágios oficiais. Aditivo em espírito (só relabela + aperta).
update public.organizations set stage = 'oportunidade' where stage = 'qualificado';
update public.organizations set stage = 'prospecto'    where stage = 'contato';

alter table public.organizations drop constraint if exists organizations_stage_check;
alter table public.organizations
  add constraint organizations_stage_check
  check (stage = any (array['prospecto'::text, 'lead'::text, 'oportunidade'::text, 'cliente'::text]));
