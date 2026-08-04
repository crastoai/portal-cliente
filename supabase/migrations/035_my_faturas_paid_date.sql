-- 035 — Cockpit · Contrato & Financeiro (Fase 3, item 3.1)
-- my_faturas() passa a devolver também paid_date (data real do pagamento) por parcela — para o
-- "pago em" da tabela do cliente. Mantém tudo o mais igual: 1 linha por parcela (payment_schedule),
-- fonte única finance.accounts, gate pode_ver_financeiro(). Nada removido.

-- muda o tipo de retorno (nova coluna paid_date) → precisa DROP antes (é chamada em runtime, sem dependência de DB).
drop function if exists public.my_faturas();
CREATE OR REPLACE FUNCTION public.my_faturas()
 RETURNS TABLE(id text, description text, amount numeric, due_date text, paid_date text, status text)
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
    case when p.ord is not null then nullif(p.elem->>'paid_date','') else to_char(a.payment_date,'YYYY-MM-DD') end,
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
    and public.pode_ver_financeiro()
  order by 4 nulls last;
$function$;
