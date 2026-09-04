-- ============================================================================
-- 066 · AUTO-RECURRENCE: trigger que infere recurrence quando é null/vazio
--
-- Regra: se recurrence não foi fornecido, deduz dos dados do contrato:
--   • payment_installments > 1 E contract_validity_value > 0
--     com unidade mensal (meses/months) → 'mensal'
--   • contract_validity_unit = 'years' → 'anual'
--   • senão → 'pontual'
--
-- Garante que TODA conta inserida (RPC, Julie, INSERT direto) tenha o
-- campo preenchido, eliminando o bug de conta recorrente que não aparece
-- no MRR por falta de recurrence.
-- ============================================================================

create or replace function finance.auto_recurrence()
returns trigger language plpgsql as $$
begin
  if nullif(trim(new.recurrence), '') is null then
    if new.payment_installments > 1
       and coalesce(new.contract_validity_value, 0) > 0
       and lower(coalesce(new.contract_validity_unit, '')) in ('meses', 'months', 'month')
    then
      new.recurrence := 'mensal';
    elsif lower(coalesce(new.contract_validity_unit, '')) in ('years', 'year', 'anos')
    then
      new.recurrence := 'anual';
    else
      new.recurrence := 'pontual';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_recurrence on finance.accounts;
create trigger trg_auto_recurrence
  before insert or update on finance.accounts
  for each row execute function finance.auto_recurrence();
