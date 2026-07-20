-- ============================================================================
-- 000 · BASELINE — schema `finance` do Portal (SNAPSHOT do banco em 2026-07-20)
--
-- POR QUÊ: as funções financeiras (fin_*, my_faturas) e o schema finance viviam SÓ no
-- banco, sem versionamento. Este arquivo captura o estado ATUAL (inclusive o fix de
-- status/datas por-parcela aplicado em 20/07/2026) para o repositório passar a ser o
-- registro append-only das mudanças. NÃO é um bootstrap do zero garantido — o banco de
-- produção continua a fonte da verdade; daqui pra frente, cada alteração é uma migration
-- numerada nova (001_, 002_, …). Ver README.
-- ============================================================================

create schema if not exists finance;

-- ---------- TABELAS ----------------------------------------------------------------------
create table if not exists finance.accounts (
  id uuid not null default gen_random_uuid(),
  account_type text not null,
  description text not null,
  category text,
  amount numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  due_date date,
  payment_date date,
  payment_method text,
  status text not null default 'pending'::text,
  recurrence text,
  invoice_number text,
  contact_name text,
  organization_id uuid,
  expense_type text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  contact_reference text,
  services jsonb not null default '[]'::jsonb,
  contract_validity_value integer,
  contract_validity_unit text,
  contract_total numeric(14,2),
  payment_installments integer,
  payment_day_of_month integer,
  payment_reason text,
  payment_schedule jsonb not null default '[]'::jsonb,
  constraint accounts_account_type_check CHECK ((account_type = ANY (ARRAY['payable'::text, 'receivable'::text]))),
  constraint accounts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text, 'cancelled'::text]))),
  constraint accounts_pkey PRIMARY KEY (id)
);
alter table finance.accounts enable row level security;

create table if not exists finance.operational_costs (
  id uuid not null default gen_random_uuid(),
  vendor_name text,
  description text not null,
  category text,
  currency text not null default 'BRL'::text,
  amount_original numeric(14,2) not null default 0,
  exchange_rate numeric(12,4) not null default 1,
  amount_brl numeric(14,2) not null default 0,
  cost_type text,
  cost_nature text,
  recurrence text,
  reference_date date,
  next_payment_date date,
  is_active boolean not null default true,
  payment_method text,
  website text,
  purpose text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint operational_costs_pkey PRIMARY KEY (id)
);
alter table finance.operational_costs enable row level security;

create table if not exists finance.transactions (
  id uuid not null default gen_random_uuid(),
  type text not null,
  category text,
  amount numeric(14,2) not null default 0,
  description text,
  status text not null default 'pending'::text,
  transaction_date date,
  bank_account text,
  contact_name text,
  payment_method text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text]))),
  constraint transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text]))),
  constraint transactions_pkey PRIMARY KEY (id)
);
alter table finance.transactions enable row level security;

-- ---------- FUNÇÕES (RPCs) ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_accounts(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS SETOF finance.accounts
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
  select * from finance.accounts
   where public.is_crasto_admin()
     and (p_type is null or account_type = p_type)
     and (p_status is null or status = p_status)
   order by coalesce(due_date, created_at::date) asc, created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.fin_account_upsert(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','') <> '' then
    update finance.accounts set
      account_type = case when p ? 'account_type' then coalesce(p->>'account_type',account_type) else account_type end,
      description  = case when p ? 'description'  then coalesce(p->>'description',description)   else description end,
      category     = case when p ? 'category'     then p->>'category'     else category end,
      amount       = case when p ? 'amount'       then coalesce((p->>'amount')::numeric,amount) else amount end,
      amount_paid  = case when p ? 'amount_paid'  then coalesce((p->>'amount_paid')::numeric,amount_paid) else amount_paid end,
      due_date     = case when p ? 'due_date'     then nullif(p->>'due_date','')::date     else due_date end,
      payment_date = case when p ? 'payment_date' then nullif(p->>'payment_date','')::date else payment_date end,
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
      payment_installments = case when p ? 'payment_installments' then nullif(p->>'payment_installments','')::int else payment_installments end,
      payment_day_of_month = case when p ? 'payment_day_of_month' then nullif(p->>'payment_day_of_month','')::int else payment_day_of_month end,
      payment_reason = case when p ? 'payment_reason' then p->>'payment_reason' else payment_reason end,
      payment_schedule = case when p ? 'payment_schedule' then coalesce(p->'payment_schedule','[]'::jsonb) else payment_schedule end,
      notes        = case when p ? 'notes'        then p->>'notes' else notes end,
      updated_at   = now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.accounts(account_type,description,category,amount,amount_paid,due_date,payment_date,payment_method,status,recurrence,invoice_number,contact_name,contact_reference,organization_id,expense_type,notes,services,contract_validity_value,contract_validity_unit,contract_total,payment_installments,payment_day_of_month,payment_reason,payment_schedule)
    values (p->>'account_type',p->>'description',p->>'category',coalesce((p->>'amount')::numeric,0),coalesce((p->>'amount_paid')::numeric,0),nullif(p->>'due_date','')::date,nullif(p->>'payment_date','')::date,p->>'payment_method',coalesce(p->>'status','pending'),p->>'recurrence',p->>'invoice_number',p->>'contact_name',p->>'contact_reference',nullif(p->>'organization_id','')::uuid,p->>'expense_type',p->>'notes',coalesce(p->'services','[]'::jsonb),nullif(p->>'contract_validity_value','')::int,p->>'contract_validity_unit',nullif(p->>'contract_total','')::numeric,nullif(p->>'payment_installments','')::int,nullif(p->>'payment_day_of_month','')::int,p->>'payment_reason',coalesce(p->'payment_schedule','[]'::jsonb))
    returning id into v_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.fin_account_delete(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.accounts where id=p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.fin_costs(p_active boolean DEFAULT NULL::boolean)
 RETURNS SETOF finance.operational_costs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
  select * from finance.operational_costs where public.is_crasto_admin() and (p_active is null or is_active = p_active)
  order by amount_brl desc nulls last, created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.fin_cost_upsert(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update finance.operational_costs set vendor_name=p->>'vendor_name', description=coalesce(p->>'description',description),
      category=p->>'category', currency=coalesce(p->>'currency',currency), amount_original=coalesce((p->>'amount_original')::numeric,amount_original),
      exchange_rate=coalesce((p->>'exchange_rate')::numeric,exchange_rate), amount_brl=coalesce((p->>'amount_brl')::numeric,amount_brl),
      cost_type=p->>'cost_type', cost_nature=p->>'cost_nature', recurrence=p->>'recurrence',
      reference_date=nullif(p->>'reference_date','')::date, next_payment_date=nullif(p->>'next_payment_date','')::date,
      is_active=coalesce((p->>'is_active')::boolean,is_active), payment_method=p->>'payment_method',
      website=p->>'website', purpose=p->>'purpose', notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.operational_costs(vendor_name,description,category,currency,amount_original,exchange_rate,amount_brl,cost_type,cost_nature,recurrence,reference_date,next_payment_date,is_active,payment_method,website,purpose,notes)
    values (p->>'vendor_name',p->>'description',p->>'category',coalesce(p->>'currency','BRL'),coalesce((p->>'amount_original')::numeric,0),coalesce((p->>'exchange_rate')::numeric,1),coalesce((p->>'amount_brl')::numeric,0),p->>'cost_type',p->>'cost_nature',p->>'recurrence',nullif(p->>'reference_date','')::date,nullif(p->>'next_payment_date','')::date,coalesce((p->>'is_active')::boolean,true),p->>'payment_method',p->>'website',p->>'purpose',p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.fin_transactions(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS SETOF finance.transactions
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
  select * from finance.transactions where public.is_crasto_admin()
    and (p_type is null or type=p_type) and (p_status is null or status=p_status)
  order by transaction_date desc nulls last, created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.fin_transaction_upsert(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update finance.transactions set type=coalesce(p->>'type',type), category=p->>'category',
      amount=coalesce((p->>'amount')::numeric,amount), description=p->>'description', status=coalesce(p->>'status',status),
      transaction_date=nullif(p->>'transaction_date','')::date, bank_account=p->>'bank_account',
      contact_name=p->>'contact_name', payment_method=p->>'payment_method', notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.transactions(type,category,amount,description,status,transaction_date,bank_account,contact_name,payment_method,notes)
    values (coalesce(p->>'type','income'),p->>'category',coalesce((p->>'amount')::numeric,0),p->>'description',coalesce(p->>'status','completed'),nullif(p->>'transaction_date','')::date,p->>'bank_account',p->>'contact_name',p->>'payment_method',p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.my_faturas()
 RETURNS TABLE(id text, description text, amount numeric, due_date text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
  with me as (select organization_id from public.profiles where id = auth.uid())
  select
    a.id::text || case when p.ord is not null then '-' || p.ord::text else '' end,
    case when p.ord is not null
         then coalesce(nullif(a.description,''), a.contact_name, 'Fatura') || ' — ' || (p.elem->>'installment') || '/' || jsonb_array_length(a.payment_schedule)
         else coalesce(nullif(a.description,''), a.contact_name, 'Fatura') end,
    case when p.ord is not null then (p.elem->>'amount')::numeric else a.amount end,
    case when p.ord is not null then nullif(p.elem->>'date','') else to_char(a.due_date,'YYYY-MM-DD') end,
    case
      when p.ord is not null then case when p.elem->>'status' = 'paid' then 'paid' else 'open' end
      else case when a.status = 'paid' then 'paid' when a.status = 'cancelled' then 'canceled' else 'open' end
    end
  from finance.accounts a
  join me on me.organization_id is not null and me.organization_id = a.organization_id
  left join lateral (
    select ord, elem from jsonb_array_elements(
      case when jsonb_typeof(a.payment_schedule) = 'array' and jsonb_array_length(a.payment_schedule) > 0
           then a.payment_schedule else '[]'::jsonb end
    ) with ordinality as t(elem, ord)
  ) p on true
  where a.account_type = 'receivable' and a.organization_id is not null
  order by 4 nulls last;
$function$;

