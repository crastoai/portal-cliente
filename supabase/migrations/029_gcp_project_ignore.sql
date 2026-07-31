-- ============================================================================
-- 029 · Flag "ignorar" no mapa GCP + drop-in do RPC de listagem
--
-- Contexto: a chave global antiga do AI Studio (projeto "Agentes de IA" ·
-- gen-lang-client-0091508506) era compartilhada entre todos os agentes. O custo dela
-- não pode ser separado por cliente. Agora que cada cliente tem sua chave dedicada,
-- essa chave antiga foi desativada — mas o projeto continua vindo no BigQuery Billing
-- Export por mais alguns dias/mês. Marcamos como "ignore=true" para o sync pular
-- (não vira lançamento em finance.ai_usage).
-- ============================================================================
alter table automation.gcp_project_map
  add column if not exists ignore boolean not null default false;

-- Reescreve o RPC pra devolver a flag também (frontend usa pra mostrar/esconder).
-- DROP antes: mudou a signature de retorno, replace não basta no Postgres.
drop function if exists public.admin_gcp_project_map();
create or replace function public.admin_gcp_project_map()
returns table (project_id text, organization_id uuid, organization_name text, project_name text, note text, ignore boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, automation
as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return query
    select m.project_id, m.organization_id, o.name as organization_name, m.project_name, m.note, m.ignore, m.updated_at
      from automation.gcp_project_map m
      left join public.organizations o on o.id = m.organization_id
     order by m.ignore, o.name nulls last, m.project_id;
end $$;

-- Upsert aceita o campo ignore (opcional). Sem ele, mantém o valor atual.
create or replace function public.admin_gcp_project_map_upsert(p jsonb)
returns void
language plpgsql security definer set search_path = public, automation
as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'project_id','') = '' then raise exception 'project_id obrigatório'; end if;
  insert into automation.gcp_project_map(project_id, organization_id, project_name, note, ignore)
    values (p->>'project_id', nullif(p->>'organization_id','')::uuid, nullif(p->>'project_name',''), nullif(p->>'note',''), coalesce((p->>'ignore')::boolean, false))
    on conflict (project_id) do update
      set organization_id = case when p ? 'organization_id' then nullif(p->>'organization_id','')::uuid else automation.gcp_project_map.organization_id end,
          project_name    = case when p ? 'project_name'    then nullif(p->>'project_name','')    else automation.gcp_project_map.project_name end,
          note            = case when p ? 'note'            then nullif(p->>'note','')            else automation.gcp_project_map.note end,
          ignore          = case when p ? 'ignore'          then coalesce((p->>'ignore')::boolean, false) else automation.gcp_project_map.ignore end,
          updated_at      = now();
end $$;
