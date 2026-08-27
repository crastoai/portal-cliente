-- 055 · Webhook de transcrições (D5) — captura em tempo real das reuniões (Google Meet).
-- Um endpoint público (protegido por SECRET) recebe a transcrição; o motor casa com o cliente
-- existente (por e-mail/nome) ou cria um novo, e registra a reunião. Aqui só o segredo + reveal admin.
create table if not exists automation.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
insert into automation.app_settings (key, value)
  values ('meet_webhook_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;

create or replace function public.admin_meet_webhook_secret() returns text
    language plpgsql stable security definer set search_path to 'public', 'automation' as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select value from automation.app_settings where key = 'meet_webhook_secret');
end $$;
grant execute on function public.admin_meet_webhook_secret() to authenticated;
