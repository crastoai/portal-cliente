-- 062: Selo "sem NF" — rastrear recebíveis faturados SEM Nota Fiscal (transição de formalização).
-- Coluna has_nf (default false = sem NF, que é a realidade da fase de bootstrap informal).
-- fin_account_upsert passou a persistir has_nf (patch aplicado em produção via Management API 2026-08-31;
-- padrão dos demais upserts). O front (A Receber V3) mostra selo "sem NF"/"NF ✓" por linha (clicável p/
-- marcar quando emitir a nota) + faixa "Recebido sem NF" (total a formalizar).

alter table finance.accounts add column if not exists has_nf boolean default false;
