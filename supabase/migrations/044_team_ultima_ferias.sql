-- 044: Data da última férias gozada (ficha RH · simulador demissional).
-- Usada para calcular férias VENCIDAS (períodos aquisitivos completos sem gozo) vs PROPORCIONAIS
-- na simulação de rescisão. Vazio → conta a partir da data de admissão. Só o dono edita (custo).
alter table public.team_members add column if not exists ultima_ferias date;

-- DOWN: alter table public.team_members drop column if exists ultima_ferias;
