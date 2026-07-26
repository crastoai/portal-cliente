-- 013 · CRM /admin/clientes v1 — funil renomeado + campos de Oportunidade + temperatura manual do Lead
-- --------------------------------------------------------------------------------------------------
-- Decisões (Crasto, 2026-07-26):
--  • Renomear o 3º estágio: chave `qualificado` -> `oportunidade` (a UI já exibia "Oportunidade").
--    Também consolida o legado `contato` -> `prospecto` (a 065 do plano antigo nunca foi aplicada;
--    aqui fechamos o funil em 4 estágios limpos).
--  • Oportunidade passa a carregar os números do funil (raiz do BI de vendas): valor, probabilidade,
--    data prevista de fechamento e produto/serviço.
--  • Temperatura MANUAL do Lead (quente/morno/frio), INDEPENDENTE do `intent_signal` (automático do Mapa).
-- Tudo ADITIVO/reversível; nenhuma linha é apagada — o rename apenas relabela valores existentes.

-- 1) Rename do estágio (dados primeiro, depois a CHECK) -------------------------------------------
alter table public.organizations drop constraint if exists organizations_stage_check;

update public.organizations set stage = 'oportunidade' where stage = 'qualificado';
update public.organizations set stage = 'prospecto'    where stage = 'contato';

-- default continua 'prospecto'; nova CHECK com o funil limpo de 4 estágios.
alter table public.organizations
  add constraint organizations_stage_check
  check (stage = any (array['prospecto'::text, 'lead'::text, 'oportunidade'::text, 'cliente'::text]));

-- 2) Campos da Oportunidade (todos nullable; só fazem sentido a partir do estágio oportunidade) ----
alter table public.organizations
  add column if not exists deal_value          numeric(14,2),
  add column if not exists deal_probability    smallint,
  add column if not exists deal_expected_close date,
  add column if not exists deal_product        text;

alter table public.organizations drop constraint if exists organizations_deal_probability_check;
alter table public.organizations
  add constraint organizations_deal_probability_check
  check (deal_probability is null or (deal_probability >= 0 and deal_probability <= 100));

-- 3) Temperatura MANUAL do Lead (não confundir com intent_signal, que é automático do Mapa) --------
alter table public.organizations
  add column if not exists lead_temperature text;

alter table public.organizations drop constraint if exists organizations_lead_temperature_check;
alter table public.organizations
  add constraint organizations_lead_temperature_check
  check (lead_temperature is null or lead_temperature = any (array['quente'::text, 'morno'::text, 'frio'::text]));

comment on column public.organizations.deal_value          is 'Oportunidade: valor da proposta (R$).';
comment on column public.organizations.deal_probability    is 'Oportunidade: probabilidade de fechamento (0–100%).';
comment on column public.organizations.deal_expected_close is 'Oportunidade: data prevista de fechamento.';
comment on column public.organizations.deal_product        is 'Oportunidade: produto/serviço em negociação.';
comment on column public.organizations.lead_temperature    is 'Lead: temperatura MANUAL (quente/morno/frio). Independente de intent_signal (automático do Mapa).';

-- 4) admin_clients() devolve os campos novos (para badge/filtro de temperatura e BI da lista) -------
--    Corpo idêntico ao baseline + as 5 colunas novas no SELECT (lead_temperature + os 4 deal_*).
create or replace function public.admin_clients() returns json
    language plpgsql stable security definer
    set search_path to 'public', 'delivery', 'catalog', 'finance', 'commerce', 'auth', 'crm'
    as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t order by t.mrr desc, t.name), '[]'::json) from (
    select o.id, o.name, o.plan, o.stage, o.country, o.tax_id, o.website, o.founded_on, o.owner_name,
      o.source, o.last_maturity, o.intent_signal,
      o.lead_temperature, o.deal_value, o.deal_probability, o.deal_expected_close, o.deal_product,
      (select p.email from public.profiles p where p.organization_id = o.id order by (p.role = 'client_owner') desc limit 1) as email,
      coalesce((select array_agg(v.name) from delivery.client_modules cm join catalog.vdi_modules v on v.id = cm.vdi_module_id where cm.organization_id = o.id), '{}') as modules,
      (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id where p.organization_id = o.id) as last_access,
      coalesce((select overall_progress from delivery.implementations i where i.organization_id = o.id), 0) as progress,
      (select status from delivery.system_health h where h.organization_id = o.id) as health,
      coalesce((select sum(pr.subtotal) from commerce.proposals pr where pr.organization_id = o.id and pr.status = 'accepted'), 0) as mrr,
      (select max(a.occurred_at) from crm.activities a where a.organization_id = o.id) as last_activity,
      (select max(ms.created_at) from crm.mapa_submissions ms where ms.organization_id = o.id) as last_diagnostic_at,
      public.org_health(o.id) as health_v2
    from public.organizations o
  ) t);
end $$;

-- ROLLBACK (referência): as colunas novas podem ser removidas (drop column) e a CHECK de stage
-- revertida para incluir 'contato'/'qualificado'. O rename de dados é reversível
-- (update stage='qualificado' where stage='oportunidade'), mas 'contato'->'prospecto' não é
-- distinguível depois; se precisar preservar 'contato', não rode a 2ª linha do passo 1.
