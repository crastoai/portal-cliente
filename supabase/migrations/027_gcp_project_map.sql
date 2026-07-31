-- ============================================================================
-- 027 · MAPA de projetos GCP → cliente (organizations)
--
-- Contexto (2026-07-31): agora cada cliente tem 1 projeto GCP separado no AI Studio (chave própria).
-- O BigQuery Billing Export traz o project.id em cada linha, mas não sabe QUEM é o cliente.
-- Este mapa faz a ponte: (project_id GCP) → (organization_id do Portal). O sync de custo lê o mapa
-- e grava o custo do Gemini POR CLIENTE (kind='cliente', organization_id preenchido) — antes ficava
-- tudo agregado como "Interno / plataforma".
--
-- project_id não muda depois de criado no GCP → serve como chave primária natural.
-- ============================================================================
create table if not exists automation.gcp_project_map (
  project_id      text primary key,               -- ex.: 'gen-lang-client-0916045718'
  organization_id uuid references public.organizations(id) on delete set null,
  project_name    text,                            -- ex.: 'SR BRASIL CORRETORA E SEGUROS' (memória p/ operador)
  note            text,                            -- ex.: nome do agente / observação
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RPC pra listar (admin-only). Devolve TAMBÉM projetos DETECTADOS no BigQuery mas ainda NÃO mapeados,
-- pra facilitar o cadastro (fica visível na UI: "há X projetos sem cliente atribuído").
create or replace function public.admin_gcp_project_map()
returns table (project_id text, organization_id uuid, organization_name text, project_name text, note text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, automation
as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return query
    select m.project_id, m.organization_id, o.name as organization_name, m.project_name, m.note, m.updated_at
      from automation.gcp_project_map m
      left join public.organizations o on o.id = m.organization_id
     order by o.name nulls last, m.project_id;
end $$;

grant execute on function public.admin_gcp_project_map() to authenticated;

-- Upsert (admin-only) via JSON p/ manter padrão dos outros endpoints do painel.
create or replace function public.admin_gcp_project_map_upsert(p jsonb)
returns void
language plpgsql security definer set search_path = public, automation
as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'project_id','') = '' then raise exception 'project_id obrigatório'; end if;
  insert into automation.gcp_project_map(project_id, organization_id, project_name, note)
    values (p->>'project_id', nullif(p->>'organization_id','')::uuid, nullif(p->>'project_name',''), nullif(p->>'note',''))
    on conflict (project_id) do update
      set organization_id = case when p ? 'organization_id' then nullif(p->>'organization_id','')::uuid else automation.gcp_project_map.organization_id end,
          project_name    = case when p ? 'project_name'    then nullif(p->>'project_name','')    else automation.gcp_project_map.project_name end,
          note            = case when p ? 'note'            then nullif(p->>'note','')            else automation.gcp_project_map.note end,
          updated_at      = now();
end $$;

grant execute on function public.admin_gcp_project_map_upsert(jsonb) to authenticated;

-- Remover mapeamento (não some do BigQuery — só desliga a atribuição no Portal).
create or replace function public.admin_gcp_project_map_delete(p_project_id text)
returns void
language plpgsql security definer set search_path = public, automation
as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from automation.gcp_project_map where project_id = p_project_id;
end $$;

grant execute on function public.admin_gcp_project_map_delete(text) to authenticated;
