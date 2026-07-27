-- 025 · Indicadores de PERSONA agregados (topo de Empresas), filtráveis por estágio.
-- Responde as perguntas do Crasto p/ montar avatar/campanhas: casados, filhos por idade/sexo,
-- homens/mulheres, aniversariantes do mês, parceiros. security definer + is_crasto_admin().
create or replace function public.admin_crm_persona_stats(p_stage text default null) returns json
    language plpgsql stable security definer
    set search_path to 'public', 'crm'
    as $$
declare r json;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  with orgs as (
    select o.id, o.stage, coalesce(o.papeis,'{}') as papeis
    from public.organizations o
    where (p_stage is null or p_stage = '' or o.stage = p_stage)
  ),
  ppl as (select p.* from crm.people p join orgs o on o.id = p.organization_id),
  fam as (
    select f.*, floor(extract(year from age(current_date, f.birthday)))::int as idade
    from crm.family_members f join orgs o on o.id = f.organization_id
    where f.birthday is not null
  )
  select json_build_object(
    'empresas',        (select count(*) from orgs),
    'contatos',        (select count(*) from ppl),
    'homens',          (select count(*) from ppl where genero = 'M'),
    'mulheres',        (select count(*) from ppl where genero = 'F'),
    'casados',         (select count(*) from ppl where estado_civil in ('casado','uniao')),
    'com_filhos',      (select count(*) from ppl where tem_filhos is true),
    'filhos_maior_5',  (select count(distinct person_id) from fam where relation = 'filho' and idade > 5),
    'filhos_maior_10', (select count(*) from fam where relation = 'filho' and idade > 10),
    'filhos_10_h',     (select count(*) from fam where relation = 'filho' and idade > 10 and sex = 'M'),
    'filhos_10_m',     (select count(*) from fam where relation = 'filho' and idade > 10 and sex = 'F'),
    'aniversario_mes', (select count(*) from ppl where birthday is not null and extract(month from birthday) = extract(month from current_date)),
    'parceiros',       (select count(*) from orgs where 'representante_comercial' = any(papeis) or 'indicador' = any(papeis))
  ) into r;
  return r;
end $$;
