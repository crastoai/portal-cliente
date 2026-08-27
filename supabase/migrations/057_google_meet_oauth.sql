-- 057 · Integração Google Meet (OAuth INTERNAL + captura de transcrições) — Tarefa D5
-- ISOLADO: tudo em automation, chaves NOVAS (google_meet_*), nunca reusa reveal_provider_key('google')
-- nem 'google_billing'. Projeto GCP dedicado (crasto-portal-meet). Só service_role acessa.

-- Conexão Google (INTERNAL = só a Crasto). email único; guarda refresh/access token e o watermark do poll.
create table if not exists automation.google_connections (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  refresh_token text,
  access_token  text,
  access_expiry timestamptz,
  scopes        text,
  watermark     timestamptz,          -- último conferenceRecord já processado (start_time)
  last_poll_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table automation.google_connections is 'Conexão OAuth do Google (Meet/Calendar) do Portal — INTERNAL, só a Crasto. Tokens: acesso restrito a service_role.';

-- state CSRF do fluxo OAuth (o callback é público; valida o state).
create table if not exists automation.oauth_states (
  state      text primary key,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Config do client OAuth (preenchida após criar o client no Console do projeto novo).
insert into automation.app_settings (key, value) values
  ('google_meet_client_id', ''),
  ('google_meet_client_secret', ''),
  ('google_meet_redirect_uri', 'https://portal-api.4hqjjr.easypanel.host/api/integrations/google-meet/oauth/callback')
on conflict (key) do nothing;

grant select, insert, update, delete on automation.google_connections to service_role;
grant select, insert, update, delete on automation.oauth_states       to service_role;
