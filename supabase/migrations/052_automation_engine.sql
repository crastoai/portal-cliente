-- 052 · Motor de automações (B3+B4)
-- automation_rules: automações CONFIGURÁVEIS (aniversário de contato, aniversário de contrato…).
-- reminders: agendamentos PONTUAIS por empresa (ex.: follow-up +60d do JJ).
-- dispatch_log: dedupe de disparos por dia (o cron roda 1x/dia; evita repetir no mesmo dia).
-- Canais: 'sininho' (support.notifications), 'email' (Resend), 'whatsapp' (Evolution).
-- Admin-only: os endpoints têm AdminGuard; o cron roda como service_role.

create table if not exists automation.automation_rules (
  id         uuid primary key default gen_random_uuid(),
  rule_type  text not null unique,                  -- birthday_contact | contract_anniversary
  name       text not null,
  enabled    boolean not null default false,
  channels   text[] not null default '{}',          -- sininho | email | whatsapp
  template   text,                                   -- {contato} {empresa} {anos}
  config     jsonb not null default '{}',            -- ex.: {"milestones":[1,3,5],"wa_instance":"Portal Crasto","email_to":"crasto@crasto.com"}
  updated_at timestamptz not null default now()
);
comment on table automation.automation_rules is 'Automações configuráveis do Portal (disparos automáticos).';

create table if not exists automation.reminders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  due_at          timestamptz not null,
  title           text not null,
  message         text,
  channels        text[] not null default '{sininho}',
  status          text not null default 'pending',   -- pending | sent | cancelled
  created_by      uuid,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  meta            jsonb not null default '{}'
);
create index if not exists reminders_due_idx on automation.reminders (status, due_at);
comment on table automation.reminders is 'Agendamentos pontuais por empresa (follow-ups). O cron dispara quando due_at vence.';

create table if not exists automation.dispatch_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,        -- rule:birthday_contact | rule:contract_anniversary | reminder
  ref_id     text not null,        -- person_id / organization_id / reminder_id
  fired_on   date not null,
  created_at timestamptz not null default now(),
  unique (kind, ref_id, fired_on)
);

-- Seed das 2 automações (DESABILITADAS por padrão — o Crasto liga/edita na tela).
insert into automation.automation_rules (rule_type, name, channels, template, config) values
  ('birthday_contact', 'Aniversário do contato', '{sininho,email}',
   '🎂 Hoje é aniversário de {contato} ({empresa}). Que tal enviar os parabéns?', '{}'),
  ('contract_anniversary', 'Aniversário de contrato (tempo de casa)', '{sininho,email}',
   '🎉 {empresa} completa {anos} ano(s) conosco hoje. Marco de relacionamento — considere um brinde (vinho, livro).', '{"milestones":[1,3,5]}')
on conflict (rule_type) do nothing;

-- Seed do follow-up +60d do JJ Serviços (Rafael Siqueira) — B3 (só se ainda não existir).
insert into automation.reminders (organization_id, due_at, title, message, channels, meta)
select o.id, now() + interval '60 days',
  'Follow-up comercial · JJ Serviços (Rafael Siqueira)',
  'Consultor comercial (Crasto): ligar para Rafael Siqueira — JJ Serviços de Terceirização. Serviço entregue: mentoria de IA de 4h (avulso), último contrato R$ 2.500. Passaram ~60 dias da entrega. Perguntar como ele está e sondar nova venda (upsell). Programar também aniversário de contrato e de idade do contato.',
  '{sininho,email,whatsapp}', '{"origin":"B3 seed +60d"}'
from public.organizations o
where o.name ilike 'JJ Serviços%'
  and not exists (select 1 from automation.reminders r where r.title like 'Follow-up comercial · JJ Serviços%');
