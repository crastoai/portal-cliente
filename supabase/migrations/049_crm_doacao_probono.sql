-- 049 · CRM — Doação / pró-bono (impacto social)
-- Permite registrar um "Ganho" que é DOAÇÃO: serviço entregue a uma instituição de caridade
-- com LUCRO/RECEITA = R$0, mas com um VALOR-EQUIVALENTE doado (somado do Catálogo de serviços,
-- editável). Serve p/ o relatório anual de impacto social (quanto a Crasto.AI doou, por instituição)
-- e como base de conversa fiscal com o contador (NÃO calcula dedução — ver nota).
--
-- Decisões do Crasto (2026-08-27): valor vem do catálogo (editável); doação é um SELO no Ganho
-- (não um 6º estágio); doação NÃO conta como receita/MRR (fica fora do BI de faturamento).
--
-- Tudo ADITIVO/REVERSÍVEL (IF NOT EXISTS; create or replace). Nada destrutivo.

-- ─────────────────────────── 1) Colunas em organizations ───────────────────────────
alter table public.organizations
  add column if not exists is_donation    boolean not null default false,  -- Ganho pró-bono (doação)
  add column if not exists donation_value numeric(14,2),                    -- valor-equivalente doado (R$)
  add column if not exists donation_note  text,                            -- descrição do que foi doado / obs.
  add column if not exists donated_at     timestamptz;                     -- quando a doação foi registrada

comment on column public.organizations.is_donation    is 'CRM: este Ganho é uma DOAÇÃO/pró-bono (lucro=R$0). Excluir do BI de receita/MRR.';
comment on column public.organizations.donation_value is 'CRM: valor-equivalente do serviço doado (R$), somado do Catálogo (editável).';
comment on column public.organizations.donation_note  is 'CRM: descrição do serviço doado / observação (ex.: site + funil de arrecadação).';
comment on column public.organizations.donated_at     is 'CRM: data/hora do registro da doação (base do relatório anual de impacto).';

-- ─────────────────── 2) admin_clients() — expõe os campos de doação na lista ───────────────────
-- Corpo IDÊNTICO à 017 + (o.is_donation, o.donation_value, o.donated_at) no SELECT.
create or replace function public.admin_clients() returns json
    language plpgsql stable security definer
    set search_path to 'public', 'delivery', 'catalog', 'finance', 'commerce', 'auth', 'crm'
    as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t order by t.mrr desc, t.name), '[]'::json) from (
    select o.id, o.name, o.plan, o.stage, o.country, o.tax_id, o.website, o.founded_on, o.owner_name,
      o.source, o.last_maturity, o.intent_signal, o.created_at,
      o.lead_temperature, o.deal_value, o.deal_probability, o.deal_expected_close, o.deal_product,
      o.papeis, o.tipo_empresa, o.emite_nf, o.cliente_oculto, o.convertido_em, o.churned_em,
      o.trial_inicio, o.trial_fim, o.trial_resultado, o.status as org_status,
      o.is_donation, o.donation_value, o.donated_at,
      (select p.email from public.profiles p where p.organization_id = o.id order by (p.role = 'client_owner') desc limit 1) as email,
      (select ph.country_code || ' ' || ph.number from crm.phones ph where ph.organization_id = o.id order by ph.is_primary desc, ph.created_at limit 1) as phone,
      coalesce((select array_agg(v.name) from delivery.client_modules cm join catalog.vdi_modules v on v.id = cm.vdi_module_id where cm.organization_id = o.id), '{}') as modules,
      (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id where p.organization_id = o.id) as last_access,
      coalesce((select overall_progress from delivery.implementations i where i.organization_id = o.id), 0) as progress,
      (select status from delivery.system_health h where h.organization_id = o.id) as health,
      -- Receita/MRR: doação NÃO conta como receita (some do BI de faturamento).
      coalesce((select sum(pr.subtotal) from commerce.proposals pr where pr.organization_id = o.id and pr.status = 'accepted'), 0)
        * (case when o.is_donation then 0 else 1 end) as mrr,
      (select max(a.occurred_at) from crm.activities a where a.organization_id = o.id) as last_activity,
      (select max(ms.created_at) from crm.mapa_submissions ms where ms.organization_id = o.id) as last_diagnostic_at,
      public.org_health(o.id) as health_v2
    from public.organizations o
  ) t);
end $$;
