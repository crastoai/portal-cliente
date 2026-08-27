-- 051 · Registro das instâncias de WhatsApp DO PORTAL (isolamento na Evolution compartilhada)
-- A Evolution é compartilhada com os clientes; fetchInstances traz TODAS. O Portal mantém aqui
-- só as instâncias que ELE criou (exclusivas p/ as automações) e a lista da tela filtra por este
-- registro — nunca mostra as instâncias dos clientes. Admin-only (RPCs security-definer).

create table if not exists automation.wa_instances (
  name       text primary key,
  label      text,
  created_by uuid,
  created_at timestamptz not null default now()
);
comment on table automation.wa_instances is 'Instâncias WhatsApp/Evolution criadas pelo Portal (exclusivas p/ automações). Filtra a lista da tela Integrações.';

-- Lista as instâncias do Portal (nomes + label).
create or replace function public.admin_wa_instances() returns json
    language plpgsql stable security definer set search_path to 'public', 'automation' as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(json_build_object('name', name, 'label', label) order by created_at), '[]'::json) from automation.wa_instances);
end $$;

-- Registra (ou atualiza o label de) uma instância do Portal.
create or replace function public.admin_wa_instance_add(p_name text, p_label text default null) returns void
    language plpgsql security definer set search_path to 'public', 'automation' as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  insert into automation.wa_instances (name, label, created_by) values (p_name, p_label, auth.uid())
  on conflict (name) do update set label = coalesce(excluded.label, automation.wa_instances.label);
end $$;

-- Remove uma instância do registro do Portal.
create or replace function public.admin_wa_instance_remove(p_name text) returns void
    language plpgsql security definer set search_path to 'public', 'automation' as $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from automation.wa_instances where name = p_name;
end $$;

grant execute on function public.admin_wa_instances() to authenticated;
grant execute on function public.admin_wa_instance_add(text, text) to authenticated;
grant execute on function public.admin_wa_instance_remove(text) to authenticated;
