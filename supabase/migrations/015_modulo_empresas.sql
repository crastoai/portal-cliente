-- 015 · Módulo "Empresas" — cadastro, trial/churn, papéis, DISC e referral interno
-- =================================================================================
-- Redesenho de /admin/clientes → "Empresas". TUDO aditivo/reversível (IF NOT EXISTS, nada de DROP).
-- Reuso máximo do schema atual:
--   • crm.company_cnpjs já tem zip_code(CEP), inscricao_estadual, city, state, country, trade_name(fantasia),
--     legal_name, is_headquarters(matriz) → NADA novo em filiais.
--   • crm.phones já tem country_code(DDI), label(categoria whatsapp/ligação), person_id → NADA novo estrutural.
--   • crm.people já tem role(cargo), is_primary(principal/secundário), notes(descrição), email.
--   • public.organizations já tem name(fantasia), legal_name(razão), status(ativo/inativo), emails[]/phones[]/websites[],
--     campos fiscais, stage, e (013) lead_temperature/deal_*.
--   • public.org_health / system_health = farol (verde/amarelo/vermelho). public.connectors = agente indicador.

-- 1) public.organizations — campos operacionais do cadastro/funil -----------------------------
alter table public.organizations
  add column if not exists tipo_empresa    text,        -- natureza jurídica: MEI/ME/EPP/LTDA/SA...
  add column if not exists emite_nf         boolean,    -- quer nota fiscal? (null = não definido)
  add column if not exists cliente_oculto   boolean not null default false,  -- persona de auditoria (FORA do BI real)
  add column if not exists convertido_em    timestamptz,-- quando virou cliente
  add column if not exists churned_em        timestamptz,-- quando deixou de ser cliente
  add column if not exists trial_inicio      timestamptz,
  add column if not exists trial_fim         timestamptz,
  add column if not exists trial_resultado   text,       -- em_andamento/converteu/nao_converteu
  add column if not exists papeis            text[] not null default '{}';  -- tags além do estágio

alter table public.organizations drop constraint if exists organizations_trial_resultado_check;
alter table public.organizations
  add constraint organizations_trial_resultado_check
  check (trial_resultado is null or trial_resultado = any (array['em_andamento'::text,'converteu'::text,'nao_converteu'::text]));

comment on column public.organizations.papeis is 'Tags de papel além do estágio (stage): fornecedor, prestador_servico, representante_comercial, indicador, colaborador.';
comment on column public.organizations.cliente_oculto is 'Persona de auditoria (cliente oculto). Excluir das métricas/BI reais.';

-- 2) crm.people — falta função, e-mails múltiplos e DISC (cargo=role, descrição=notes já existem) ---
alter table crm.people
  add column if not exists funcao       text,
  add column if not exists emails       text[] not null default '{}',
  add column if not exists disc_tipo    text,   -- D/I/S/C (predominante) — sistema DISC futuro preenche
  add column if not exists disc_data    date,
  add column if not exists disc_scores  jsonb;  -- placeholder {"D":..,"I":..,"S":..,"C":..}

comment on column crm.people.disc_scores is 'Reservado p/ o sistema DISC futuro. Nulo até a pessoa fazer o teste.';

-- 3) crm.org_referral — origem/indicação/comissão (INTERNO, owner-only; cliente NUNCA vê) ---------
--    FORA de organizations de propósito: o /me do cliente faz select * da própria org.
create table if not exists crm.org_referral (
  organization_id     uuid primary key references public.organizations(id) on delete cascade,
  origem_canal        text,                     -- internet/indicacao/fornecedor/evento/outbound...
  indicado_por        uuid references public.organizations(id) on delete set null,
  indicado_em         timestamptz,
  comissao_tipo       text,                     -- desconto_fatura / dinheiro
  comissao_percent    numeric(5,2),
  comissao_status     text,                     -- sem_comissao / pendente / paga
  captado_por         text,                     -- ex.: "Julie (SDR)"
  primeiro_contato_em timestamptz,
  obs                 text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint org_referral_comissao_tipo_check   check (comissao_tipo   is null or comissao_tipo   = any (array['desconto_fatura'::text,'dinheiro'::text])),
  constraint org_referral_comissao_status_check check (comissao_status is null or comissao_status = any (array['sem_comissao'::text,'pendente'::text,'paga'::text]))
);
alter table crm.org_referral enable row level security;
drop policy if exists org_referral_admin_all on crm.org_referral;
create policy org_referral_admin_all on crm.org_referral
  using (public.is_crasto_admin()) with check (public.is_crasto_admin());
grant select, insert, update, delete on crm.org_referral to authenticated, service_role;
comment on table crm.org_referral is 'Origem/indicação/comissão por empresa — INTERNO. RLS só is_crasto_admin(); cliente jamais lê.';

-- 4) public.connectors — ligar um cliente que virou indicador + tipo de recompensa ---------------
alter table public.connectors
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,  -- cliente-indicador (null = externo)
  add column if not exists reward_type     text;  -- desconto_fatura / dinheiro
alter table public.connectors drop constraint if exists connectors_reward_type_check;
alter table public.connectors
  add constraint connectors_reward_type_check
  check (reward_type is null or reward_type = any (array['desconto_fatura'::text,'dinheiro'::text]));

-- 5) admin_clients() — devolve os campos operacionais novos p/ a LISTA (farol já vem via health_v2;
--    referral/comissão NÃO entram aqui — ficam no detalhe via RPC admin-only) ---------------------
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
      o.papeis, o.tipo_empresa, o.emite_nf, o.cliente_oculto, o.convertido_em, o.churned_em,
      o.trial_inicio, o.trial_fim, o.trial_resultado, o.status as org_status,
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

-- ROLLBACK (referência): drop table crm.org_referral; alter table ... drop column ... (todas as colunas
-- novas); recriar admin_clients() sem os campos novos. Nada destrutivo é feito por esta migration.
