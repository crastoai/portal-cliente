-- 033 — Cockpit · Narrativa da Psiquê (o hero de "Meus Resultados") — Fase 1, item 1.4
-- A Psiquê (DeepSeek) lê o snapshot do cliente (baseline "antes" + resultados vivos + conquistas)
-- e ESCREVE a narrativa: headline ("você respondia em X, agora Y"), destaques e um resumo.
-- Guardada como JSON (o front renderiza os blocos). Append-only: cada geração insere e marca
-- is_current; histórico preservado. Cliente só LÊ a da própria org (RLS); escrita só service_role.

create table if not exists delivery.cockpit_narrative (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  narrative        jsonb not null,          -- { headline, destaques:[{n,l}], resumo, gerado_em }
  snapshot_hash    text,                    -- p/ regenerar só quando os dados mudam (economia de tokens)
  model            text,
  tokens_in        int,
  tokens_out       int,
  is_current       boolean not null default true,
  generated_at     timestamptz not null default now()
);
comment on table delivery.cockpit_narrative is 'Narrativa da Psiquê (hero do Cockpit · Meus Resultados) — gerada por IA a partir do baseline + resultados vivos.';
create index if not exists idx_cockpit_narrative_current on delivery.cockpit_narrative(organization_id) where is_current;

alter table delivery.cockpit_narrative enable row level security;
drop policy if exists cockpit_narrative_admin_all on delivery.cockpit_narrative;
create policy cockpit_narrative_admin_all on delivery.cockpit_narrative
  using (public.is_admin_viewing_all()) with check (public.is_crasto_admin());
drop policy if exists cockpit_narrative_client_read on delivery.cockpit_narrative;
create policy cockpit_narrative_client_read on delivery.cockpit_narrative
  for select using (organization_id = public.current_org_id());
