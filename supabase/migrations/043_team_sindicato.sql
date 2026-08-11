-- 043: Sindicato do colaborador (ficha RH · Fatia 4 · painel de impostos).
-- Campo informativo (o dono digita). NOTA: a contribuição sindical obrigatória foi extinta pela
-- Reforma Trabalhista (Lei 13.467/2017) — hoje só é devida com autorização expressa do trabalhador.
alter table public.team_members add column if not exists sindicato text;

-- DOWN: alter table public.team_members drop column if exists sindicato;
