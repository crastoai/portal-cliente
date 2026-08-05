-- ============================================================================
-- 036 — FIX CRÍTICO: grants faltando em client_baseline e cockpit_narrative
-- ----------------------------------------------------------------------------
-- As migrations 032 (client_baseline) e 033 (cockpit_narrative) criaram as tabelas
-- COM políticas RLS, mas SEM os GRANTs de tabela. No Postgres, RLS filtra LINHAS, mas
-- o acesso à TABELA depende de GRANT — sem ele, o role `authenticated` recebe
-- "permission denied for table ...".
--
-- Efeito do bug: o bloco asUser do cockpitMine (GET /delivery/cockpit/mine) lia
-- client_baseline como authenticated → estourava → o `.catch(() => { orgId: null })`
-- zerava a org → o Cockpit inteiro vinha VAZIO para TODO cliente (identity null,
-- métricas null, "aguardando atividade"), mesmo com dado real no banco.
--
-- Correção: conceder os grants no MESMO padrão das demais tabelas de delivery
-- (ex.: 005_implementation_events). A RLS continua filtrando as linhas por org.
-- ============================================================================

grant select on table delivery.client_baseline to authenticated;
grant select, insert, update, delete on table delivery.client_baseline to service_role;

grant select on table delivery.cockpit_narrative to authenticated;
grant select, insert, update, delete on table delivery.cockpit_narrative to service_role;

-- E o mesmo problema em crm.company_partners: o Cockpit lê o CARGO (fallback de sócio) via
-- asService (service_role), mas a tabela não tinha grant p/ service_role → "permission denied"
-- → o bloco identity estourava → etiqueta empresa/cargo sumia. (crm.people já tinha o grant.)
grant select on table crm.company_partners to service_role;
