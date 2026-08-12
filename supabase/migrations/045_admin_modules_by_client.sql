-- 045 · admin_modules_by_client() — módulos por cliente (nome + status) p/ o card "Módulos entregues"
-- Aditivo e NÃO-destrutivo: nova função de leitura admin-wide, no mesmo padrão de admin_clients()
-- (SECURITY DEFINER + guard is_crasto_admin). NÃO altera tabelas nem funções existentes.
--
-- Alimenta:
--   • card "Módulos entregues" da Visão geral (entregues = rollout_status='delivered'; contratados = total)
--   • painel "Módulos por cliente" (agrupado por empresa, cada módulo com nome + status)
-- Contagens usam JOIN com catalog.vdi_modules (mesma base do array de admin_clients) → "contratados"
-- bate com o número exibido hoje (10). Retorna TODAS as organizações (mesmo divisor do card = 6).

create or replace function public.admin_modules_by_client() returns json
    language plpgsql stable security definer
    set search_path to 'public', 'delivery', 'catalog'
    as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (
    select coalesce(json_agg(t order by t.contratados desc, t.entregues desc, t.org_name), '[]'::json)
    from (
      select
        o.id   as org_id,
        o.name as org_name,
        o.stage,
        (select count(*)
           from delivery.client_modules cm
           join catalog.vdi_modules v on v.id = cm.vdi_module_id
          where cm.organization_id = o.id) as contratados,
        (select count(*)
           from delivery.client_modules cm
           join catalog.vdi_modules v on v.id = cm.vdi_module_id
          where cm.organization_id = o.id
            and cm.rollout_status = 'delivered') as entregues,
        coalesce((
          select json_agg(json_build_object(
                   'name',           coalesce(nullif(cm.label, ''), v.name),
                   'catalog_name',   v.name,
                   'category',       v.category,
                   'status',         cm.status,
                   'rollout_status', cm.rollout_status,
                   'progress',       cm.rollout_progress
                 ) order by coalesce(nullif(cm.label, ''), v.name))
          from delivery.client_modules cm
          join catalog.vdi_modules v on v.id = cm.vdi_module_id
          where cm.organization_id = o.id
        ), '[]'::json) as modules
      from public.organizations o
    ) t
  );
end $$;

grant execute on function public.admin_modules_by_client() to authenticated, service_role;
