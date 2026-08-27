-- 059 · admin_crm_persona_stats: adiciona `mapa` (UF + status por empresa) e `sem_uf`,
-- para o mapa do Brasil com bolinhas por status. Remove nada; corpo da 053 + status na CTE.
create or replace function public.admin_crm_persona_stats(p_stage text default null) returns json
    language plpgsql stable security definer set search_path to 'public', 'crm'
    as $$
declare r json;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  with orgs as (
    select o.id, o.stage, coalesce(o.papeis,'{}') as papeis, o.segmento, o.uf, o.country, o.is_ngo, o.status
    from public.organizations o
    where (p_stage is null or p_stage = '' or o.stage = p_stage)
  ),
  ppl as (select p.* from crm.people p join orgs o on o.id = p.organization_id),
  fam as (
    select f.*, floor(extract(year from age(current_date, f.birthday)))::int as idade
    from crm.family_members f join orgs o on o.id = f.organization_id
    where f.birthday is not null
  ),
  regs as (
    select case
      when uf = any(array['AC','AP','AM','PA','RO','RR','TO']) then 'Norte'
      when uf = any(array['AL','BA','CE','MA','PB','PE','PI','RN','SE']) then 'Nordeste'
      when uf = any(array['DF','GO','MT','MS']) then 'Centro-Oeste'
      when uf = any(array['ES','MG','RJ','SP']) then 'Sudeste'
      when uf = any(array['PR','RS','SC']) then 'Sul'
      else 'Não informado' end as regiao
    from orgs
  )
  select json_build_object(
    'empresas',        (select count(*) from orgs),
    'contatos',        (select count(*) from ppl),
    'homens',          (select count(*) from ppl where genero = 'M'),
    'mulheres',        (select count(*) from ppl where genero = 'F'),
    'casados',         (select count(*) from ppl where estado_civil in ('casado','uniao')),
    'solteiros',       (select count(*) from ppl where estado_civil is not null and estado_civil not in ('casado','uniao')),
    'com_filhos',      (select count(*) from ppl where tem_filhos is true),
    'sem_filhos',      (select count(*) from ppl where tem_filhos is false),
    'filhos_maior_16', (select count(*) from fam where relation = 'filho' and idade >= 16),
    'filhos_menor_16', (select count(*) from fam where relation = 'filho' and idade < 16),
    'aniversario_mes', (select count(*) from ppl where birthday is not null and extract(month from birthday) = extract(month from current_date)),
    'parceiros',       (select count(*) from orgs where 'representante_comercial' = any(papeis) or 'indicador' = any(papeis)),
    'ongs',            (select count(*) from orgs where is_ngo is true),
    'nichos',          (select coalesce(json_agg(json_build_object('k', k, 'v', v) order by v desc), '[]'::json)
                        from (select coalesce(nullif(segmento,''),'Não informado') as k, count(*) v from orgs group by 1) a),
    'paises',          (select coalesce(json_agg(json_build_object('k', k, 'v', v) order by v desc), '[]'::json)
                        from (select coalesce(country,'—') as k, count(*) v from orgs group by 1) b),
    'regioes',         (select coalesce(json_agg(json_build_object('k', regiao, 'v', v) order by v desc), '[]'::json)
                        from (select regiao, count(*) v from regs group by 1) c),
    'mapa',            (select coalesce(json_agg(json_build_object('uf', uf, 'status',
                          case when stage='ganho' and coalesce(status,'active')='active' then 'ativo'
                               when stage='ganho' then 'inativo'
                               when stage='prospecto' then 'prospecto'
                               when stage='lead' then 'lead'
                               when stage='oportunidade' then 'oportunidade'
                               when stage='perdido' then 'perdido' else 'outro' end)), '[]'::json)
                        from orgs where uf is not null),
    'sem_uf',          (select count(*) from orgs where uf is null)
  ) into r;
  return r;
end $$;
