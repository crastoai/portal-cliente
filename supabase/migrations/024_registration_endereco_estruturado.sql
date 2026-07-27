-- 024 · admin_registration_upsert passa a gravar logradouro/número/bairro (endereço estruturado)
-- Aditivo: as colunas logradouro/numero/bairro foram criadas na 023; o RPC só precisa escrevê-las.
create or replace function public.admin_registration_upsert(p jsonb) returns uuid
    language plpgsql security definer
    set search_path to 'public', 'crm'
    as $$
declare v_id uuid; v_org uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  v_org := nullif(p->>'organization_id','')::uuid;
  if v_org is null then raise exception 'organization_id obrigatorio'; end if;
  if coalesce(p->>'id','') <> '' then
    update crm.company_cnpjs set
      cnpj=p->>'cnpj', trade_name=p->>'trade_name', legal_name=p->>'legal_name',
      country=coalesce(p->>'country',country), reg_type=coalesce(p->>'reg_type',reg_type),
      is_headquarters=coalesce((p->>'is_headquarters')::boolean,is_headquarters),
      is_active=coalesce((p->>'is_active')::boolean,is_active),
      inscricao_estadual=p->>'inscricao_estadual', inscricao_municipal=p->>'inscricao_municipal',
      regime_tributario=p->>'regime_tributario', notes=p->>'notes',
      zip_code=p->>'zip_code', city=p->>'city', state=p->>'state', address=p->>'address',
      logradouro=p->>'logradouro', numero=p->>'numero', bairro=p->>'bairro', updated_at=now()
    where id=(p->>'id')::uuid and organization_id=v_org returning id into v_id;
  else
    insert into crm.company_cnpjs(organization_id,cnpj,trade_name,legal_name,country,reg_type,is_headquarters,is_active,inscricao_estadual,inscricao_municipal,regime_tributario,notes,zip_code,city,state,address,logradouro,numero,bairro)
    values (v_org,p->>'cnpj',p->>'trade_name',p->>'legal_name',coalesce(p->>'country','BR'),coalesce(p->>'reg_type','cnpj'),
      coalesce((p->>'is_headquarters')::boolean,false),coalesce((p->>'is_active')::boolean,true),
      p->>'inscricao_estadual',p->>'inscricao_municipal',p->>'regime_tributario',p->>'notes',
      p->>'zip_code',p->>'city',p->>'state',p->>'address',p->>'logradouro',p->>'numero',p->>'bairro')
    returning id into v_id;
  end if;
  return v_id;
end $$;
