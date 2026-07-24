-- ============================================================================
-- 008 · CONFIGURAR O CANAL DE SUPORTE PELO ADMIN — número de WhatsApp editável
--
-- Pedido do Crasto (2026-07-24): o número de suporte no WhatsApp (a Julie atende os clientes)
-- tem de ser CONFIGURÁVEL no admin — se um dia trocar de número, ele ajusta sem depender de
-- deploy. Hoje `finance.settings` (key/value) já guarda `support_whatsapp`, mas era só leitura
-- (business_settings()); não havia setter nem tela. Aqui entra o setter (admin) + o novo número.
-- ============================================================================

-- Garante chave única para o upsert (settings é key-value).
create unique index if not exists finance_settings_key_uidx on finance.settings (key);

-- Setter admin-only: grava um parâmetro de negócio (whitelist de chaves). Só crasto_admin.
create or replace function public.admin_set_business_setting(p_key text, p_value text)
returns void
language plpgsql security definer
set search_path to 'public', 'finance'
as $function$
begin
  if not public.is_crasto_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('support_whatsapp','support_email','pix_key','pix_beneficiary',
                   'tax_rate','commission_indicador','commission_conector') then
    raise exception 'invalid setting key: %', p_key;
  end if;
  insert into finance.settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $function$;
grant execute on function public.admin_set_business_setting(text, text) to authenticated;

-- Novo número do suporte (Julie) — formato E.164 sem +, pronto para wa.me. 11 91368-5973.
update finance.settings set value = '5511913685973', updated_at = now() where key = 'support_whatsapp';
insert into finance.settings (key, value, updated_at)
  select 'support_whatsapp', '5511913685973', now()
  where not exists (select 1 from finance.settings where key = 'support_whatsapp');
