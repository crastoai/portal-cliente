-- ============================================================================
-- 009 · ANEXOS NO CHAMADO — o cliente manda print/imagem/PDF ao abrir o ticket
--
-- Pedido do Crasto (2026-07-24): no "Abrir ticket por e-mail", o cliente precisa poder anexar
-- prints — colando da área de transferência (Ctrl+V), escolhendo arquivo do computador ou
-- subindo imagem. Os arquivos sobem para o R2; aqui guardamos a referência no chamado para o
-- admin ver depois, e o e-mail interno de suporte leva os anexos de verdade (Resend).
-- ============================================================================
alter table support.tickets add column if not exists attachments jsonb;
comment on column support.tickets.attachments is 'Anexos do chamado: [{name, key}] — key = storage_path no R2 (URL assinada sob demanda).';
