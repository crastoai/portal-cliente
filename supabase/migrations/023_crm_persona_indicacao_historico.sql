-- 023 · CRM completo: persona do contato, familiares, indicação por pessoa, endereço, histórico de campo
-- =====================================================================================================
-- Decisão Crasto 2026-07-27 (ficha única de Empresa). TUDO aditivo/reversível (IF NOT EXISTS, sem DROP de dados).
-- Objetivo: transformar o cadastro num CRM que responde perguntas (persona/avatar p/ campanhas):
--   "quantos homens/mulheres assinaram", idades, regiões, casados, filhos por sexo/idade, aniversários.

-- 1) crm.people — dados de PERSONA do contato (sexo/gênero, estado civil, filhos, orientação, interesses,
--    e-mail/telefone pessoal além do profissional, redes sociais). role/email/emails[]/birthday/funcao já existem.
alter table crm.people
  add column if not exists genero        text,     -- 'M' | 'F' (sexo/gênero de nascimento) — p/ persona/avatar
  add column if not exists orientacao    text,     -- 'hetero' | 'homo'
  add column if not exists estado_civil  text,     -- solteiro/casado/uniao/divorciado/viuvo
  add column if not exists tem_filhos    boolean,
  add column if not exists num_filhos    int,
  add column if not exists interesses    text,      -- hobby / time / o que gosta (vínculo de CRM)
  add column if not exists email_pessoal text,      -- `email` = profissional; este = pessoal (não perder o contato)
  add column if not exists socials       jsonb not null default '[]'::jsonb;  -- [{"rede":"Instagram","handle":"@x"}]

alter table crm.people drop constraint if exists people_genero_check;
alter table crm.people add constraint people_genero_check check (genero is null or genero = any (array['M'::text,'F'::text]));
alter table crm.people drop constraint if exists people_orientacao_check;
alter table crm.people add constraint people_orientacao_check check (orientacao is null or orientacao = any (array['hetero'::text,'homo'::text]));
alter table crm.people drop constraint if exists people_estado_civil_check;
alter table crm.people add constraint people_estado_civil_check check (estado_civil is null or estado_civil = any (array['solteiro'::text,'casado'::text,'uniao'::text,'divorciado'::text,'viuvo'::text]));
comment on column crm.people.genero is 'Sexo/gênero de nascimento (M/F) do contato — base de persona/avatar para campanhas.';

-- 2) crm.family_members — familiares do contato (cônjuge/filhos): nome, parentesco, SEXO, nascimento→idade.
--    Estruturado p/ consulta: "clientes com filha > 10", "filhos homem/mulher", etc.
create table if not exists crm.family_members (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references crm.people(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name            text,
  relation        text,   -- conjuge/filho/filha/pai/mae/socio/outro
  sex             text,   -- 'M' | 'F'
  birthday        date,
  created_at      timestamptz not null default now()
);
alter table crm.family_members drop constraint if exists family_members_sex_check;
alter table crm.family_members add constraint family_members_sex_check check (sex is null or sex = any (array['M'::text,'F'::text]));
create index if not exists family_members_person_idx on crm.family_members(person_id);
create index if not exists family_members_org_idx on crm.family_members(organization_id);
alter table crm.family_members enable row level security;
drop policy if exists family_members_admin_all on crm.family_members;
create policy family_members_admin_all on crm.family_members using (public.is_crasto_admin()) with check (public.is_crasto_admin());
grant select, insert, update, delete on crm.family_members to authenticated, service_role;
comment on table crm.family_members is 'Familiares do contato (INTERNO, RLS admin). Persona/CRM: parentesco+sexo+nascimento→idade para KPIs.';

-- 3) crm.org_referral — indicação por PESSOA (não só empresa), grau de relação, canal e endereço do encontro.
alter table crm.org_referral
  add column if not exists indicado_por_pessoa_nome     text,
  add column if not exists indicado_por_pessoa_email    text,
  add column if not exists indicado_por_pessoa_telefone text,
  add column if not exists grau_relacao                 text,  -- filho_do_dono/amigo/parente/socio/cliente/amigo_de_amigo
  add column if not exists canal                        text,  -- presencial/telefone/videochamada/rede_social/site/evento
  add column if not exists rede_social                  text,  -- se canal=rede_social: instagram/linkedin/whatsapp...
  add column if not exists endereco_encontro            text;  -- onde estava quando indicou (ex.: Av. Paulista 468)
comment on column crm.org_referral.endereco_encontro is 'Local físico do encontro/indicação — opcional (ex.: Av. Paulista, 468, SP).';

-- 4) crm.company_cnpjs — endereço ESTRUTURADO (logradouro/número/bairro). CEP/cidade/UF/país já existem.
alter table crm.company_cnpjs
  add column if not exists logradouro text,
  add column if not exists numero     text,
  add column if not exists bairro     text;

-- 5) crm.field_history — histórico de campo (o dado do site fica imutável; ao Editar, o antigo vira histórico).
create table if not exists crm.field_history (
  id         uuid primary key default gen_random_uuid(),
  entity     text not null,        -- 'organization' | 'person'
  entity_id  uuid not null,
  field      text not null,        -- ex.: 'faturamento', 'segmento'
  old_value  text,
  new_value  text,
  source     text,                 -- 'site' | 'admin'
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists field_history_entity_idx on crm.field_history(entity, entity_id, field, changed_at desc);
alter table crm.field_history enable row level security;
drop policy if exists field_history_admin_all on crm.field_history;
create policy field_history_admin_all on crm.field_history using (public.is_crasto_admin()) with check (public.is_crasto_admin());
grant select, insert, update, delete on crm.field_history to authenticated, service_role;
comment on table crm.field_history is 'Trilha de alterações de campo (persona/perfil). Valor do site = registro imutável; edição gera nova versão e preserva a antiga.';

-- ROLLBACK (referência, nada destrutivo é feito aqui):
--   drop table crm.field_history; drop table crm.family_members;
--   alter table crm.people drop column genero, drop column orientacao, ... ; etc.
