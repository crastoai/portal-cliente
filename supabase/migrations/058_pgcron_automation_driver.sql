-- 058 · Driver de automação por pg_cron + pg_net (o @nestjs/schedule não dispara no container).
-- Chama endpoints internos do api (protegidos por secret) de forma confiável, do lado do Supabase:
--  - meet-poll a cada 2 min (captura de transcrições do Google Meet)
--  - run-dispatch a cada hora (aniversários/lembretes)
-- Idempotente: cron.schedule por NOME atualiza o job existente.
create extension if not exists pg_cron;

select cron.schedule('meet-poll-2min', '*/2 * * * *', $job$
  select net.http_post(
    url := 'https://portal-api.4hqjjr.easypanel.host/api/automation/public/meet-poll',
    body := jsonb_build_object('secret', (select value from automation.app_settings where key = 'meet_webhook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

select cron.schedule('automation-dispatch-hourly', '0 * * * *', $job$
  select net.http_post(
    url := 'https://portal-api.4hqjjr.easypanel.host/api/automation/public/run-dispatch',
    body := jsonb_build_object('secret', (select value from automation.app_settings where key = 'meet_webhook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
