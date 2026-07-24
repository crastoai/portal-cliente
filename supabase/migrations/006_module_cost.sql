-- ============================================================================
-- 006 · CUSTO POR MÓDULO + DATA DO CONTRATO — "mais detalhes" da solução
--
-- Pedido do Crasto (2026-07-24): no card de implantação, um "mais detalhes" que abre o
-- detalhe do sistema com o CUSTO por módulo, a DATA do contrato daquele módulo e as notas/
-- minutas ligadas. Aqui entram os campos de custo e data no próprio client_modules (instância).
--
-- Regra do Crasto: só dado REAL. Campos nascem nulos; o cliente vê "—" enquanto a Crasto.AI
-- não preencher — nunca um número inventado.
-- ============================================================================
alter table delivery.client_modules add column if not exists monthly_cost  numeric(12,2);  -- custo mensal (R$/mês)
alter table delivery.client_modules add column if not exists setup_cost    numeric(12,2);  -- custo de implantação/setup (uma vez)
alter table delivery.client_modules add column if not exists contract_date date;            -- data do contrato daquele módulo

comment on column delivery.client_modules.monthly_cost is 'Custo mensal do módulo (R$/mês). Nulo = não informado (cliente vê "—").';
comment on column delivery.client_modules.setup_cost   is 'Custo de implantação/setup do módulo (uma vez). Nulo = não informado.';
comment on column delivery.client_modules.contract_date is 'Data do contrato daquele módulo.';
