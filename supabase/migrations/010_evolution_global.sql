-- ============================================================================
-- 010 · EVOLUTION API GLOBAL NO PORTAL — URL + API key global saem do console (por agente)
--       e viram uma integração global do Portal, puxada pelo wacrm no envio.
--
-- Pedido do Crasto (2026-07-24): cadastrar a Evolution API URL + AUTHENTICATION_API_KEY UMA vez,
-- no Portal → Integrações & pagamentos (como Resend/R2/etc.). O console deixa de pedir URL/chave
-- por agente; ao escolher Evolution, o wacrm puxa a chave global daqui. Só a INSTÂNCIA fica por
-- agente. Reusa o cofre (Vault) e o padrão reveal_provider_key que o wacrm já consome (LLM).
-- ============================================================================

-- Card na tela de Integrações (o set_provider_secret também criaria no 1º save, mas assim o
-- card já aparece para o admin configurar).
insert into automation.integrations (key, display_name, status)
  values ('evolution', 'Evolution API', 'disconnected')
  on conflict (key) do nothing;

-- Leitura service-to-service para o wacrm: URL (não-secreta, em integration_configs.from_addr) +
-- API key global (do Vault). Mesmo molde/seguranca da reveal_provider_key (só service_role).
create or replace function public.reveal_evolution_global()
returns json
language sql stable security definer
set search_path to 'public', 'automation', 'vault'
as $function$
  select json_build_object(
    'url', (select from_addr from automation.integration_configs where key = 'evolution'),
    'key', (select ds.decrypted_secret
              from automation.integrations i
              join vault.decrypted_secrets ds on ds.name = i.vault_secret_name
             where i.key = 'evolution' and i.vault_secret_name is not null
             limit 1)
  );
$function$;
revoke all on function public.reveal_evolution_global() from public;
grant execute on function public.reveal_evolution_global() to service_role;
