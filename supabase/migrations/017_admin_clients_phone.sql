-- 017 · admin_clients() devolve o telefone primário (com DDI) p/ a coluna Telefone da lista Empresas
-- Aditivo: subquery do telefone principal em crm.phones. Nada destrutivo.
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
      (select p.email from public.profiles p where p.organization_id = o.id order by (p.role = 'client_owner') desc limit 1) as email,
      (select ph.country_code || ' ' || ph.number from crm.phones ph where ph.organization_id = o.id order by ph.is_primary desc, ph.created_at limit 1) as phone,
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
