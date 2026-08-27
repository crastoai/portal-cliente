-- 048 — Financeiro: datas AUDITÁVEIS com hora + vínculo de pessoas (PJ/CLT/Terceirizado)
-- Aplicado em produção (Management API) em 2026-08-27. Este arquivo documenta/reproduz.
--
-- (A) DATAS COM HORA: due_date/payment_date de finance.accounts passam a timestamptz
--     (guardam dia/mês/ano + hora:min:seg). Registros antigos viram 00:00:00.
--     Impacto conferido: my_faturas (cliente) usa to_char → segue OK; org_health usa
--     billing.invoices.due_date (outra tabela) → não afetada; fin_cost_upsert mexe em
--     operational_costs (next_payment_date) → não afetada.
alter table finance.accounts alter column due_date     type timestamptz using due_date::timestamptz;
alter table finance.accounts alter column payment_date type timestamptz using payment_date::timestamptz;

-- fin_accounts: order by com tipos compatíveis (due_date agora timestamptz)
create or replace function public.fin_accounts(p_type text default null::text, p_status text default null::text)
 returns setof finance.accounts language sql stable security definer set search_path to 'public','finance'
as $FN$
  select * from finance.accounts
   where public.is_crasto_admin()
     and (p_type is null or account_type = p_type)
     and (p_status is null or status = p_status)
   order by coalesce(due_date, created_at) asc, created_at asc;
$FN$;

-- (B) VÍNCULO: coluna aditiva em custos e contas (PJ/CLT/Terceirizado) — Pessoas & prestadores.
alter table finance.operational_costs add column if not exists vinculo text;
alter table finance.accounts          add column if not exists vinculo text;

-- NOTA: fin_account_upsert e fin_cost_upsert foram atualizados em produção via Management API:
--   • fin_account_upsert: casts de due_date/payment_date trocados de ::date para ::timestamptz
--     (preserva a hora enviada, ex.: baixa carimba nowStamp()) + passa a gravar `vinculo`.
--   • fin_cost_upsert: passa a gravar `vinculo`.
-- (Os corpos completos vivem no banco; recriar aqui exigiria duplicar ~40 linhas de cada.)
