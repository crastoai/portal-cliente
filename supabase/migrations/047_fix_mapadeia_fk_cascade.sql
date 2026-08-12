-- 047 — Fix: excluir empresa falhava ("Erro ao apagar organização")
-- Pedido do Crasto (2026-08-12): o botão "Excluir empresa" (edge admin-delete-client) barrava porque
-- crm.mapadeia_submissions referenciava public.organizations SEM on delete cascade (NO ACTION) — o
-- DELETE da org violava a FK quando havia submissão do diagnóstico (Mapa de IA). Das 51 FKs que
-- apontam p/ organizations, só essa bloqueava de fato (profiles.id→auth.users já é CASCADE, então o
-- edge apaga o auth user e o profile some junto). Aqui torna a FK cascata (a submissão morre com a org).
-- Aditiva/idempotente. Já aplicada em prod via pg em 2026-08-12.

alter table crm.mapadeia_submissions drop constraint if exists mapadeia_submissions_organization_id_fkey;
alter table crm.mapadeia_submissions
  add constraint mapadeia_submissions_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;
