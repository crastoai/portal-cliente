-- 034 — Cockpit · Entregas & Implantação (Fase 2, item 2.1)
-- Para o Gantt planejado×realizado POR SOLUÇÃO faltavam dois eixos em delivery.client_modules:
--   • rollout_start  = INÍCIO da implantação da solução (planejado/real)
--   • delivered_at   = ENTREGA REAL com data+HORA (o "realizado")
-- Já existiam: rollout_due (previsão de entrega), rollout_progress (%), rollout_status (andamento).
-- O farol de prazo (verde/amarelo/vermelho) e a barra planejado×realizado são DERIVADOS no front
-- (previsão × hoje × progresso/entrega) — nada fictício.

alter table delivery.client_modules add column if not exists rollout_start date;
alter table delivery.client_modules add column if not exists delivered_at   timestamptz;
comment on column delivery.client_modules.rollout_start is 'Início da implantação da solução (eixo do Gantt).';
comment on column delivery.client_modules.delivered_at  is 'Entrega real da solução (data+hora) — o "realizado".';

-- Conveniência: ao marcar rollout_status='delivered' sem delivered_at, carimba a hora da entrega.
-- (o admin ainda pode informar a data/hora exata; isto só evita "entregue sem quando".)
create or replace function delivery.stamp_delivered() returns trigger language plpgsql as $$
begin
  if new.rollout_status = 'delivered' and new.delivered_at is null
     and (tg_op = 'INSERT' or coalesce(old.rollout_status,'') <> 'delivered') then
    new.delivered_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_stamp_delivered on delivery.client_modules;
create trigger trg_stamp_delivered before insert or update on delivery.client_modules
  for each row execute function delivery.stamp_delivered();
