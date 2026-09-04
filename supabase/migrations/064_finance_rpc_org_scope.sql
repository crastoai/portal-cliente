-- ============================================================================
-- 064 · FINANCEIRO MULTITENANT — Fase 2: escopo por organização nas RPCs
--
-- Troca o portão único is_crasto_admin() por: (a) ESCOPO por dono via
-- fin_scope_org() + (b) ENTITLEMENT (has_finance_module) + (c) PAPEL
-- (pode_ver_financeiro). SECURITY DEFINER permanece. As RPCs de NÚCLEO
-- (admin_ai_cost, fin_ai_cost_*, admin_gcp_project_map*) NÃO são tocadas —
-- seguem is_crasto_admin(), pois custo de IA é ferramental da Crasto.
--
-- Resolver robusto (decisão do Crasto 2026-09-04): impersonação → org própria
-- → crasto_admin sem org cai na org da Crasto. Nenhum admin perde visão; o
-- cliente vê SÓ o dele. Bodies reproduzidos da versão de PRODUÇÃO (drift já
-- incluso: vinculo/has_nf/person/prev_monthly/payment_schedule/…).
--
-- Corpos idempotentes (create or replace); nenhum dado é alterado.
-- Aplicada em prod via Management API em 2026-09-04.
-- ============================================================================
begin;

-- ── resolver do dono efetivo (o único ponto que decide "de quem são os livros") ──
create or replace function public.fin_scope_org()
returns uuid
language sql stable security definer
set search_path to 'public'
as $fn$
  select coalesce(
    public.current_org_id(),  -- impersonação (admin) OU org do próprio usuário
    case when public.is_crasto_admin()
         then '8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd'::uuid  -- admin/bot sem org → org Crasto.AI
    end
  );
$fn$;
grant execute on function public.fin_scope_org() to authenticated, service_role;

-- ============================ CONTAS (accounts) =============================
create or replace function public.fin_accounts(p_type text default null, p_status text default null)
 returns setof finance.accounts language sql stable security definer set search_path to 'public','finance'
as $function$
  select * from finance.accounts
   where owner_org_id = public.fin_scope_org()
     and public.has_finance_module() and public.pode_ver_financeiro()
     and (p_type is null or account_type = p_type)
     and (p_status is null or status = p_status)
   order by coalesce(due_date, created_at) asc, created_at asc;
$function$;

create or replace function public.fin_account_upsert(p jsonb)
 returns uuid language plpgsql security definer set search_path to 'public','finance'
as $function$
declare v_id uuid; v_org uuid;
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  v_org := public.fin_scope_org();
  if v_org is null then raise exception 'sem organizacao no escopo do financeiro'; end if;
  if coalesce(p->>'id','') <> '' then
    update finance.accounts set
      account_type = case when p ? 'account_type' then coalesce(p->>'account_type',account_type) else account_type end,
      description  = case when p ? 'description'  then coalesce(p->>'description',description)   else description end,
      category     = case when p ? 'category'     then p->>'category'     else category end,
      amount       = case when p ? 'amount'       then coalesce((p->>'amount')::numeric,amount) else amount end,
      amount_paid  = case when p ? 'amount_paid'  then coalesce((p->>'amount_paid')::numeric,amount_paid) else amount_paid end,
      due_date     = case when p ? 'due_date'     then nullif(p->>'due_date','')::timestamptz     else due_date end,
      payment_date = case when p ? 'payment_date' then nullif(p->>'payment_date','')::timestamptz else payment_date end,
      payment_method = case when p ? 'payment_method' then p->>'payment_method' else payment_method end,
      status       = case when p ? 'status'       then coalesce(p->>'status',status) else status end,
      recurrence   = case when p ? 'recurrence'   then p->>'recurrence'   else recurrence end,
      invoice_number = case when p ? 'invoice_number' then p->>'invoice_number' else invoice_number end,
      contact_name = case when p ? 'contact_name' then p->>'contact_name' else contact_name end,
      contact_reference = case when p ? 'contact_reference' then p->>'contact_reference' else contact_reference end,
      organization_id = case when p ? 'organization_id' then nullif(p->>'organization_id','')::uuid else organization_id end,
      expense_type = case when p ? 'expense_type' then p->>'expense_type' else expense_type end,
      services     = case when p ? 'services'     then coalesce(p->'services','[]'::jsonb) else services end,
      contract_validity_value = case when p ? 'contract_validity_value' then nullif(p->>'contract_validity_value','')::int else contract_validity_value end,
      contract_validity_unit  = case when p ? 'contract_validity_unit'  then p->>'contract_validity_unit' else contract_validity_unit end,
      contract_total = case when p ? 'contract_total' then nullif(p->>'contract_total','')::numeric else contract_total end,
      contract_signed_date = case when p ? 'contract_signed_date' then nullif(p->>'contract_signed_date','')::date else contract_signed_date end,
      payment_installments = case when p ? 'payment_installments' then nullif(p->>'payment_installments','')::int else payment_installments end,
      payment_day_of_month = case when p ? 'payment_day_of_month' then nullif(p->>'payment_day_of_month','')::int else payment_day_of_month end,
      payment_reason = case when p ? 'payment_reason' then p->>'payment_reason' else payment_reason end,
      payment_schedule = case when p ? 'payment_schedule' then coalesce(p->'payment_schedule','[]'::jsonb) else payment_schedule end,
      notes        = case when p ? 'notes'        then p->>'notes' else notes end,
      vinculo      = case when p ? 'vinculo' then p->>'vinculo' else vinculo end,
      has_nf       = case when p ? 'has_nf' then (p->>'has_nf')::boolean else has_nf end,
      updated_at   = now()
    where id=(p->>'id')::uuid and owner_org_id = v_org returning id into v_id;
    if v_id is null then raise exception 'registro inexistente ou fora do seu escopo'; end if;
  else
    insert into finance.accounts(owner_org_id,account_type,description,category,amount,amount_paid,due_date,payment_date,payment_method,status,recurrence,invoice_number,contact_name,contact_reference,organization_id,expense_type,notes,services,contract_validity_value,contract_validity_unit,contract_total,contract_signed_date,payment_installments,payment_day_of_month,payment_reason,payment_schedule,vinculo,has_nf)
    values (v_org,p->>'account_type',p->>'description',p->>'category',coalesce((p->>'amount')::numeric,0),coalesce((p->>'amount_paid')::numeric,0),nullif(p->>'due_date','')::timestamptz,nullif(p->>'payment_date','')::timestamptz,p->>'payment_method',coalesce(p->>'status','pending'),p->>'recurrence',p->>'invoice_number',p->>'contact_name',p->>'contact_reference',nullif(p->>'organization_id','')::uuid,p->>'expense_type',p->>'notes',coalesce(p->'services','[]'::jsonb),nullif(p->>'contract_validity_value','')::int,p->>'contract_validity_unit',nullif(p->>'contract_total','')::numeric,nullif(p->>'contract_signed_date','')::date,nullif(p->>'payment_installments','')::int,nullif(p->>'payment_day_of_month','')::int,p->>'payment_reason',coalesce(p->'payment_schedule','[]'::jsonb),p->>'vinculo',coalesce((p->>'has_nf')::boolean,false))
    returning id into v_id;
  end if;
  return v_id;
end $function$;

create or replace function public.fin_account_delete(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public','finance'
as $function$
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  delete from finance.accounts where id=p_id and owner_org_id = public.fin_scope_org();
end $function$;

-- ======================= CUSTOS (operational_costs) =========================
create or replace function public.fin_costs(p_active boolean default null)
 returns setof finance.operational_costs language sql stable security definer set search_path to 'public','finance'
as $function$
  select * from finance.operational_costs
   where owner_org_id = public.fin_scope_org()
     and public.has_finance_module() and public.pode_ver_financeiro()
     and (p_active is null or is_active = p_active)
   order by amount_brl desc nulls last, created_at desc;
$function$;

create or replace function public.fin_cost_upsert(p jsonb)
 returns uuid language plpgsql security definer set search_path to 'public','finance'
as $function$
declare v_id uuid; v_org uuid;
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  v_org := public.fin_scope_org();
  if v_org is null then raise exception 'sem organizacao no escopo do financeiro'; end if;
  if coalesce(p->>'id','')<>'' then
    update finance.operational_costs set vendor_name=p->>'vendor_name', description=coalesce(p->>'description',description),
      category=p->>'category', currency=coalesce(p->>'currency',currency), amount_original=coalesce((p->>'amount_original')::numeric,amount_original),
      exchange_rate=coalesce((p->>'exchange_rate')::numeric,exchange_rate), amount_brl=coalesce((p->>'amount_brl')::numeric,amount_brl),
      cost_type=p->>'cost_type', cost_nature=p->>'cost_nature', recurrence=p->>'recurrence',
      reference_date=nullif(p->>'reference_date','')::date, next_payment_date=nullif(p->>'next_payment_date','')::date,
      is_active=coalesce((p->>'is_active')::boolean,is_active), payment_method=p->>'payment_method',
      website=p->>'website', purpose=p->>'purpose', notes=p->>'notes', vinculo=coalesce(p->>'vinculo',vinculo),
      person=case when p ? 'person' then nullif(p->>'person','') else person end,
      prev_monthly=case when p ? 'prev_monthly' then nullif(p->>'prev_monthly','')::numeric else prev_monthly end,
      amount_paid=case when p ? 'amount_paid' then coalesce((p->>'amount_paid')::numeric,amount_paid) else amount_paid end,
      payment_date=case when p ? 'payment_date' then nullif(p->>'payment_date','')::timestamptz else payment_date end,
      payment_schedule=case when p ? 'payment_schedule' then p->'payment_schedule' else payment_schedule end,
      updated_at=now()
    where id=(p->>'id')::uuid and owner_org_id = v_org returning id into v_id;
    if v_id is null then raise exception 'registro inexistente ou fora do seu escopo'; end if;
  else
    insert into finance.operational_costs(owner_org_id,vendor_name,description,category,currency,amount_original,exchange_rate,amount_brl,cost_type,cost_nature,recurrence,reference_date,next_payment_date,is_active,payment_method,website,purpose,notes,vinculo,person,prev_monthly,amount_paid,payment_date,payment_schedule)
    values (v_org,p->>'vendor_name',p->>'description',p->>'category',coalesce(p->>'currency','BRL'),coalesce((p->>'amount_original')::numeric,0),coalesce((p->>'exchange_rate')::numeric,1),coalesce((p->>'amount_brl')::numeric,0),p->>'cost_type',p->>'cost_nature',p->>'recurrence',nullif(p->>'reference_date','')::date,nullif(p->>'next_payment_date','')::date,coalesce((p->>'is_active')::boolean,true),p->>'payment_method',p->>'website',p->>'purpose',p->>'notes',p->>'vinculo',nullif(p->>'person',''),nullif(p->>'prev_monthly','')::numeric,coalesce((p->>'amount_paid')::numeric,0),nullif(p->>'payment_date','')::timestamptz,case when p ? 'payment_schedule' then p->'payment_schedule' else null end)
    returning id into v_id;
  end if;
  return v_id;
end $function$;

create or replace function public.fin_cost_delete(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public','finance'
as $function$
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  delete from finance.operational_costs where id=p_id and owner_org_id = public.fin_scope_org();
end $function$;

-- ========================= TESOURARIA (transactions) ========================
create or replace function public.fin_transactions(p_type text default null, p_status text default null)
 returns setof finance.transactions language sql stable security definer set search_path to 'public','finance'
as $function$
  select * from finance.transactions
   where owner_org_id = public.fin_scope_org()
     and public.has_finance_module() and public.pode_ver_financeiro()
     and (p_type is null or type=p_type) and (p_status is null or status=p_status)
   order by transaction_date desc nulls last, created_at desc;
$function$;

create or replace function public.fin_transaction_upsert(p jsonb)
 returns uuid language plpgsql security definer set search_path to 'public','finance'
as $function$
declare v_id uuid; v_org uuid;
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  v_org := public.fin_scope_org();
  if v_org is null then raise exception 'sem organizacao no escopo do financeiro'; end if;
  if coalesce(p->>'id','')<>'' then
    update finance.transactions set type=coalesce(p->>'type',type), category=p->>'category',
      amount=coalesce((p->>'amount')::numeric,amount), description=p->>'description', status=coalesce(p->>'status',status),
      transaction_date=nullif(p->>'transaction_date','')::date, bank_account=p->>'bank_account',
      contact_name=p->>'contact_name', payment_method=p->>'payment_method', notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid and owner_org_id = v_org returning id into v_id;
    if v_id is null then raise exception 'registro inexistente ou fora do seu escopo'; end if;
  else
    insert into finance.transactions(owner_org_id,type,category,amount,description,status,transaction_date,bank_account,contact_name,payment_method,notes)
    values (v_org,coalesce(p->>'type','income'),p->>'category',coalesce((p->>'amount')::numeric,0),p->>'description',coalesce(p->>'status','completed'),nullif(p->>'transaction_date','')::date,p->>'bank_account',p->>'contact_name',p->>'payment_method',p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $function$;

create or replace function public.fin_transaction_delete(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public','finance'
as $function$
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  delete from finance.transactions where id=p_id and owner_org_id = public.fin_scope_org();
end $function$;

-- ========================== DOCUMENTOS (documents) ==========================
create or replace function public.fin_documents(p_category text default null)
 returns setof finance.documents language sql stable security definer set search_path to 'public','finance'
as $function$
  select * from finance.documents
   where owner_org_id = public.fin_scope_org()
     and public.has_finance_module() and public.pode_ver_financeiro()
     and (p_category is null or category=p_category)
   order by uploaded_at desc;
$function$;

create or replace function public.fin_document_insert(p jsonb)
 returns uuid language plpgsql security definer set search_path to 'public','finance'
as $function$
declare v_id uuid; v_org uuid;
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  v_org := public.fin_scope_org();
  if v_org is null then raise exception 'sem organizacao no escopo do financeiro'; end if;
  insert into finance.documents(owner_org_id,category,name,competencia,storage_key,mime,size,uploaded_by)
  values(v_org, p->>'category', p->>'name', nullif(p->>'competencia',''), p->>'storage_key', nullif(p->>'mime',''), nullif(p->>'size','')::bigint, auth.uid())
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.fin_document_delete(p_id uuid)
 returns text language plpgsql security definer set search_path to 'public','finance'
as $function$
declare v_key text;
begin
  if not (public.has_finance_module() and public.pode_ver_financeiro()) then raise exception 'not authorized'; end if;
  delete from finance.documents where id=p_id and owner_org_id = public.fin_scope_org() returning storage_key into v_key;
  return v_key;
end $function$;

commit;
