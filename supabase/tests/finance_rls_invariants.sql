-- ============================================================================
-- TESTE DE INVARIANTES — isolamento multitenant do módulo Financeiro (Fase 7).
--
-- Guard de REGRESSÃO, sem fixtures: falha (RAISE) se alguém enfraquecer o
-- isolamento no futuro. Rode em CI (psql ou Management API) contra o banco do
-- Portal. Sucesso = retorna a linha ('OK', ...); qualquer violação aborta.
--
-- Cobre: (1) RLS ligada em toda finance.*; (2) nenhum grant direto a
-- authenticated/anon em finance.*; (3) os 4 reads do módulo escopam por
-- fin_scope_org() e NÃO usam is_crasto_admin(); (4) owner_org_id NOT NULL nas 4
-- tabelas; (5) Núcleo (custo de IA / gcp-map) segue admin-only.
-- ============================================================================
do $$
declare v int; r record;
begin
  -- (1) RLS ligada em todas as tabelas do schema finance
  select count(*) into v from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='finance' and c.relkind='r' and c.relrowsecurity=false;
  if v <> 0 then raise exception 'INVARIANTE 1: % tabela(s) finance.* SEM RLS', v; end if;

  -- (2) nenhum privilégio direto a roles de cliente nas tabelas finance.*
  select count(*) into v from information_schema.role_table_grants
    where table_schema='finance' and grantee in ('authenticated','anon');
  if v <> 0 then raise exception 'INVARIANTE 2: % grant(s) direto(s) a authenticated/anon em finance.*', v; end if;

  -- (3) reads do módulo escopam por fin_scope_org() e não dependem de is_crasto_admin()
  for r in
    select p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('fin_accounts','fin_costs','fin_transactions','fin_documents')
  loop
    if r.def !~ 'fin_scope_org' then raise exception 'INVARIANTE 3: % NAO escopa por fin_scope_org()', r.proname; end if;
    if r.def ~ 'is_crasto_admin' then raise exception 'INVARIANTE 3: % ainda usa is_crasto_admin() (modo-deus)', r.proname; end if;
  end loop;

  -- (4) owner_org_id NOT NULL nas 4 tabelas do módulo
  select count(*) into v from information_schema.columns
    where table_schema='finance' and column_name='owner_org_id'
      and table_name in ('accounts','operational_costs','transactions','documents') and is_nullable='YES';
  if v <> 0 then raise exception 'INVARIANTE 4: % tabela(s) com owner_org_id NULLABLE', v; end if;

  -- (5) Núcleo Crasto segue admin-only
  for r in
    select p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('admin_ai_cost','admin_gcp_project_map')
  loop
    if r.def !~ 'is_crasto_admin' then raise exception 'INVARIANTE 5: Nucleo % nao e mais admin-only', r.proname; end if;
  end loop;
end $$;

select 'OK' as resultado, now() as verificado_em;
