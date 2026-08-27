-- 056 · FIX — grants de service_role nas tabelas novas de automation.
-- O backend (RlsDbService.asService) roda `set local role service_role`. As tabelas criadas nas
-- migrations 051/052/055 só tinham grant p/ postgres → SELECT/INSERT davam 500 (motor, wa_instances,
-- webhook). Alinha com automation.integration_configs (que já tinha service_role). Idempotente.
grant usage on schema automation to service_role;
grant select, insert, update, delete on automation.app_settings     to service_role;
grant select, insert, update, delete on automation.automation_rules  to service_role;
grant select, insert, update, delete on automation.reminders         to service_role;
grant select, insert, update, delete on automation.wa_instances      to service_role;
grant select, insert, update, delete on automation.dispatch_log      to service_role;
