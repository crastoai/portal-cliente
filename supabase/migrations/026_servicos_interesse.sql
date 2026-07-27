-- 026 · Serviços como "linha do negócio" que evolui: INTERESSE (lead) → PROPOSTA → CONTRATADO (cliente)
-- Reusa delivery.client_services (já é o "Serviços contratados" do cliente). Aditivo/reversível.
-- Best practice de CRM: um único registro por serviço-do-negócio que muda de situação conforme o funil.
alter table delivery.client_services
  add column if not exists situacao        text not null default 'contratado',  -- interesse | proposta | contratado
  add column if not exists periodo         text,   -- ex.: "6 meses", "12 meses"
  add column if not exists modalidade      text,   -- ex.: "Serviço (Crasto opera)", "Híbrido", "Cliente opera (BYO)"
  add column if not exists cost_allocation text,   -- absorvido (Crasto) | byo_cliente (cliente assume o custo de IA)
  add column if not exists especificacoes  text;   -- detalhes livres do serviço p/ este cliente

alter table delivery.client_services drop constraint if exists client_services_situacao_check;
alter table delivery.client_services
  add constraint client_services_situacao_check check (situacao = any (array['interesse'::text,'proposta'::text,'contratado'::text]));

comment on column delivery.client_services.situacao is 'Fase do serviço no funil: interesse (lead) → proposta → contratado (cliente).';
