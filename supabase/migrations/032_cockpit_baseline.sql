-- 032 — Cockpit · Baseline de Entrada (o "antes" real do antes×depois) — Fase 1, item 1.3a
-- Captura, no onboarding, o "antes" do cliente: informado na reunião (transcrição), print dos
-- indicadores da ferramenta atual, manual, ou medido pré-IA. Alimenta as métricas de "Meus
-- Resultados" (delivery cockpit) — antes = valor_antes com a FONTE visível.
-- Append-only: cada captura insere uma linha; is_current marca a vigente por (org, metric).
-- Escrita só service_role/admin (extrator Psiquê); cliente só LÊ o baseline da própria org.

create table if not exists delivery.client_baseline (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  metric            text not null,            -- chave: tempo_resposta | automacao | novos_leads | atendimentos | custo_atendimento | ...
  label             text,                     -- rótulo humano (ex.: "Tempo de 1ª resposta")
  valor_antes       numeric,                  -- null quando "não tinha" / não informado
  unidade           text,                     -- s | % | '' | R$ ...
  status            text not null default 'informado'
                    check (status in ('informado','nao_tinha','nao_informado','medido')),
  fonte             text,                     -- "reunião 12/07" | "print WhatsApp" | "manual" | "medido pré-IA"
  fonte_ref         text,                     -- storage_path da transcrição/print (interno; não exposto ao cliente)
  baseline_date     date,                     -- data de referência do "antes"
  is_current        boolean not null default true,
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now()
);
comment on table delivery.client_baseline is 'Baseline de Entrada — o "antes" do cliente, capturado no onboarding (Cockpit · Meus Resultados).';
create index if not exists idx_client_baseline_current on delivery.client_baseline(organization_id, metric) where is_current;

alter table delivery.client_baseline enable row level security;
-- Mesmo molde de delivery.implementations/system_health: admin faz tudo; cliente lê a própria org.
drop policy if exists client_baseline_admin_all on delivery.client_baseline;
create policy client_baseline_admin_all on delivery.client_baseline
  using (public.is_admin_viewing_all()) with check (public.is_crasto_admin());
drop policy if exists client_baseline_client_read on delivery.client_baseline;
create policy client_baseline_client_read on delivery.client_baseline
  for select using (organization_id = public.current_org_id());
