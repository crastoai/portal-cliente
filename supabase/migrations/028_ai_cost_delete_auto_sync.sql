-- ============================================================================
-- 028 · RPC p/ zerar linhas auto-sync antes do re-sync (fix duplicação)
--
-- Contexto: o sync do Gemini agora grava 1 linha por PROJETO GCP no período (era 1 linha
-- agregada). Se o admin cadastra o mapeamento de um projeto DEPOIS do 1º sync, a próxima
-- rodada não sabe reaproveitar a linha antiga (dedup do gravar() é (provider,purpose,org))
-- e cria DUPLICATA (uma sem org, uma com org). Solução: apagar todas as linhas
-- purpose='auto-sync' do provedor no período ANTES de re-gravar — o sync é a fonte da
-- verdade daquele provedor no período, sempre reescreve limpo.
--
-- ⚠️ Só deleta 'auto-sync' — lançamentos manuais (purpose diferente) ficam intocados.
-- ============================================================================
create or replace function public.fin_ai_cost_delete_auto_sync(p_provider text, p_from date, p_to date)
returns int
language plpgsql security definer set search_path = public, finance
as $$
declare n int;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.ai_usage
    where provider = p_provider
      and purpose = 'auto-sync'
      and period_start = p_from
      and period_end = p_to;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.fin_ai_cost_delete_auto_sync(text, date, date) to authenticated;
