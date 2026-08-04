-- 031 — Financeiro: modelo contrato + comprovante + multa (ITEM 1 do pedido do Crasto 2026-08-04)
-- Coleta 2 dados: (a) CONTRATO (data de assinatura + previsão via payment_schedule.origin_date)
--                 (b) COMPROVANTE de pagamento (data real + anexo) por parcela.
-- Nível CONTA: nova coluna contract_signed_date (data de assinatura do contrato).
-- Nível PARCELA (dentro do jsonb payment_schedule, sem migração — jsonb aceita campos livres):
--   installment       int      nº da parcela
--   date              date(iso) VENCIMENTO (ajustável à mão)         ← já existe
--   origin_date       date(iso) VENCIMENTO conforme o CONTRATO       ← já existe (log contrato-vs-manual)
--   amount            numeric  valor da parcela                       ← já existe
--   origin_amount     numeric  valor conforme o contrato              ← já existe
--   status            text     pending|paid|cancelled                 ← já existe
--   paid_date         date(iso) data REAL do pagamento (do comprovante)         ← NOVO
--   proof_url         text     link/anexo do comprovante                        ← NOVO
--   proof_note        text     observação do comprovante (ex.: "PIX 13/09")     ← NOVO
--   penalty_amount    numeric  multa aplicada (0 = nenhuma)                      ← NOVO
--   penalty_waived    bool     true = houve atraso mas você decidiu NÃO cobrar   ← NOVO
--   (late_days é DERIVADO em tempo de leitura: paid_date - date, se > 0)

alter table finance.accounts add column if not exists contract_signed_date date;
comment on column finance.accounts.contract_signed_date is 'Data de assinatura do contrato (âncora da previsão de recebimentos).';

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
      contract_signed_date = case when p ? 'contract_signed_date' then nullif(p->>'contract_signed_date','')::date else contract_signed_date end,
      payment_installments = case when p ? 'payment_installments' then nullif(p->>'payment_installments','')::int else payment_installments end,
      payment_day_of_month = case when p ? 'payment_day_of_month' then nullif(p->>'payment_day_of_month','')::int else payment_day_of_month end,
      payment_reason = case when p ? 'payment_reason' then p->>'payment_reason' else payment_reason end,
      payment_schedule = case when p ? 'payment_schedule' then coalesce(p->'payment_schedule','[]'::jsonb) else payment_schedule end,
      notes        = case when p ? 'notes'        then p->>'notes' else notes end,
      updated_at   = now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.accounts(account_type,description,category,amount,amount_paid,due_date,payment_date,payment_method,status,recurrence,invoice_number,contact_name,contact_reference,organization_id,expense_type,notes,services,contract_validity_value,contract_validity_unit,contract_total,contract_signed_date,payment_installments,payment_day_of_month,payment_reason,payment_schedule)
    values (p->>'account_type',p->>'description',p->>'category',coalesce((p->>'amount')::numeric,0),coalesce((p->>'amount_paid')::numeric,0),nullif(p->>'due_date','')::date,nullif(p->>'payment_date','')::date,p->>'payment_method',coalesce(p->>'status','pending'),p->>'recurrence',p->>'invoice_number',p->>'contact_name',p->>'contact_reference',nullif(p->>'organization_id','')::uuid,p->>'expense_type',p->>'notes',coalesce(p->'services','[]'::jsonb),nullif(p->>'contract_validity_value','')::int,p->>'contract_validity_unit',nullif(p->>'contract_total','')::numeric,nullif(p->>'contract_signed_date','')::date,nullif(p->>'payment_installments','')::int,nullif(p->>'payment_day_of_month','')::int,p->>'payment_reason',coalesce(p->'payment_schedule','[]'::jsonb))
    returning id into v_id;
  end if;
  return v_id;
end $function$;
