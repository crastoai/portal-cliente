-- 061: Chave de PESSOA nos custos operacionais (agrupar "Pessoas & prestadores" por pessoa)
-- Um prestador pode ter >1 lançamento (ex.: Jhon = serviço R$4.350 + parcela Notebook Dell R$499,33).
-- A coluna `person` permite somar 1 linha por pessoa no A Pagar V3 e abrir o drill dos componentes REAIS
-- (cada componente é um custo de verdade, com seu próprio cronograma/vencimento). Aplicada em produção
-- via Management API em 2026-08-28; este arquivo é para rastreio/idempotência.

alter table finance.operational_costs add column if not exists person text;

-- fin_cost_upsert passa a persistir `person` (mesmo padrão de vinculo/prev_monthly/payment_schedule).
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
      person=case when p ? 'person' then nullif(p->>'person','') else person end,
      prev_monthly=case when p ? 'prev_monthly' then nullif(p->>'prev_monthly','')::numeric else prev_monthly end,
      amount_paid=case when p ? 'amount_paid' then coalesce((p->>'amount_paid')::numeric,amount_paid) else amount_paid end,
      payment_date=case when p ? 'payment_date' then nullif(p->>'payment_date','')::timestamptz else payment_date end,
      payment_schedule=case when p ? 'payment_schedule' then p->'payment_schedule' else payment_schedule end,
      updated_at=now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.operational_costs(vendor_name,description,category,currency,amount_original,exchange_rate,amount_brl,cost_type,cost_nature,recurrence,reference_date,next_payment_date,is_active,payment_method,website,purpose,notes,vinculo,person,prev_monthly,amount_paid,payment_date,payment_schedule)
    values (p->>'vendor_name',p->>'description',p->>'category',coalesce(p->>'currency','BRL'),coalesce((p->>'amount_original')::numeric,0),coalesce((p->>'exchange_rate')::numeric,1),coalesce((p->>'amount_brl')::numeric,0),p->>'cost_type',p->>'cost_nature',p->>'recurrence',nullif(p->>'reference_date','')::date,nullif(p->>'next_payment_date','')::date,coalesce((p->>'is_active')::boolean,true),p->>'payment_method',p->>'website',p->>'purpose',p->>'notes',p->>'vinculo',nullif(p->>'person',''),nullif(p->>'prev_monthly','')::numeric,coalesce((p->>'amount_paid')::numeric,0),nullif(p->>'payment_date','')::timestamptz,case when p ? 'payment_schedule' then p->'payment_schedule' else null end)
    returning id into v_id;
  end if;
  return v_id;
end $function$;
