-- 021 · Override de alocação de custo POR CLIENTE (por instância de módulo)
-- Cada instância em delivery.client_modules pode dizer quem paga o custo daquele processo:
--   NULL   = herda o padrão do serviço/módulo
--   absorvido   = Crasto.AI absorve
--   byo_cliente = cliente paga (usa a própria conta/API)
alter table delivery.client_modules add column if not exists cost_allocation text;
alter table delivery.client_modules drop constraint if exists client_modules_cost_allocation_check;
alter table delivery.client_modules
  add constraint client_modules_cost_allocation_check
  check (cost_allocation is null or cost_allocation = any (array['absorvido'::text, 'byo_cliente'::text]));
