-- 053 · CRM — ICP / Avatar (Tarefa C)
-- Campos p/ nichos e localidade + ONG, e a RPC de persona estendida (sexo, casados/solteiros,
-- filhos tem/não + >16/<16, aniversários, parceiros, ONGs, nichos [pizza], países e regiões).
-- Aditivo/reversível. Segmento/UF ficam EDITÁVEIS (inline na ficha) — semeio os conhecidos.

alter table public.organizations
  add column if not exists segmento text,
  add column if not exists uf       text,
  add column if not exists is_ngo   boolean not null default false;

comment on column public.organizations.segmento is 'CRM: nicho/segmento do cliente (pizza de nichos). Editável.';
comment on column public.organizations.uf       is 'CRM: UF (2 letras) p/ localidade/região. Editável.';
comment on column public.organizations.is_ngo   is 'CRM: é ONG / terceiro setor.';

-- Seed dos nichos conhecidos (o Crasto ajusta/expande depois).
update public.organizations set segmento='Jurídico' where name in ('Carneiro de Souza Advogados','Ka Almeida Advogados','Jose Pereira Leal Jr Advogados') or name ilike 'FLSS%';
update public.organizations set segmento='Seguros / Saúde' where name ilike 'SR BRASIL%' or name='JSX Brokers';
update public.organizations set segmento='Indústria (tintas/plásticos)' where name='Fremplast';
update public.organizations set segmento='Energia solar' where name='Connect';
update public.organizations set segmento='Varejo / Moda' where name ilike '%El Shadai%';
update public.organizations set segmento='Logística' where name in ('Infinity Cargo','LPC');
update public.organizations set segmento='Consultoria' where name in ('JD Consultores') or name ilike 'Horizon Consulting%';
update public.organizations set segmento='Investimentos / Financeiro' where name='Elite Capital';
update public.organizations set segmento='Serviços / Terceirização' where name ilike 'JJ Serviços%';
update public.organizations set segmento='Tecnologia / IA' where name ilike 'Crasto.AI';
update public.organizations set segmento='ONG / Terceiro setor', is_ngo=true where name ilike 'Lar Vovo%';

-- UF conhecidas (só as confiáveis; o resto fica p/ preencher).
update public.organizations set uf='SP' where name ilike 'JJ Serviços%' or name='Fremplast' or name='Connect';

-- RPC de persona estendida (ICP/Avatar).
create or replace function public.admin_crm_persona_stats(p_stage text default null) returns json
    language plpgsql stable security definer set search_path to 'public', 'crm'
    as $$
declare r json;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  with orgs as (
    select o.id, o.stage, coalesce(o.papeis,'{}') as papeis, o.segmento, o.uf, o.country, o.is_ngo
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
                        from (select regiao, count(*) v from regs group by 1) c)
  ) into r;
  return r;
end $$;
