-- 012 · Módulo "Social Media" (Mega Automação de Redes Sociais 2.0) — entitlement + embed SSO
-- ---------------------------------------------------------------------------------------------
-- Espelha exatamente o padrão do WhatsApp CRM (`crm_solution`): uma FLAG no catálogo identifica
-- a solução própria da Crasto, o admin libera pelo mesmo toggle de sempre (delivery.client_modules)
-- e o cliente abre EMBARCADO no Portal com login automático (JWT do Portal via #token).
-- O social-api já consome isto (PortalService.orgHasSocial → RPC public.org_has_social).

-- 1) Flag no catálogo (mesma semântica de crm_solution: "é solução própria embarcada por SSO").
alter table catalog.vdi_modules
  add column if not exists social_solution boolean not null default false;

-- 2) Marca a linha do catálogo e aponta a URL de embed (mesma p/ todos — o tenant vem do JWT).
--    external_url é client-facing (o cliente embarca este endereço); social.crasto.ai é domínio nosso.
update catalog.vdi_modules
   set social_solution = true,
       external_url     = 'https://social.crasto.ai'
 where id = 'c7c38088-6699-4c11-b0cc-1e8ff6f83886';

-- 3) RPC autoritativa de entitlement — a org tem um client_module ATIVO cujo módulo é social?
--    SECURITY DEFINER: o social-api chama com o service key; a checagem roda no banco, não no JS.
create or replace function public.org_has_social(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, catalog, delivery
as $$
  select exists (
    select 1
      from delivery.client_modules cm
      join catalog.vdi_modules m on m.id = cm.vdi_module_id
     where cm.organization_id = p_org
       and cm.status = 'active'
       and m.social_solution = true
  );
$$;

comment on function public.org_has_social(uuid) is
  'Entitlement do módulo Social Media: org tem client_module ativo com vdi_modules.social_solution=true. Usado pelo social-api (service key).';

-- Só o papel de serviço executa (o cliente nunca chama isto direto; vem do social-api).
revoke all on function public.org_has_social(uuid) from public;
grant execute on function public.org_has_social(uuid) to service_role;
