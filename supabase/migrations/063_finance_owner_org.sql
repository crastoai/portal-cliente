-- ============================================================================
-- 063 · FINANCEIRO MULTITENANT — Fase 1: fundação de dados (owner_org_id)
--
-- POR QUÊ: hoje toda RPC financeira trava em is_crasto_admin() (single-tenant).
-- Para virar módulo vendável, o dado precisa de um DONO por organização. Esta
-- migration é ADITIVA e REVERSÍVEL — só adiciona a coluna, faz backfill para a
-- org da Crasto.AI (todos os livros existentes são dela) e cria o helper de
-- entitlement (DORMENTE — nada o chama ainda). NENHUMA RPC muda aqui; a UI não
-- muda; nenhum comportamento de acesso muda. As Fases 2+ ligam o escopo.
--
-- ⚠️ owner_org_id (DONO / tenant) ≠ accounts.organization_id (CONTRAPARTE / cliente
--    faturado, que alimenta my_faturas). São dimensões diferentes — não confundir.
--
-- Org Crasto.AI = 8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd (verificado 2026-09-04).
-- Aplicada em prod via Management API em 2026-09-04.
-- ============================================================================
begin;

-- 1) coluna dona (nullable por ora; NOT NULL só na Fase 7, após provar backfill)
alter table finance.accounts          add column if not exists owner_org_id uuid;
alter table finance.operational_costs add column if not exists owner_org_id uuid;
alter table finance.transactions      add column if not exists owner_org_id uuid;
alter table finance.documents         add column if not exists owner_org_id uuid;

-- 2) backfill — todos os registros existentes são livros da Crasto.AI
update finance.accounts          set owner_org_id = '8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd' where owner_org_id is null;
update finance.operational_costs set owner_org_id = '8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd' where owner_org_id is null;
update finance.transactions      set owner_org_id = '8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd' where owner_org_id is null;
update finance.documents         set owner_org_id = '8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd' where owner_org_id is null;

-- 3) índices (a RLS vai filtrar por esta coluna em toda leitura)
create index if not exists idx_fin_accounts_owner on finance.accounts(owner_org_id);
create index if not exists idx_fin_costs_owner     on finance.operational_costs(owner_org_id);
create index if not exists idx_fin_tx_owner        on finance.transactions(owner_org_id);
create index if not exists idx_fin_docs_owner      on finance.documents(owner_org_id);

-- 4) documentar a distinção dono × contraparte na coluna que já existia
comment on column finance.accounts.organization_id is
  'CONTRAPARTE: cliente faturado (alimenta public.my_faturas). NAO e o dono dos livros — o dono e owner_org_id.';
comment on column finance.accounts.owner_org_id is
  'DONO (tenant) dos livros. Ancora de RLS multitenant. Backfill 2026-09-04 = org Crasto.AI.';

-- 5) helper de entitlement — DORMENTE (nenhuma RPC/guard o chama até a Fase 3)
--    Crasto (admin) sempre passa (dogfooding/operador); cliente passa se tiver o
--    modulo Financeiro ATIVO em delivery.client_modules.
create or replace function public.has_finance_module()
returns boolean
language sql stable security definer
set search_path to 'public','delivery','catalog'
as $fn$
  select public.is_crasto_admin()
      or exists (
        select 1
          from delivery.client_modules cm
          join catalog.vdi_modules v on v.id = cm.vdi_module_id
         where cm.organization_id = public.current_org_id()
           and cm.status = 'active'
           and (v.name ~* 'financ' or v.category = 'Financeiro')
      );
$fn$;
grant execute on function public.has_finance_module() to authenticated, service_role;

-- 6) ASSERT — aborta (rollback) se sobrou qualquer owner nulo
do $$
declare n int;
begin
  select (select count(*) from finance.accounts          where owner_org_id is null)
       + (select count(*) from finance.operational_costs where owner_org_id is null)
       + (select count(*) from finance.transactions      where owner_org_id is null)
       + (select count(*) from finance.documents         where owner_org_id is null)
    into n;
  if n <> 0 then raise exception 'ABORT 063: % linha(s) com owner_org_id nulo apos backfill', n; end if;
end $$;

commit;
