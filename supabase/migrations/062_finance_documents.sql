-- 062 — Documentos contábeis (módulo Contabilidade).
-- Arquivo físico vive no R2 (storage_key); aqui só os metadados. Admin-only via is_crasto_admin().
-- Aplicada em prod via Management API em 2026-08-28.

create table if not exists finance.documents (
  id uuid primary key default gen_random_uuid(),
  category text not null,            -- guias | notas | prolabore | certidoes | societario | prestadores | comprovantes | outros
  name text not null,
  competencia text,
  storage_key text not null,         -- chave no Cloudflare R2 (edge function `r2`)
  mime text,
  size bigint,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

create or replace function public.fin_documents(p_category text default null)
returns setof finance.documents language sql stable security definer set search_path to 'public','finance' as $fn$
  select * from finance.documents where public.is_crasto_admin() and (p_category is null or category = p_category) order by uploaded_at desc;
$fn$;

create or replace function public.fin_document_insert(p jsonb)
returns uuid language plpgsql security definer set search_path to 'public','finance' as $fn$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  insert into finance.documents(category,name,competencia,storage_key,mime,size,uploaded_by)
  values(p->>'category', p->>'name', nullif(p->>'competencia',''), p->>'storage_key', nullif(p->>'mime',''), nullif(p->>'size','')::bigint, auth.uid())
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function public.fin_document_delete(p_id uuid)
returns text language plpgsql security definer set search_path to 'public','finance' as $fn$
declare v_key text;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.documents where id = p_id returning storage_key into v_key;
  return v_key;
end $fn$;

grant execute on function public.fin_documents(text) to authenticated, service_role;
grant execute on function public.fin_document_insert(jsonb) to authenticated, service_role;
grant execute on function public.fin_document_delete(uuid) to authenticated, service_role;
