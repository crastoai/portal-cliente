-- 046 · Funil padronizado (eixo 2, Portal): 'cliente' → 'ganho' + adiciona 'perdido'
-- Alinha organizations.stage ao funil canônico Prospecto → Lead → Oportunidade → Ganho → Perdido
-- (mesmo do kanban de deals do wacrm). Padrão expand-contract da migration 019.
--
-- ⚠️ APLICAÇÃO EM 2 FASES (o front usa STAGES de countries.ts; stageOf() cai p/ Prospecto quando a
--    key não casa — então o rename de dado e o deploy do código têm que se cruzar sem janela):
--   FASE A (ANTES do deploy do web): rodar só o bloco EXPAND — passa a aceitar 'ganho'/'perdido'
--     SEM ainda migrar o dado (o código velho, ainda no ar, continua gravando 'cliente', que segue válido).
--   FASE B (LOGO APÓS o deploy do web novo): rodar o UPDATE + o bloco CONTRACT — migra as linhas
--     'cliente' → 'ganho' e reaperta a CHECK no conjunto final de 5 etapas.

-- ─────────────────────────── FASE A · EXPAND (antes do deploy) ───────────────────────────
-- CHECK transitória: aceita as 4 antigas + as 2 novas ao mesmo tempo (aditiva, não migra dado).
alter table public.organizations drop constraint if exists organizations_stage_check;
alter table public.organizations
  add constraint organizations_stage_check
  check (stage = any (array['prospecto'::text, 'lead'::text, 'oportunidade'::text, 'cliente'::text, 'ganho'::text, 'perdido'::text]));

-- ─────────────────── FASE B · MIGRA DADO + CONTRACT (após o deploy do web) ───────────────────
-- 1) Renomeia a etapa ganha: toda org 'cliente' vira 'ganho' (medido: 5 linhas em 2026-08-12).
update public.organizations set stage = 'ganho' where stage = 'cliente';

-- 2) Reaperta a CHECK no conjunto FINAL de 5 etapas (sai 'cliente'; entram 'ganho' e 'perdido').
alter table public.organizations drop constraint if exists organizations_stage_check;
alter table public.organizations
  add constraint organizations_stage_check
  check (stage = any (array['prospecto'::text, 'lead'::text, 'oportunidade'::text, 'ganho'::text, 'perdido'::text]));
