-- 014 · CHECK de stage compatível com o front ANTIGO e o NOVO (expand-contract)
-- ---------------------------------------------------------------------------
-- A 013 apertou a CHECK para 4 estágios (prospecto/lead/oportunidade/cliente). Enquanto o
-- deploy do front novo não publica, o front ANTIGO ainda no ar manda a chave legada
-- `qualificado` (label "Oportunidade") → a CHECK estrita quebrava produção
-- ("new row violates check constraint organizations_stage_check").
-- Correção: CHACK ampla que aceita AMBOS os conjuntos durante a transição. Depois que o
-- front novo estiver 100% no ar (só manda `oportunidade`), migrar dados e voltar a apertar.
alter table public.organizations drop constraint if exists organizations_stage_check;
alter table public.organizations
  add constraint organizations_stage_check
  check (stage = any (array['contato'::text, 'prospecto'::text, 'lead'::text, 'qualificado'::text, 'oportunidade'::text, 'cliente'::text]));
