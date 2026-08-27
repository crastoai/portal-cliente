-- 060: Parcelamento em CUSTOS operacionais (Viver de IA 12x, Dell 12x, etc.)
-- Adiciona payment_schedule aos custos (igual às contas a receber) para o A Pagar V3 poder
-- EXPANDIR as parcelas, EDITAR cada uma e MARCAR como paga (persistido). Já aplicada em produção
-- via Management API em 2026-08-27; este arquivo é para rastreio/idempotência.

alter table finance.operational_costs add column if not exists payment_schedule jsonb;

-- fin_cost_upsert passa a persistir payment_schedule (mesmo padrão de amount_paid/payment_date).
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
      website=p->>'website', purpose=p->>'purpose', notes=p->>'notes', vinculo=coalesce(p->>'vinculo',vinculo),
      prev_monthly=case when p ? 'prev_monthly' then nullif(p->>'prev_monthly','')::numeric else prev_monthly end,
      amount_paid=case when p ? 'amount_paid' then coalesce((p->>'amount_paid')::numeric,amount_paid) else amount_paid end,
      payment_date=case when p ? 'payment_date' then nullif(p->>'payment_date','')::timestamptz else payment_date end,
      payment_schedule=case when p ? 'payment_schedule' then p->'payment_schedule' else payment_schedule end,
      updated_at=now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.operational_costs(vendor_name,description,category,currency,amount_original,exchange_rate,amount_brl,cost_type,cost_nature,recurrence,reference_date,next_payment_date,is_active,payment_method,website,purpose,notes,vinculo,prev_monthly,amount_paid,payment_date,payment_schedule)
    values (p->>'vendor_name',p->>'description',p->>'category',coalesce(p->>'currency','BRL'),coalesce((p->>'amount_original')::numeric,0),coalesce((p->>'exchange_rate')::numeric,1),coalesce((p->>'amount_brl')::numeric,0),p->>'cost_type',p->>'cost_nature',p->>'recurrence',nullif(p->>'reference_date','')::date,nullif(p->>'next_payment_date','')::date,coalesce((p->>'is_active')::boolean,true),p->>'payment_method',p->>'website',p->>'purpose',p->>'notes',p->>'vinculo',nullif(p->>'prev_monthly','')::numeric,coalesce((p->>'amount_paid')::numeric,0),nullif(p->>'payment_date','')::timestamptz,case when p ? 'payment_schedule' then p->'payment_schedule' else null end)
    returning id into v_id;
  end if;
  return v_id;
end $function$;
