-- ============================================================================
-- 007 · FINANCEIRO SÓ PARA QUEM PODE — proteger o dado, não só esconder o menu
--
-- Ponto de máxima atenção (Crasto, 2026-07-24): a tela "Início" do portal agrega o financeiro
-- do dono. Esconder o menu para o membro NÃO bastava — `my_faturas()` liberava as faturas para
-- QUALQUER membro da org (só checava a org, não o papel). Um membro podia puxar o financeiro
-- chamando a API direto. Aqui fechamos no banco.
--
-- Regra escolhida pelo Crasto: "segue a permissão Financeiro". O DONO (client_owner) e o admin
-- (crasto_admin) sempre veem; um membro só vê se o dono liberar a tela 'financeiro' para ele
-- (public.member_screens). É o mesmo controle que já existe no permissionamento.
-- ============================================================================
create or replace function public.pode_ver_financeiro()
returns boolean
language sql stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('client_owner','crasto_admin'))
      or exists (select 1 from public.member_screens where user_id = auth.uid() and screen_key = 'financeiro');
$function$;
grant execute on function public.pode_ver_financeiro() to authenticated;

-- Recria my_faturas() com o mesmo corpo de antes + o portão: sem permissão financeira → 0 linhas.
create or replace function public.my_faturas()
 returns table(id text, description text, amount numeric, due_date text, status text)
 language sql stable security definer
 set search_path to 'public', 'finance'
as $function$
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
    and public.pode_ver_financeiro()      -- ← portão: membro sem a tela 'financeiro' recebe nada
  order by 4 nulls last;
$function$;
