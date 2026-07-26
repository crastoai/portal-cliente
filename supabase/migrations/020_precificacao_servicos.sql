-- 020 · Precificação (Fatia 2, onda 1): campos de negócio/uso/custo/desconto + variações por inteligência
-- Aditivo/reversível. cost_allocation tem PADRÃO 'absorvido' (Crasto absorve); o override por cliente
-- será feito no detalhe do item (delivery), não aqui. desconto_max = teto do serviço (opcional; o teto
-- global 10% livre / 50% com aprovação do Crasto é regra de UI no Gerador de propostas — onda 3).

alter table catalog.services
  add column if not exists business_category text,               -- consultoria_ia | instalacao | saas_produto | suporte | addon | outro
  add column if not exists cost_allocation   text default 'absorvido'::text,  -- absorvido | byo_cliente (padrão)
  add column if not exists usage_included    numeric(14,2),       -- franquia incluída (ex.: 1000)
  add column if not exists usage_unit        text,                -- ex.: 'mensagens'
  add column if not exists overage_price     numeric(14,4),       -- preço do excedente por unidade
  add column if not exists desconto_max      numeric(5,2);        -- teto de desconto do serviço (%) — opcional

alter table catalog.services drop constraint if exists services_cost_allocation_check;
alter table catalog.services
  add constraint services_cost_allocation_check
  check (cost_allocation is null or cost_allocation = any (array['absorvido'::text, 'byo_cliente'::text]));

-- Variações por inteligência (o modelo de IA muda o preço). Ex.: Essencial/Avançado/Máximo.
create table if not exists catalog.service_variants (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references catalog.services(id) on delete cascade,
  nome        text not null,
  ai_model    text,
  price_table numeric(12,2) not null default 0,
  price_min   numeric(12,2),
  price_max   numeric(12,2),
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamp with time zone not null default now()
);
create index if not exists service_variants_service_idx on catalog.service_variants(service_id);

alter table catalog.service_variants enable row level security;
drop policy if exists service_variants_admin_all on catalog.service_variants;
create policy service_variants_admin_all on catalog.service_variants
  using (public.is_crasto_admin()) with check (public.is_crasto_admin());
grant select, insert, update, delete on catalog.service_variants to authenticated, service_role;

comment on table catalog.service_variants is 'Variações de preço de um serviço por inteligência (modelo de IA). is_default marca a variação-base (mais barata).';
comment on column catalog.services.cost_allocation is 'Padrão de quem paga a IA: absorvido (Crasto) ou byo_cliente. Override por cliente no delivery.';
