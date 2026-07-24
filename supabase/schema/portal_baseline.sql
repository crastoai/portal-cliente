--
-- PostgreSQL database dump
--

\restrict ovJ14ZKd4m0ZddNOKJaeOzzjNObbeYrHWZx9gs3eN9Y8mYNNydPuWtxPyDSGMNx

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: agents; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA agents;


--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA audit;


--
-- Name: automation; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA automation;


--
-- Name: billing; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA billing;


--
-- Name: catalog; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA catalog;


--
-- Name: commerce; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA commerce;


--
-- Name: crm; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA crm;


--
-- Name: delivery; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA delivery;


--
-- Name: finance; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA finance;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: support; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA support;


--
-- Name: whatsapp; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA whatsapp;


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'crasto_admin',
    'client_owner',
    'client_member',
    'connector'
);


--
-- Name: log(text, text, text, uuid, jsonb); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.log(p_action text, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_org uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'audit'
    AS $$
declare v_id uuid;
begin
  insert into audit.events(actor_id, actor_email, action, target_type, target_id, organization_id, context)
  values (auth.uid(), nullif(auth.jwt()->>'email',''), p_action, p_target_type, p_target_id, p_org, coalesce(p_context,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;


--
-- Name: log_as(uuid, text, text, text, text, uuid, jsonb, text, text); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.log_as(p_actor uuid, p_actor_email text, p_action text, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_org uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT '{}'::jsonb, p_system text DEFAULT 'portal'::text, p_ip text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'audit'
    AS $$
declare v_id uuid;
begin
  insert into audit.events(actor_id, actor_email, action, target_type, target_id, organization_id, context, system, ip)
  values (p_actor, nullif(p_actor_email,''), p_action, p_target_type, p_target_id, p_org,
          coalesce(p_context,'{}'::jsonb), coalesce(nullif(p_system,''),'portal'), nullif(p_ip,''))
  returning id into v_id;
  return v_id;
end $$;


--
-- Name: no_mutate(); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.no_mutate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin raise exception 'audit.events e append-only (imutavel)'; end $$;


--
-- Name: set_provider_secret(text, text); Type: FUNCTION; Schema: automation; Owner: -
--

CREATE FUNCTION automation.set_provider_secret(p_key text, p_secret text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'automation', 'vault', 'public'
    AS $$
declare v_name text; v_id uuid;
begin
  if coalesce(p_secret,'') = '' then return; end if;
  insert into automation.integrations(key, display_name, status)
    values (p_key, initcap(p_key), 'connected')
    on conflict (key) do nothing;
  select vault_secret_name into v_name from automation.integrations where key = p_key;
  v_name := coalesce(v_name, 'int_' || p_key);
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret, v_name, 'Chave de integra��o/LLM (' || p_key || ')');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  update automation.integrations
     set vault_secret_name = v_name, status = 'connected', updated_at = now()
   where key = p_key;
end $$;


--
-- Name: add_my_document(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_my_document(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
declare v_org uuid; v_id uuid;
begin
  select organization_id into v_org from public.profiles where id=auth.uid();
  if v_org is null then raise exception 'sem organizacao'; end if;
  insert into crm.documents(organization_id, kind, file_name, storage_path)
  values (v_org, coalesce(p->>'kind','outro'), p->>'file_name', p->>'storage_path') returning id into v_id;
  return v_id;
end $$;


--
-- Name: admin_accept_proposal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_accept_proposal(p_proposal_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'commerce', 'finance'
    AS $$
declare v commerce.proposals%rowtype; v_pct numeric(5,2);
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  select * into v from commerce.proposals where id = p_proposal_id;
  if not found then raise exception 'proposal not found'; end if;
  if v.status = 'accepted' then return json_build_object('ok', true, 'already', true); end if;

  update commerce.proposals set status = 'accepted', accepted_at = now() where id = p_proposal_id;

  -- o "plano" do cliente passa a ser o da proposta ganha
  update public.organizations set plan = coalesce(nullif(v.title, ''), plan), updated_at = now()
   where id = v.organization_id;

  -- comissão do agente indicador (se a proposta tiver um)
  if v.connector_id is not null then
    select commission_default into v_pct from public.connectors where id = v.connector_id;
    insert into finance.commissions (organization_id, connector_id, proposal_id, sale_amount, percent)
    values (v.organization_id, v.connector_id, v.id, coalesce(v.subtotal, 0), coalesce(v_pct, 0));
  end if;

  return json_build_object('ok', true, 'organization_id', v.organization_id, 'subtotal', v.subtotal);
end $$;


--
-- Name: admin_access_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_access_list() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return json_build_object(
    'platform', (
      select coalesce(json_agg(json_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'role',p.role,
        'last_login',(select u.last_sign_in_at from auth.users u where u.id=p.id)) order by p.full_name), '[]'::json)
      from public.profiles p where p.role='crasto_admin'
    ),
    'clients', (
      select coalesce(json_agg(json_build_object(
        'organization_id', o.id, 'name', o.name,
        'users', (select coalesce(json_agg(json_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'role',p.role,
                    'last_login',(select u.last_sign_in_at from auth.users u where u.id=p.id),
                    'screens', coalesce((select array_agg(ms.screen_key) from public.member_screens ms where ms.user_id=p.id), array[]::text[])
                  ) order by (p.role='client_owner') desc, p.full_name), '[]'::json)
                  from public.profiles p where p.organization_id=o.id and p.role<>'crasto_admin')
      ) order by o.name), '[]'::json)
      from public.organizations o
    )
  );
end $$;


--
-- Name: admin_ai_cost(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_ai_cost(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
declare v_from date; v_to date; v_prev_from date; v_prev_to date; v_days int; v_out json;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  v_to   := coalesce(p_to, (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
  v_from := coalesce(p_from, date_trunc('month', current_date)::date);
  v_days := greatest(1, (v_to - v_from) + 1);
  v_prev_to := v_from - 1; v_prev_from := v_from - v_days;
  select json_build_object(
    'from', v_from, 'to', v_to,
    'summary', (select json_build_object(
        'total',      coalesce((select sum(cost) from finance.ai_usage where period_start between v_from and v_to),0),
        'prev_total', coalesce((select sum(cost) from finance.ai_usage where period_start between v_prev_from and v_prev_to),0),
        'platforms',  (select count(distinct platform) from finance.ai_usage where period_start between v_from and v_to and platform is not null),
        'clients',    (select count(distinct organization_id) from finance.ai_usage where period_start between v_from and v_to and organization_id is not null),
        'client_cost',(select coalesce(sum(cost),0) from finance.ai_usage where period_start between v_from and v_to and kind='cliente' and organization_id is not null)
    )),
    'by_platform', (select coalesce(json_agg(t),'[]') from (
        select provider, platform, min(purpose) purpose, min(kind) kind, min(status) status,
               sum(tokens_in) tokens_in, sum(tokens_out) tokens_out, sum(cost) cost
        from finance.ai_usage where period_start between v_from and v_to
        group by provider, platform order by sum(cost) desc nulls last) t),
    'by_client', (select coalesce(json_agg(t),'[]') from (
        select u.organization_id, coalesce(o.name,'Interno / plataforma') organization_name, min(u.kind) kind,
               sum(u.tokens_in) tokens_in, sum(u.tokens_out) tokens_out, sum(u.cost) cost
        from finance.ai_usage u left join public.organizations o on o.id=u.organization_id
        where u.period_start between v_from and v_to
        group by u.organization_id, o.name order by sum(u.cost) desc nulls last) t),
    'rows', (select coalesce(json_agg(t),'[]') from (
        select u.id, u.organization_id, coalesce(o.name,'-') organization_name, u.provider, u.platform, u.purpose,
               u.kind, u.status, u.tokens_in, u.tokens_out, u.cost, u.period_start, u.period_end
        from finance.ai_usage u left join public.organizations o on o.id=u.organization_id
        where u.period_start between v_from and v_to order by u.cost desc nulls last) t)
  ) into v_out;
  return v_out;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: events; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_email text,
    action text NOT NULL,
    target_type text,
    target_id text,
    organization_id uuid,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip text,
    system text DEFAULT 'portal'::text NOT NULL
);

ALTER TABLE ONLY audit.events FORCE ROW LEVEL SECURITY;


--
-- Name: admin_audit_log(date, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_audit_log(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_org uuid DEFAULT NULL::uuid) RETURNS SETOF audit.events
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'audit'
    AS $$
  select * from audit.events
   where public.is_crasto_admin()
     and (p_from is null or at >= p_from)
     and (p_to is null or at < (p_to + 1))
     and (p_org is null or organization_id = p_org)
   order by at desc limit 500;
$$;


--
-- Name: admin_audit_record(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_audit_record(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'audit'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return audit.log(p->>'action', p->>'target_type', p->>'target_id', nullif(p->>'organization_id','')::uuid, coalesce(p->'context','{}'::jsonb));
end $$;


--
-- Name: admin_brain_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_brain_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'audit'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from agents.knowledge where id=p_id and scope='global';
  perform audit.log('config_change','knowledge',p_id::text,null,jsonb_build_object('action','delete'));
end $$;


--
-- Name: knowledge; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE agents.knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    agent_id uuid,
    scope text DEFAULT 'org'::text NOT NULL,
    title text,
    body text,
    source_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    document_path text,
    document_name text,
    CONSTRAINT knowledge_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'org'::text, 'agent'::text])))
);

ALTER TABLE ONLY agents.knowledge FORCE ROW LEVEL SECURITY;


--
-- Name: admin_brain_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_brain_list() RETURNS SETOF agents.knowledge
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'agents'
    AS $$
  select * from agents.knowledge where public.is_crasto_admin() and scope='global' order by created_at desc;
$$;


--
-- Name: admin_brain_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_brain_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'audit'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update agents.knowledge set title=p->>'title', body=p->>'body', source_ref=p->>'source_ref',
      document_path=p->>'document_path', document_name=p->>'document_name'
      where id=(p->>'id')::uuid and scope='global' returning id into v_id;
  else
    insert into agents.knowledge(scope,title,body,source_ref,document_path,document_name)
      values ('global',p->>'title',p->>'body',p->>'source_ref',p->>'document_path',p->>'document_name') returning id into v_id;
  end if;
  perform audit.log('config_change','knowledge',v_id::text,null,jsonb_build_object('title',p->>'title'));
  return v_id;
end $$;


--
-- Name: admin_client_pnl(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_client_pnl() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance', 'commerce'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t), '[]'::json) from
    (select organization_name, total_cost, total_sale, tax, profit
     from finance.client_pnl order by total_sale desc) t);
end $$;


--
-- Name: admin_clients(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_clients() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'delivery', 'catalog', 'finance', 'commerce', 'auth', 'crm'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t order by t.mrr desc, t.name), '[]'::json) from (
    select o.id, o.name, o.plan, o.stage, o.country, o.tax_id, o.website, o.founded_on, o.owner_name,
      o.source, o.last_maturity, o.intent_signal,
      (select p.email from public.profiles p where p.organization_id = o.id order by (p.role = 'client_owner') desc limit 1) as email,
      coalesce((select array_agg(v.name) from delivery.client_modules cm join catalog.vdi_modules v on v.id = cm.vdi_module_id where cm.organization_id = o.id), '{}') as modules,
      (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id where p.organization_id = o.id) as last_access,
      coalesce((select overall_progress from delivery.implementations i where i.organization_id = o.id), 0) as progress,
      (select status from delivery.system_health h where h.organization_id = o.id) as health,
      coalesce((select sum(pr.subtotal) from commerce.proposals pr where pr.organization_id = o.id and pr.status = 'accepted'), 0) as mrr,
      (select max(a.occurred_at) from crm.activities a where a.organization_id = o.id) as last_activity,
      (select max(ms.created_at) from crm.mapa_submissions ms where ms.organization_id = o.id) as last_diagnostic_at,
      public.org_health(o.id) as health_v2
    from public.organizations o
  ) t);
end $$;


--
-- Name: admin_commissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_commissions() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t), '[]'::json) from
    (select o.name as org, k.name as connector, c.sale_amount, c.commission_amount, c.nf_status
     from finance.commissions c
     join public.organizations o on o.id = c.organization_id
     join public.connectors k on k.id = c.connector_id
     order by c.created_at desc) t);
end $$;


--
-- Name: admin_console_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_console_overview() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'whatsapp', 'finance'
    AS $$
declare
  v_live int; v_total int; v_cost numeric; v_dlq int; v_backlog int; v_health text; v_unforced int; v_iso text;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;

  select count(*) filter (where status='live'), count(*) into v_live, v_total from agents.agents;
  select coalesce(sum(cost),0) into v_cost from finance.ai_usage where period_start >= date_trunc('month', current_date)::date;
  select count(*) into v_dlq from whatsapp.dead_letter where created_at >= now() - interval '24 hours';
  select (select count(*) from whatsapp.message_grouping_queue where status='pending')
       + (select count(*) from whatsapp.ai_processing_queue where status='pending')
       + (select count(*) from whatsapp.send_queue where status='pending') into v_backlog;
  v_health := case when v_dlq > 0 then 'crit' when v_backlog > 0 then 'attention' else 'ok' end;

  -- isolamento (posture real): tabelas tenant-scoped novas precisam de FORCE RLS
  select count(*) into v_unforced from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('agents','whatsapp','audit') and c.relkind='r' and not c.relforcerowsecurity;
  v_iso := case when v_unforced = 0 then 'ok' else 'attention' end;

  return json_build_object(
    'ops', json_build_object(
      'agents_live', v_live, 'agents_total', v_total,
      'ai_cost_month', v_cost, 'health', v_health,
      'dlq_24h', v_dlq, 'backlog', v_backlog, 'isolation', v_iso),
    'clients', (
      select coalesce(json_agg(row order by row->>'name'), '[]'::json) from (
        select json_build_object(
          'organization_id', o.id, 'name', o.name,
          'health', public.org_health(o.id),
          'agent', (
            select case
              when count(*) = 0 then 'none'
              when v_dlq > 0 then 'red'
              when v_backlog > 0 then 'amber'
              when count(*) filter (where a.status='live') > 0 then 'green'
              else 'gray' end
            from agents.agents a where a.organization_id = o.id),
          'agents_live', (select count(*) from agents.agents a where a.organization_id=o.id and a.status='live')
        ) as row
        from public.organizations o
      ) t
    )
  );
end $$;


--
-- Name: admin_costs_by_provider(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_costs_by_provider() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t), '[]'::json) from
    (select provider, sum(cost)::numeric cost from finance.ai_usage group by provider order by 2 desc) t);
end $$;


--
-- Name: admin_finance_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_finance_overview() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select json_build_object(
    'total_cost',   coalesce(sum(total_cost),0),
    'total_sale',   coalesce(sum(total_sale),0),
    'total_profit', coalesce(sum(profit),0),
    'commissions_pending',
      (select coalesce(sum(commission_amount),0) from finance.commissions where nf_status='pending')
  ) from finance.client_pnl);
end $$;


--
-- Name: admin_health_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_health_check() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'whatsapp', 'delivery', 'finance'
    AS $$
declare
  v_unforced int;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;

  select count(*) into v_unforced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('agents','whatsapp','audit') and c.relkind = 'r'
     and not c.relforcerowsecurity;

  return (
    select json_build_object(
      'isolation', case when v_unforced = 0 then 'ok' else 'fail' end,
      'clients', coalesce((
        select json_agg(row order by row->>'name')
        from (
          select json_build_object(
            'id', o.id,
            'name', o.name,
            'agents', coalesce((
              select json_agg(json_build_object('name', a.name, 'status', a.status))
              from agents.agents a where a.organization_id = o.id
            ), '[]'::json),
            'agents_live', (select count(*) from agents.agents a where a.organization_id = o.id and a.status = 'live'),
            'agents_total', (select count(*) from agents.agents a where a.organization_id = o.id),
            'q_grouping', (select count(*) from whatsapp.message_grouping_queue q where q.organization_id = o.id and q.status = 'pending'),
            'q_processing', (select count(*) from whatsapp.ai_processing_queue q where q.organization_id = o.id and q.status = 'pending'),
            'q_send', (select count(*) from whatsapp.send_queue q where q.organization_id = o.id and q.status = 'pending'),
            'q_dlq', (select count(*) from whatsapp.dead_letter q where q.organization_id = o.id),
            'farol', coalesce((select sh.status from delivery.system_health sh where sh.organization_id = o.id), 'green'),
            'farol_msg', (select sh.message from delivery.system_health sh where sh.organization_id = o.id),
            'is_internal', (o.id = 'd5d4de3d-c096-4c04-b302-58b9674c63fe'::uuid
                         or lower(o.name) like '%crasto%')
          ) as row
          from public.organizations o
        ) t
      ), '[]'::json)
    )
  );
end $$;


--
-- Name: admin_health_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_health_config() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select value::json from finance.settings where key = 'health_config');
end $$;


--
-- Name: admin_integration_config(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_integration_config(p_key text) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'automation', 'vault'
    AS $$
declare v record; v_vault boolean;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  select exists (select 1 from automation.integrations i join vault.decrypted_secrets ds on ds.name = i.vault_secret_name
                  where i.key = p_key and i.vault_secret_name is not null) into v_vault;
  select meta, from_addr, status, (secret is not null) as primary_set,
         coalesce((select array_agg(k) from jsonb_object_keys(secrets) k), array[]::text[]) as secrets_set,
         updated_at
    into v from automation.integration_configs where key = p_key;
  return json_build_object('key', p_key, 'meta', coalesce(v.meta,'{}'::jsonb), 'from_addr', v.from_addr,
    'status', coalesce(v.status,'disconnected'),
    'primary_set', coalesce(v.primary_set,false) or v_vault,   -- cofre conta como chave salva
    'secrets_set', coalesce(v.secrets_set, array[]::text[]), 'updated_at', v.updated_at);
end $$;


--
-- Name: admin_integrations_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_integrations_status() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'automation', 'vault'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_object_agg(cfg.key, json_build_object(
            'status', cfg.status,
            -- verdade = coluna legado OU cofre (a coluna esta sendo aposentada)
            'has_secret', (cfg.secret is not null) or exists (
                select 1 from automation.integrations i join vault.decrypted_secrets ds on ds.name = i.vault_secret_name
                 where i.key = cfg.key and i.vault_secret_name is not null),
            'from_addr', cfg.from_addr)), '{}'::json)
          from automation.integration_configs cfg);
end $$;


--
-- Name: admin_llm_models(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_llm_models() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'automation', 'finance', 'vault'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (
    select coalesce(json_agg(row order by row->>'provider', (row->>'is_default')::boolean desc), '[]'::json) from (
      select json_build_object(
        'provider', m.provider, 'model', m.model, 'label', m.label,
        'capabilities', m.capabilities, 'is_default', m.is_default, 'status', m.status,
        'has_key', exists(
          select 1 from automation.integrations i
           where i.key = m.provider and i.vault_secret_name is not null
             and exists(select 1 from vault.secrets vs where vs.name = i.vault_secret_name)),
        'cost_month', coalesce((select sum(u.cost) from finance.ai_usage u
                                where u.provider = m.provider
                                  and u.period_start >= date_trunc('month', current_date)::date), 0)
      ) as row
      from agents.llm_models m
    ) t
  );
end $$;


--
-- Name: admin_mapa_by_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_mapa_by_org(p_org uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select to_jsonb(s) from crm.mapa_submissions s
           where s.organization_id = p_org order by s.created_at desc limit 1);
end $$;


--
-- Name: admin_module_clients(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_module_clients(p_module uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'delivery', 'catalog'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t order by t.name), '[]'::json) from (
    select o.id, o.name, cm.status
    from delivery.client_modules cm join public.organizations o on o.id = cm.organization_id
    where cm.vdi_module_id = p_module) t);
end $$;


--
-- Name: admin_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_overview() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance', 'commerce', 'delivery'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return json_build_object(
    'clients', (select count(*) from public.organizations),
    'modules_delivered', (select count(*) from delivery.client_modules),
    'proposals', (select count(*) from commerce.proposals),
    'mrr', (select coalesce(sum(total_sale),0) from finance.client_pnl),
    'profit', (select coalesce(sum(profit),0) from finance.client_pnl),
    'commissions_pending', (select coalesce(sum(commission_amount),0) from finance.commissions where nf_status='pending')
  );
end $$;


--
-- Name: admin_registration_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_registration_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from crm.company_cnpjs where id=p_id;
end $$;


--
-- Name: admin_registration_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_registration_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
declare v_id uuid; v_org uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  v_org := nullif(p->>'organization_id','')::uuid;
  if v_org is null then raise exception 'organization_id obrigatorio'; end if;
  if coalesce(p->>'id','') <> '' then
    update crm.company_cnpjs set
      cnpj=p->>'cnpj', trade_name=p->>'trade_name', legal_name=p->>'legal_name',
      country=coalesce(p->>'country',country), reg_type=coalesce(p->>'reg_type',reg_type),
      is_headquarters=coalesce((p->>'is_headquarters')::boolean,is_headquarters),
      is_active=coalesce((p->>'is_active')::boolean,is_active),
      inscricao_estadual=p->>'inscricao_estadual', inscricao_municipal=p->>'inscricao_municipal',
      regime_tributario=p->>'regime_tributario', notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid and organization_id=v_org returning id into v_id;
  else
    insert into crm.company_cnpjs(organization_id,cnpj,trade_name,legal_name,country,reg_type,is_headquarters,is_active,inscricao_estadual,inscricao_municipal,regime_tributario,notes)
    values (v_org,p->>'cnpj',p->>'trade_name',p->>'legal_name',coalesce(p->>'country','BR'),coalesce(p->>'reg_type','cnpj'),
      coalesce((p->>'is_headquarters')::boolean,false),coalesce((p->>'is_active')::boolean,true),
      p->>'inscricao_estadual',p->>'inscricao_municipal',p->>'regime_tributario',p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $$;


--
-- Name: admin_reopen_proposal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reopen_proposal(p_proposal_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'commerce', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.commissions where proposal_id = p_proposal_id;
  update commerce.proposals set status = 'sent', accepted_at = null where id = p_proposal_id;
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_rule_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rule_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'audit'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from agents.rules where id=p_id and scope='global';
  perform audit.log('config_change','rule',p_id::text,null,jsonb_build_object('action','delete'));
end $$;


--
-- Name: admin_rule_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rule_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'audit'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update agents.rules set rule=p->>'rule', rule_type=coalesce(p->>'rule_type',rule_type),
      enforcement=coalesce(p->>'enforcement',enforcement), status=coalesce(p->>'status',status), source_ref=p->>'source_ref',
      document_path=p->>'document_path', document_name=p->>'document_name'
      where id=(p->>'id')::uuid and scope='global' returning id into v_id;
  else
    insert into agents.rules(scope,rule,rule_type,enforcement,status,source_ref,document_path,document_name)
      values ('global',p->>'rule',coalesce(p->>'rule_type','seguranca'),coalesce(p->>'enforcement','default'),coalesce(p->>'status','ativa'),p->>'source_ref',p->>'document_path',p->>'document_name')
      returning id into v_id;
  end if;
  perform audit.log('config_change','rule',v_id::text,null,jsonb_build_object('rule',left(coalesce(p->>'rule',''),80)));
  return v_id;
end $$;


--
-- Name: rules; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE agents.rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    scope text DEFAULT 'global'::text NOT NULL,
    rule text NOT NULL,
    rule_type text DEFAULT 'seguranca'::text,
    enforcement text DEFAULT 'default'::text NOT NULL,
    status text DEFAULT 'ativa'::text NOT NULL,
    source_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    document_path text,
    document_name text,
    CONSTRAINT rules_enforcement_check CHECK ((enforcement = ANY (ARRAY['obrigatoria'::text, 'default'::text]))),
    CONSTRAINT rules_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'org'::text, 'agent'::text]))),
    CONSTRAINT rules_status_check CHECK ((status = ANY (ARRAY['ativa'::text, 'rascunho'::text])))
);

ALTER TABLE ONLY agents.rules FORCE ROW LEVEL SECURITY;


--
-- Name: admin_rules_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rules_list() RETURNS SETOF agents.rules
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'agents'
    AS $$
  select * from agents.rules where public.is_crasto_admin() and scope='global' order by created_at desc;
$$;


--
-- Name: admin_save_integration(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_integration(p jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'automation', 'audit', 'vault'
    AS $$
declare v_key text; v_status text; v_primary text; v_cur jsonb; v_new jsonb;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  v_key := p->>'key';
  if coalesce(v_key,'') = '' then raise exception 'key obrigat�ria'; end if;
  v_status := coalesce(nullif(p->>'status',''), 'connected');

  insert into automation.integration_configs(key, meta, from_addr, secret, secrets, status, updated_at)
  values (v_key, coalesce(p->'meta','{}'::jsonb), nullif(p->>'from',''), null, '{}'::jsonb, v_status, now())
  on conflict (key) do update set
    meta      = coalesce(p->'meta', automation.integration_configs.meta),
    from_addr = coalesce(nullif(p->>'from',''), automation.integration_configs.from_addr),
    status    = v_status,
    secret    = null,
    secrets   = '{}'::jsonb,
    updated_at = now();

  v_primary := nullif(p->>'secret','');
  if v_primary is null and coalesce(p->'secrets','{}'::jsonb) <> '{}'::jsonb then
    v_cur := coalesce((
      select case when ds.decrypted_secret ~ '^\s*\{' then ds.decrypted_secret::jsonb else '{}'::jsonb end
        from automation.integrations i
        join vault.decrypted_secrets ds on ds.name = i.vault_secret_name
       where i.key = v_key), '{}'::jsonb);
    select coalesce(jsonb_object_agg(e.k, e.val), '{}'::jsonb) into v_new
      from jsonb_each_text(p->'secrets') e(k, val) where e.val <> '';
    v_primary := (v_cur || v_new)::text;
  end if;
  if v_primary is not null then perform automation.set_provider_secret(v_key, v_primary); end if;

  update automation.integrations
     set status = case when v_status = 'connected' then 'connected' else 'disconnected' end
   where key = v_key;

  perform audit.log('config_change','integration', v_key, null, jsonb_build_object('status', v_status));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_set_default_model(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_default_model(p_provider text, p_model text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'audit'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  update agents.llm_models set is_default = false where is_default = true;
  update agents.llm_models set is_default = true  where provider = p_provider and model = p_model;
  perform audit.log('config_change','llm_model', p_provider||'/'||p_model, null, jsonb_build_object('is_default', true));
end $$;


--
-- Name: admin_set_health_config(json); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_health_config(p json) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  update finance.settings set value = p::text where key = 'health_config';
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_set_integration(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_integration(p_key text, p_secret text, p_from text, p_status text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'automation', 'vault'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  insert into automation.integration_configs(key, from_addr, secret, status, updated_at)
  values (p_key, nullif(p_from,''), null, coalesce(nullif(p_status,''),'connected'), now())
  on conflict (key) do update set
    from_addr = coalesce(nullif(p_from,''), automation.integration_configs.from_addr),
    status    = excluded.status,
    secret    = null,
    updated_at = now();
  if nullif(p_secret,'') is not null then perform automation.set_provider_secret(p_key, p_secret); end if;
  update automation.integrations set status =
    case when p_status = 'connected' then 'connected'
         when p_status in ('error','action_required') then 'error'
         else 'disconnected' end
  where key = p_key;
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_set_user_access(uuid, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_user_access(p_user uuid, p_role text, p_screens text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'audit'
    AS $$
declare v_old text; v_org uuid; v_owners int; s text;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if p_role not in ('client_owner','client_member') then raise exception 'papel invalido'; end if;
  select role, organization_id into v_old, v_org from public.profiles where id = p_user;
  if v_old is null then raise exception 'usuario nao encontrado'; end if;
  if v_old = 'crasto_admin' then raise exception 'papel de plataforma nao e alterado por aqui'; end if;
  if v_old = 'client_owner' and p_role <> 'client_owner' then
    select count(*) into v_owners from public.profiles where organization_id = v_org and role = 'client_owner';
    if v_owners <= 1 then raise exception 'nao e possivel remover o unico dono do cliente'; end if;
  end if;
  update public.profiles set role = p_role::public.app_role, updated_at = now() where id = p_user;
  delete from public.member_screens where user_id = p_user;
  if p_role = 'client_member' and p_screens is not null then
    foreach s in array p_screens loop
      insert into public.member_screens(user_id, screen_key) values (p_user, s) on conflict do nothing;
    end loop;
  end if;
  perform audit.log('access_change','user',p_user::text, v_org,
    json_build_object('role',p_role,'screens',coalesce(p_screens,array[]::text[]))::jsonb);
end $$;


--
-- Name: admin_set_user_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_user_role(p_user uuid, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'audit'
    AS $$
declare v_old text; v_org uuid; v_owners int;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if p_role not in ('client_owner','client_member','connector') then
    raise exception 'papel invalido para esta tela (papel de plataforma e concedido manualmente)';
  end if;
  select role, organization_id into v_old, v_org from public.profiles where id=p_user;
  if v_old is null then raise exception 'usuario nao encontrado'; end if;
  if v_old='crasto_admin' then raise exception 'papel de plataforma nao e alterado por aqui'; end if;
  -- nao deixar o cliente sem nenhum dono
  if v_old='client_owner' and p_role<>'client_owner' then
    select count(*) into v_owners from public.profiles where organization_id=v_org and role='client_owner';
    if v_owners <= 1 then raise exception 'nao e possivel remover o unico dono do cliente'; end if;
  end if;
  update public.profiles set role=p_role::public.app_role, updated_at=now() where id=p_user;
  perform audit.log('role_change','user',p_user::text, v_org, json_build_object('from',v_old,'to',p_role)::jsonb);
end $$;


--
-- Name: admin_skill_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_skill_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'audit'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from agents.skill_packs where id=p_id and scope='global';
  perform audit.log('config_change','skill',p_id::text,null,jsonb_build_object('action','delete'));
end $$;


--
-- Name: admin_skill_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_skill_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'audit'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update agents.skill_packs set key=p->>'key', name=p->>'name', description=p->>'description', enforcement=coalesce(p->>'enforcement',enforcement),
      document_path=p->>'document_path', document_name=p->>'document_name'
      where id=(p->>'id')::uuid and scope='global' returning id into v_id;
  else
    insert into agents.skill_packs(scope,key,name,description,enforcement,document_path,document_name)
      values ('global',p->>'key',p->>'name',p->>'description',coalesce(p->>'enforcement','default'),p->>'document_path',p->>'document_name') returning id into v_id;
  end if;
  perform audit.log('config_change','skill',v_id::text,null,jsonb_build_object('name',p->>'name'));
  return v_id;
end $$;


--
-- Name: skill_packs; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE agents.skill_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    key text,
    name text,
    description text,
    enforcement text DEFAULT 'default'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    document_path text,
    document_name text,
    CONSTRAINT skill_packs_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'org'::text, 'agent'::text])))
);

ALTER TABLE ONLY agents.skill_packs FORCE ROW LEVEL SECURITY;


--
-- Name: admin_skills_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_skills_list() RETURNS SETOF agents.skill_packs
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'agents'
    AS $$
  select * from agents.skill_packs where public.is_crasto_admin() and scope='global' order by created_at desc;
$$;


--
-- Name: admin_support_hours(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_support_hours() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(json_agg(t), '[]'::json) from (
    select o.name as org, s.plan_hours, s.used_hours, s.balance, s.status
    from finance.support_hours s
    join public.organizations o on o.id = s.organization_id
    order by o.name) t);
end $$;


--
-- Name: admin_user_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_user_access(p_user uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_role text;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  select role into v_role from public.profiles where id = p_user;
  return json_build_object('role', v_role,
    'screens', coalesce((select array_agg(screen_key) from public.member_screens where user_id = p_user), array[]::text[]));
end $$;


--
-- Name: audit_login(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_login() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'audit'
    AS $$ begin perform audit.log('login', 'session', auth.uid()::text, (select organization_id from public.profiles where id = auth.uid())); end $$;


--
-- Name: business_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.business_settings() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  return (
    select coalesce(json_object_agg(key, value), '{}'::json)
    from finance.settings
    where key in ('tax_rate','commission_indicador','commission_conector','support_whatsapp','support_email','pix_key','pix_beneficiary')
  );
end $$;


--
-- Name: client_support_hours(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_support_hours() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
declare org uuid; begin
  org := public.current_org_id();
  if org is null then return '[]'::json; end if;
  return (select coalesce(json_agg(t), '[]'::json) from
    (select period, plan_hours, used_hours, balance, status
     from finance.support_hours where organization_id = org order by period desc) t);
end $$;


--
-- Name: connector_commissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.connector_commissions() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
declare cid uuid; begin
  cid := public.current_connector_id();
  if cid is null then return '[]'::json; end if;
  return (select coalesce(json_agg(t), '[]'::json) from
    (select o.name as org, c.sale_amount, c.commission_amount, c.nf_status
     from finance.commissions c
     join public.organizations o on o.id = c.organization_id
     where c.connector_id = cid order by c.created_at desc) t);
end $$;


--
-- Name: cred_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cred_key() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'vault', 'public'
    AS $$
  select decrypted_secret from vault.decrypted_secrets where name='portal_cred_key' limit 1;
$$;


--
-- Name: crm_identity_lookup(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_identity_lookup(p_email text) RETURNS TABLE(id uuid, has_password boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'auth', 'public'
    AS $$
  select u.id, coalesce(u.encrypted_password,'') <> '' from auth.users u
   where lower(u.email) = lower(p_email) limit 1
$$;


--
-- Name: current_connector_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_connector_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select connector_id from public.profiles where id = auth.uid();
$$;


--
-- Name: current_org_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_org_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when public.is_crasto_admin()
     and coalesce(nullif(current_setting('request.impersonate_org', true),''),'') <> ''
    then nullif(current_setting('request.impersonate_org', true),'')::uuid
    else (select organization_id from public.profiles where id = auth.uid())
  end
 $$;


--
-- Name: delete_my_cnpj(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_cnpj(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
declare v_org uuid; v_role text;
begin
  select organization_id, role into v_org, v_role from public.profiles where id = auth.uid();
  if v_role <> 'client_owner' then raise exception 'apenas o dono pode excluir'; end if;
  delete from crm.company_cnpjs where id=p_id and organization_id=v_org;
end $$;


--
-- Name: delete_my_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_document(p_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
declare v_org uuid; v_path text;
begin
  select organization_id into v_org from public.profiles where id=auth.uid();
  select storage_path into v_path from crm.documents where id=p_id and organization_id=v_org;
  delete from crm.documents where id=p_id and organization_id=v_org;
  return v_path;
end $$;


--
-- Name: delete_my_partner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_partner(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
declare v_org uuid; v_role text;
begin
  select organization_id, role into v_org, v_role from public.profiles where id=auth.uid();
  if v_role <> 'client_owner' then raise exception 'apenas o dono'; end if;
  delete from crm.company_partners where id=p_id and organization_id=v_org;
end $$;


--
-- Name: fin_account_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_account_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.accounts where id=p_id;
end $$;


--
-- Name: fin_account_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_account_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','') <> '' then
    update finance.accounts set
      account_type = case when p ? 'account_type' then coalesce(p->>'account_type',account_type) else account_type end,
      description  = case when p ? 'description'  then coalesce(p->>'description',description)   else description end,
      category     = case when p ? 'category'     then p->>'category'     else category end,
      amount       = case when p ? 'amount'       then coalesce((p->>'amount')::numeric,amount) else amount end,
      amount_paid  = case when p ? 'amount_paid'  then coalesce((p->>'amount_paid')::numeric,amount_paid) else amount_paid end,
      due_date     = case when p ? 'due_date'     then nullif(p->>'due_date','')::date     else due_date end,
      payment_date = case when p ? 'payment_date' then nullif(p->>'payment_date','')::date else payment_date end,
      payment_method = case when p ? 'payment_method' then p->>'payment_method' else payment_method end,
      status       = case when p ? 'status'       then coalesce(p->>'status',status) else status end,
      recurrence   = case when p ? 'recurrence'   then p->>'recurrence'   else recurrence end,
      invoice_number = case when p ? 'invoice_number' then p->>'invoice_number' else invoice_number end,
      contact_name = case when p ? 'contact_name' then p->>'contact_name' else contact_name end,
      contact_reference = case when p ? 'contact_reference' then p->>'contact_reference' else contact_reference end,
      organization_id = case when p ? 'organization_id' then nullif(p->>'organization_id','')::uuid else organization_id end,
      expense_type = case when p ? 'expense_type' then p->>'expense_type' else expense_type end,
      services     = case when p ? 'services'     then coalesce(p->'services','[]'::jsonb) else services end,
      contract_validity_value = case when p ? 'contract_validity_value' then nullif(p->>'contract_validity_value','')::int else contract_validity_value end,
      contract_validity_unit  = case when p ? 'contract_validity_unit'  then p->>'contract_validity_unit' else contract_validity_unit end,
      contract_total = case when p ? 'contract_total' then nullif(p->>'contract_total','')::numeric else contract_total end,
      payment_installments = case when p ? 'payment_installments' then nullif(p->>'payment_installments','')::int else payment_installments end,
      payment_day_of_month = case when p ? 'payment_day_of_month' then nullif(p->>'payment_day_of_month','')::int else payment_day_of_month end,
      payment_reason = case when p ? 'payment_reason' then p->>'payment_reason' else payment_reason end,
      payment_schedule = case when p ? 'payment_schedule' then coalesce(p->'payment_schedule','[]'::jsonb) else payment_schedule end,
      notes        = case when p ? 'notes'        then p->>'notes' else notes end,
      updated_at   = now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.accounts(account_type,description,category,amount,amount_paid,due_date,payment_date,payment_method,status,recurrence,invoice_number,contact_name,contact_reference,organization_id,expense_type,notes,services,contract_validity_value,contract_validity_unit,contract_total,payment_installments,payment_day_of_month,payment_reason,payment_schedule)
    values (p->>'account_type',p->>'description',p->>'category',coalesce((p->>'amount')::numeric,0),coalesce((p->>'amount_paid')::numeric,0),nullif(p->>'due_date','')::date,nullif(p->>'payment_date','')::date,p->>'payment_method',coalesce(p->>'status','pending'),p->>'recurrence',p->>'invoice_number',p->>'contact_name',p->>'contact_reference',nullif(p->>'organization_id','')::uuid,p->>'expense_type',p->>'notes',coalesce(p->'services','[]'::jsonb),nullif(p->>'contract_validity_value','')::int,p->>'contract_validity_unit',nullif(p->>'contract_total','')::numeric,nullif(p->>'payment_installments','')::int,nullif(p->>'payment_day_of_month','')::int,p->>'payment_reason',coalesce(p->'payment_schedule','[]'::jsonb))
    returning id into v_id;
  end if;
  return v_id;
end $$;


--
-- Name: accounts; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_type text NOT NULL,
    description text NOT NULL,
    category text,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    amount_paid numeric(14,2) DEFAULT 0 NOT NULL,
    due_date date,
    payment_date date,
    payment_method text,
    status text DEFAULT 'pending'::text NOT NULL,
    recurrence text,
    invoice_number text,
    contact_name text,
    organization_id uuid,
    expense_type text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_reference text,
    services jsonb DEFAULT '[]'::jsonb NOT NULL,
    contract_validity_value integer,
    contract_validity_unit text,
    contract_total numeric(14,2),
    payment_installments integer,
    payment_day_of_month integer,
    payment_reason text,
    payment_schedule jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT accounts_account_type_check CHECK ((account_type = ANY (ARRAY['payable'::text, 'receivable'::text]))),
    CONSTRAINT accounts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: fin_accounts(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_accounts(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text) RETURNS SETOF finance.accounts
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
  select * from finance.accounts
   where public.is_crasto_admin()
     and (p_type is null or account_type = p_type)
     and (p_status is null or status = p_status)
   order by coalesce(due_date, created_at::date) asc, created_at asc;
$$;


--
-- Name: fin_ai_cost_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_ai_cost_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.ai_usage where id=p_id;
end $$;


--
-- Name: fin_ai_cost_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_ai_cost_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update finance.ai_usage set
      organization_id = case when p ? 'organization_id' then nullif(p->>'organization_id','')::uuid else organization_id end,
      provider = case when p ? 'provider' then p->>'provider' else provider end,
      platform = case when p ? 'platform' then p->>'platform' else platform end,
      purpose  = case when p ? 'purpose'  then p->>'purpose'  else purpose end,
      kind     = case when p ? 'kind'     then coalesce(p->>'kind',kind) else kind end,
      status   = case when p ? 'status'   then coalesce(p->>'status',status) else status end,
      tokens_in  = case when p ? 'tokens_in'  then coalesce((p->>'tokens_in')::bigint,0) else tokens_in end,
      tokens_out = case when p ? 'tokens_out' then coalesce((p->>'tokens_out')::bigint,0) else tokens_out end,
      cost     = case when p ? 'cost' then coalesce((p->>'cost')::numeric,0) else cost end,
      period_start = case when p ? 'period_start' then nullif(p->>'period_start','')::date else period_start end,
      period_end   = case when p ? 'period_end'   then nullif(p->>'period_end','')::date else period_end end
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.ai_usage(organization_id,provider,platform,purpose,kind,status,tokens_in,tokens_out,cost,period_start,period_end)
    values (nullif(p->>'organization_id','')::uuid,p->>'provider',p->>'platform',p->>'purpose',coalesce(p->>'kind','cliente'),coalesce(p->>'status','active'),
      coalesce((p->>'tokens_in')::bigint,0),coalesce((p->>'tokens_out')::bigint,0),coalesce((p->>'cost')::numeric,0),
      coalesce(nullif(p->>'period_start','')::date, date_trunc('month',current_date)::date),
      coalesce(nullif(p->>'period_end','')::date, (date_trunc('month',current_date)+interval '1 month - 1 day')::date))
    returning id into v_id;
  end if;
  return v_id;
end $$;


--
-- Name: fin_cost_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_cost_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.operational_costs where id=p_id;
end $$;


--
-- Name: fin_cost_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_cost_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update finance.operational_costs set vendor_name=p->>'vendor_name', description=coalesce(p->>'description',description),
      category=p->>'category', currency=coalesce(p->>'currency',currency), amount_original=coalesce((p->>'amount_original')::numeric,amount_original),
      exchange_rate=coalesce((p->>'exchange_rate')::numeric,exchange_rate), amount_brl=coalesce((p->>'amount_brl')::numeric,amount_brl),
      cost_type=p->>'cost_type', cost_nature=p->>'cost_nature', recurrence=p->>'recurrence',
      reference_date=nullif(p->>'reference_date','')::date, next_payment_date=nullif(p->>'next_payment_date','')::date,
      is_active=coalesce((p->>'is_active')::boolean,is_active), payment_method=p->>'payment_method',
      website=p->>'website', purpose=p->>'purpose', notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.operational_costs(vendor_name,description,category,currency,amount_original,exchange_rate,amount_brl,cost_type,cost_nature,recurrence,reference_date,next_payment_date,is_active,payment_method,website,purpose,notes)
    values (p->>'vendor_name',p->>'description',p->>'category',coalesce(p->>'currency','BRL'),coalesce((p->>'amount_original')::numeric,0),coalesce((p->>'exchange_rate')::numeric,1),coalesce((p->>'amount_brl')::numeric,0),p->>'cost_type',p->>'cost_nature',p->>'recurrence',nullif(p->>'reference_date','')::date,nullif(p->>'next_payment_date','')::date,coalesce((p->>'is_active')::boolean,true),p->>'payment_method',p->>'website',p->>'purpose',p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $$;


--
-- Name: operational_costs; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.operational_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_name text,
    description text NOT NULL,
    category text,
    currency text DEFAULT 'BRL'::text NOT NULL,
    amount_original numeric(14,2) DEFAULT 0 NOT NULL,
    exchange_rate numeric(12,4) DEFAULT 1 NOT NULL,
    amount_brl numeric(14,2) DEFAULT 0 NOT NULL,
    cost_type text,
    cost_nature text,
    recurrence text,
    reference_date date,
    next_payment_date date,
    is_active boolean DEFAULT true NOT NULL,
    payment_method text,
    website text,
    purpose text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_costs(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_costs(p_active boolean DEFAULT NULL::boolean) RETURNS SETOF finance.operational_costs
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
  select * from finance.operational_costs where public.is_crasto_admin() and (p_active is null or is_active = p_active)
  order by amount_brl desc nulls last, created_at desc;
$$;


--
-- Name: fin_transaction_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_transaction_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  delete from finance.transactions where id=p_id;
end $$;


--
-- Name: fin_transaction_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_transaction_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  if coalesce(p->>'id','')<>'' then
    update finance.transactions set type=coalesce(p->>'type',type), category=p->>'category',
      amount=coalesce((p->>'amount')::numeric,amount), description=p->>'description', status=coalesce(p->>'status',status),
      transaction_date=nullif(p->>'transaction_date','')::date, bank_account=p->>'bank_account',
      contact_name=p->>'contact_name', payment_method=p->>'payment_method', notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid returning id into v_id;
  else
    insert into finance.transactions(type,category,amount,description,status,transaction_date,bank_account,contact_name,payment_method,notes)
    values (coalesce(p->>'type','income'),p->>'category',coalesce((p->>'amount')::numeric,0),p->>'description',coalesce(p->>'status','completed'),nullif(p->>'transaction_date','')::date,p->>'bank_account',p->>'contact_name',p->>'payment_method',p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $$;


--
-- Name: transactions; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    category text,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    transaction_date date,
    bank_account text,
    contact_name text,
    payment_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: fin_transactions(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_transactions(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text) RETURNS SETOF finance.transactions
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
  select * from finance.transactions where public.is_crasto_admin()
    and (p_type is null or type=p_type) and (p_status is null or status=p_status)
  order by transaction_date desc nulls last, created_at desc;
$$;


--
-- Name: global_brain(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.global_brain() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'agents'
    AS $$
  select jsonb_build_object(
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'rule', rule, 'rule_type', coalesce(rule_type,'geral'),
        'enforcement', coalesce(enforcement,'default')
      ) order by created_at)
      from agents.rules
      where scope = 'global' and coalesce(status,'ativa') = 'ativa'
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'key', key, 'name', name, 'description', description,
        'enforcement', coalesce(enforcement,'default')
      ) order by created_at)
      from agents.skill_packs
      where scope = 'global'
    ), '[]'::jsonb)
  );
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end $$;


--
-- Name: is_admin_viewing_all(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_viewing_all() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.is_crasto_admin()
     and coalesce(nullif(current_setting('request.impersonate_org', true),''),'') = ''
 $$;


--
-- Name: is_crasto_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_crasto_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'crasto_admin');
$$;


--
-- Name: is_referred_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_referred_org(org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.organizations
                 where id = org and referred_by = public.current_connector_id());
$$;


--
-- Name: llm_runtime(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.llm_runtime() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'agents', 'automation', 'vault'
    AS $$
  select json_build_object(
    'provider', m.provider, 'model', m.model, 'label', m.label,
    'api_key', (select ds.decrypted_secret
                  from automation.integrations i
                  join vault.decrypted_secrets ds on ds.name = i.vault_secret_name
                 where i.key = m.provider and i.vault_secret_name is not null limit 1)
  )
  from agents.llm_models m where m.is_default and m.status = 'ativo' limit 1;
$$;


--
-- Name: mapa_ingest(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mapa_ingest(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm', 'auth'
    AS $$
declare
  v_email text := nullif(trim(payload->'lead'->>'email'),'');
  v_wa    text := regexp_replace(coalesce(payload->'lead'->>'whatsapp',''), '\D', '', 'g');
  v_empresa text := nullif(trim(payload->'lead'->>'empresa'),'');
  v_cargo   text := nullif(trim(payload->'lead'->>'cargo'),'');
  v_segmento text := nullif(trim(payload->'lead'->>'segmento'),'');
  v_fat   text := nullif(trim(payload->'lead'->>'faturamento'),'');
  v_tempo text := nullif(trim(payload->'lead'->>'tempo'),'');
  v_lang  text := coalesce(nullif(trim(payload->>'lang'),''), 'pt');
  v_mat   int  := nullif(payload->>'maturidade','')::int;
  v_ip    inet := nullif(payload->>'ip','')::inet;
  v_ua    text := payload->>'user_agent';
  v_dores text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(payload->'dores') x), '{}');
  v_onde  text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(payload->'onde_paga') x), '{}');
  v_intent text;
  v_org uuid;
  v_sub uuid;
  v_person uuid;
  v_recent int;
begin
  -- rate-limit: no máx. 8 submissões/min por IP (anti-flood)
  if v_ip is not null then
    select count(*) into v_recent from crm.mapa_submissions
      where ip = v_ip and created_at > now() - interval '1 minute';
    if v_recent >= 8 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  -- sinal de intenção (heurística: maturidade baixa = mais dor = mais quente)
  v_intent := case
    when v_mat is null then 'medio'
    when v_mat < 40 then 'alto'
    when v_mat < 70 then 'medio'
    else 'baixo' end;
  if exists (select 1 from unnest(v_dores) d
             where d ilike '%não sei por onde começar%' or d ilike '%em quem confiar%'
                or d ilike '%where to start%' or d ilike '%who to trust%') then
    v_intent := 'alto';
  end if;

  -- upsert do PROSPECTO só quando há e-mail (regra do contrato)
  if v_email is not null then
    -- dedup: por e-mail (pessoas) → por whatsapp (telefones)
    select p.organization_id into v_org from crm.people p
      where lower(p.email) = lower(v_email) order by p.created_at desc limit 1;
    if v_org is null and length(v_wa) >= 8 then
      select ph.organization_id into v_org from crm.phones ph
        where regexp_replace(coalesce(ph.country_code,'') || ph.number, '\D', '', 'g') like '%' || v_wa
           or regexp_replace(ph.number, '\D', '', 'g') = v_wa
        order by ph.created_at desc limit 1;
    end if;

    if v_org is null then
      insert into public.organizations
        (name, stage, country, source, first_diagnostic_at, last_maturity, intent_signal)
      values
        (coalesce(v_empresa, '(Prospecto do Mapa)'), 'prospecto', 'BR',
         'mapa_site', now(), v_mat, v_intent)
      returning id into v_org;
    else
      update public.organizations set
        name = coalesce(nullif(name,''), v_empresa, name),
        source = coalesce(source, 'mapa_site'),
        first_diagnostic_at = coalesce(first_diagnostic_at, now()),
        last_maturity = v_mat,
        intent_signal = v_intent
      where id = v_org;
    end if;

    -- pessoa (contato) — cria se não houver por e-mail
    select id into v_person from crm.people
      where organization_id = v_org and lower(email) = lower(v_email) limit 1;
    if v_person is null then
      insert into crm.people (organization_id, full_name, role, email, is_primary, notes)
      values (v_org, coalesce(nullif(split_part(v_email,'@',1),''), 'Contato'),
              v_cargo, v_email, true, 'Origem: Mapa de IA (site)')
      returning id into v_person;
    end if;

    -- telefone (whatsapp) — evita duplicar pelos últimos 8 dígitos
    if length(v_wa) >= 8 then
      if not exists (select 1 from crm.phones
                     where organization_id = v_org
                       and regexp_replace(number,'\D','','g') like '%' || right(v_wa,8)) then
        insert into crm.phones (organization_id, person_id, label, country_code, number, is_primary)
        values (v_org, v_person, 'whatsapp', '+55', v_wa, true);
      end if;
    end if;
  end if;

  -- grava a submissão SEMPRE (mesmo sem e-mail)
  insert into crm.mapa_submissions
    (organization_id, lang, email, whatsapp, empresa, cargo, segmento, faturamento, tempo,
     dores, dor_outro, gargalo, dimensoes, scores, maturidade, onde_paga, passo1_key, magic_hash,
     intent_signal, source, user_agent, ip)
  values
    (v_org, v_lang, v_email, nullif(v_wa,''), v_empresa, v_cargo, v_segmento, v_fat, v_tempo,
     v_dores, nullif(payload->>'dor_outro',''), nullif(payload->>'gargalo',''),
     coalesce(payload->'dimensoes','{}'::jsonb), coalesce(payload->'scores','[]'::jsonb),
     v_mat, v_onde, nullif(payload->>'passo1_key',''), nullif(payload->>'magic_hash',''),
     v_intent, 'mapa_site', v_ua, v_ip)
  returning id into v_sub;

  -- atividade no histórico do prospecto
  if v_org is not null then
    insert into crm.activities (organization_id, type, title, description, occurred_at)
    values (v_org, 'note', 'Diagnóstico recebido (Mapa de IA)',
      'Maturidade ' || coalesce(v_mat::text,'—') || '/100 · onde a IA se paga: ' ||
      coalesce(array_to_string(v_onde, ', '), '—') ||
      case when nullif(payload->>'gargalo','') is not null
           then ' · gargalo: ' || (payload->>'gargalo') else '' end,
      now());
  end if;

  return jsonb_build_object('ok', true, 'submission_id', v_sub, 'organization_id', v_org);
end $$;


--
-- Name: mapa_mark_email(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mapa_mark_email(p_sub uuid, p_sent boolean, p_error text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
  update crm.mapa_submissions set email_sent = p_sent, email_error = p_error where id = p_sub;
$$;


--
-- Name: mapadeia_ingest(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mapadeia_ingest(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm', 'auth', 'net'
    AS $$
declare
  v_email   text := nullif(trim(payload->'lead'->>'email'),'');
  v_wa      text := regexp_replace(coalesce(payload->'lead'->>'whatsapp',''), '\D', '', 'g');
  v_nome    text := nullif(trim(payload->'lead'->>'nome'),'');
  v_empresa text := nullif(trim(payload->'lead'->>'empresa'),'');
  v_origem  text := coalesce(nullif(trim(payload->>'origem'),''), 'mapadeia_reuniao');
  v_lang    text := coalesce(nullif(trim(payload->>'lang'),''), 'pt');
  v_ip      inet := nullif(payload->>'ip','')::inet;
  v_ua      text := payload->>'user_agent';
  v_org uuid;
  v_sub uuid;
  v_recent int;
  v_key text;
  v_from text;
  v_hi text;
  v_html text;
begin
  if v_ip is not null then
    select count(*) into v_recent from crm.mapadeia_submissions
      where ip = v_ip and created_at > now() - interval '1 minute';
    if v_recent >= 8 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;

  if v_email is not null then
    select p.organization_id into v_org from crm.people p
      where lower(p.email) = lower(v_email) order by p.created_at desc limit 1;
  end if;
  if v_org is null and length(v_wa) >= 8 then
    select ph.organization_id into v_org from crm.phones ph
      where regexp_replace(coalesce(ph.country_code,'') || ph.number, '\D','','g') like '%' || v_wa
         or regexp_replace(ph.number,'\D','','g') = v_wa
      order by ph.created_at desc limit 1;
  end if;
  if v_org is null and v_empresa is not null then
    select id into v_org from public.organizations
      where lower(name) = lower(v_empresa) or lower(coalesce(legal_name,'')) = lower(v_empresa)
      order by created_at desc limit 1;
  end if;

  -- Se não achou a empresa e há e-mail, CRIA o prospecto com SOURCE DISTINTO
  -- (mapa_avancado) — pra o lead do Mapa de IA Avançado aparecer no CRM já
  -- diferenciado do /mapa (mapa_site). Deep map = lead quente (intent alto).
  if v_org is null and v_email is not null then
    insert into public.organizations (name, stage, country, source, intent_signal, first_diagnostic_at)
    values (coalesce(v_empresa, '(Prospecto — Mapa de IA Avançado)'), 'prospecto', 'BR', 'mapa_avancado', 'alto', now())
    returning id into v_org;
    insert into crm.people (organization_id, full_name, role, email, is_primary, notes)
    values (v_org, coalesce(v_nome, nullif(split_part(v_email,'@',1),''), 'Contato'), null, v_email, true,
            'Origem: Mapa de IA Avançado (/mapadeia)');
    if length(v_wa) >= 8 then
      insert into crm.phones (organization_id, label, country_code, number, is_primary)
      values (v_org, 'whatsapp', '+55', v_wa, true);
    end if;
  end if;

  insert into crm.mapadeia_submissions
    (organization_id, origem, lang, nome, email, whatsapp, empresa, deep, raw, user_agent, ip)
  values
    (v_org, v_origem, v_lang, v_nome, v_email, nullif(v_wa,''), v_empresa,
     coalesce(payload->'deep', '{}'::jsonb), payload->'raw', v_ua, v_ip)
  returning id into v_sub;

  if v_org is not null then
    insert into crm.activities (organization_id, type, title, description, occurred_at)
    values (v_org, 'note', 'Mapa DIA (profundo) recebido · ' || v_origem,
      'Diagnóstico profundo aplicado ao vivo (reunião/workshop). Ref crm.mapadeia_submissions ' || v_sub::text,
      now());
  end if;

  -- ===== E-MAIL BRANDED (fase 2) — só se houver e-mail =====
  if v_email is not null then
    begin
      -- chave DEDICADA do /mapadeia (Vault int_resend_mapadeia) — separada do /mapa
      v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'int_resend_mapadeia' limit 1);
      v_from := 'Crasto.AI <no-reply@crasto.ai>';
      v_hi := coalesce(nullif(split_part(coalesce(v_nome,''),' ',1),''), '');
      v_html :=
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>'
        || '<body style="margin:0;padding:0;background-color:#EDF0F4;font-family:''Geist'',''Inter'',-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;">'
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EDF0F4;"><tr><td align="center" style="padding:0 16px;">'
        || '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">'
        || '<tr><td style="padding:24px 4px 18px;"><img src="https://vqulwouxwtfpboifhwcl.supabase.co/storage/v1/object/public/brand/crasto-wordmark-navy.png" width="164" height="28" alt="Crasto.AI" style="display:block;border:0;width:164px;height:28px;"></td></tr>'
        || '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid #E6E9EF;border-radius:16px;overflow:hidden;">'
        || '<tr><td style="background-color:#010E26;background-image:linear-gradient(140deg,#010E26 0%,#000714 70%,#00030A 100%);padding:32px 36px 28px;">'
        || '<p style="margin:0 0 11px;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.70);">Mapa de IA Avançado · diagnóstico detalhado</p>'
        || '<h1 style="margin:0;font-size:24px;line-height:1.24;font-weight:600;letter-spacing:-.021em;color:#FFFFFF;">Aqui está o seu Mapa de IA Avançado' || case when v_hi <> '' then ', ' || v_hi else '' end || '</h1></td></tr>'
        || '<tr><td style="background-color:#FFFFFF;padding:30px 36px 34px;">'
        || '<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#344054;">Registramos o seu <strong style="color:#010E26;">Mapa de IA Avançado</strong> — o diagnóstico detalhado que construímos na nossa sessão' || case when v_empresa is not null then ' com a <strong style="color:#010E26;">' || v_empresa || '</strong>' else '' end || '. Ele mostra, em profundidade, <strong style="color:#010E26;">onde a IA se paga primeiro</strong>, onde ela não entra e o passo a passo de implantação.</p>'
        || '<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#344054;">A partir daqui, seguimos com o <strong style="color:#010E26;">plano de execução</strong> e a proposta pra colocar isso pra rodar e medir resultado.</p>'
        || '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background-color:#010E26;background-image:linear-gradient(180deg,#6E9CE8 0%,#010E26 58%);">'
        || '<a href="https://wa.me/5511913685973" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:500;color:#FFFFFF;text-decoration:none;border:1px solid #000714;border-radius:999px;">Falar com a Crasto.AI</a>'
        || '</td></tr></table>'
        || '<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#667085;">A IA é o veículo, os KPIs orientam a rota e o resultado é o destino.</p>'
        || '</td></tr></table></td></tr>'
        || '<tr><td style="padding:22px 6px 36px;"><p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#667085;">Crasto.AI · Domine, Evolua, Escale.</p>'
        || '<p style="margin:0;font-size:12px;line-height:1.6;color:#98A2B3;">Este e-mail se refere ao diagnóstico profundo aplicado com você.</p></td></tr>'
        || '</table></td></tr></table></body></html>';

      if v_key is not null then
        perform net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(v_email),
                                     'subject', 'Seu Mapa de IA Avançado · Crasto.AI',
                                     'html', v_html)
        );
      end if;
    exception when others then
      null; -- e-mail é best-effort; nunca derruba o registro do deep map
    end;
  end if;

  return jsonb_build_object('ok', true, 'submission_id', v_sub, 'organization_id', v_org);
end
$$;


--
-- Name: company_cnpjs; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.company_cnpjs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    cnpj text,
    trade_name text,
    legal_name text,
    is_headquarters boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    inscricao_estadual text,
    inscricao_municipal text,
    regime_tributario text,
    data_abertura date,
    zip_code text,
    state text,
    city text,
    address text,
    phone text,
    email text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    country text DEFAULT 'BR'::text NOT NULL,
    reg_type text DEFAULT 'cnpj'::text NOT NULL
);


--
-- Name: my_cnpjs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_cnpjs() RETURNS SETOF crm.company_cnpjs
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
  select * from crm.company_cnpjs
   where organization_id = (select organization_id from public.profiles where id = auth.uid())
   order by is_headquarters desc, created_at;
$$;


--
-- Name: documents; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    kind text,
    file_name text,
    storage_path text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: my_documents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_documents() RETURNS SETOF crm.documents
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
  select * from crm.documents where organization_id=(select organization_id from public.profiles where id=auth.uid()) order by uploaded_at desc;
$$;


--
-- Name: my_faturas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_faturas() RETURNS TABLE(id text, description text, amount numeric, due_date text, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'finance'
    AS $$
  with me as (select organization_id from public.profiles where id = auth.uid())
  select
    a.id::text || case when p.ord is not null then '-' || p.ord::text else '' end,
    case when p.ord is not null
         then coalesce(nullif(a.description,''), a.contact_name, 'Fatura') || ' — ' || (p.elem->>'installment') || '/' || jsonb_array_length(a.payment_schedule)
         else coalesce(nullif(a.description,''), a.contact_name, 'Fatura') end,
    case when p.ord is not null then (p.elem->>'amount')::numeric else a.amount end,
    case when p.ord is not null then nullif(p.elem->>'date','') else to_char(a.due_date,'YYYY-MM-DD') end,
    case
      when p.ord is not null then case when p.elem->>'status' = 'paid' then 'paid' else 'open' end
      else case when a.status = 'paid' then 'paid' when a.status = 'cancelled' then 'canceled' else 'open' end
    end
  from finance.accounts a
  join me on me.organization_id is not null and me.organization_id = a.organization_id
  left join lateral (
    select ord, elem from jsonb_array_elements(
      case when jsonb_typeof(a.payment_schedule) = 'array' and jsonb_array_length(a.payment_schedule) > 0
           then a.payment_schedule else '[]'::jsonb end
    ) with ordinality as t(elem, ord)
  ) p on true
  where a.account_type = 'receivable' and a.organization_id is not null
  order by 4 nulls last;
$$;


--
-- Name: my_org_contact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_org_contact() RETURNS TABLE(ddi text, number text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.country_code, p.number
  from crm.phones p
  where p.organization_id = (select organization_id from public.profiles where id = auth.uid())
  order by p.is_primary desc nulls last, p.created_at asc
  limit 1;
$$;


--
-- Name: company_partners; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.company_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name text,
    cpf text,
    rg text,
    email text,
    mobile_phone text,
    role_title text,
    ownership_percentage numeric,
    birth_date date,
    is_ceo boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: my_partners(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_partners() RETURNS SETOF crm.company_partners
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
  select * from crm.company_partners where organization_id=(select organization_id from public.profiles where id=auth.uid()) order by is_ceo desc, created_at;
$$;


--
-- Name: my_screens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_screens() RETURNS text[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role in ('client_owner','crasto_admin') then return array['*']; end if;
  return coalesce((select array_agg(screen_key) from public.member_screens where user_id = auth.uid()), array[]::text[]);
end $$;


--
-- Name: org_health(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_health(o uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'delivery', 'billing', 'support', 'commerce', 'crm', 'finance', 'auth'
    AS $$
declare
  cfg json; new_days int; risk int; att int; wl json; lifecycle text;
  progress numeric; farol text; last_login timestamptz; days_client numeric;
  overdue int; open_tickets int; days_login numeric;
  s_onb numeric; s_tech numeric; s_eng numeric; s_fin numeric; s_sup numeric;
  wsum numeric; score numeric; reasons text[] := '{}';
begin
  select value::json into cfg from finance.settings where key = 'health_config';
  if cfg is null then cfg := '{}'::json; end if;
  new_days := coalesce((cfg->>'new_client_days')::int, 90);
  att      := coalesce((cfg->>'attention_threshold')::int, 70);
  risk     := coalesce((cfg->>'risk_threshold')::int, 45);

  -- sinais
  progress   := coalesce((select overall_progress from delivery.implementations where organization_id = o), 0);
  farol      := (select status from delivery.system_health where organization_id = o);
  last_login := (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id where p.organization_id = o);
  days_client := extract(epoch from (now() - coalesce(
                   (select started_at from delivery.implementations where organization_id = o),
                   (select created_at from public.organizations where id = o)))) / 86400;
  overdue      := (select count(*) from billing.invoices where organization_id = o and (status = 'overdue' or (status = 'open' and due_date < current_date)));
  open_tickets := (select count(*) from support.tickets where organization_id = o and status in ('open','in_progress') and created_at < now() - interval '3 days');
  days_login   := case when last_login is null then null else extract(epoch from (now() - last_login)) / 86400 end;

  lifecycle := case when days_client < new_days then 'new' else 'established' end;
  wl := cfg -> (case when lifecycle = 'new' then 'weights_new' else 'weights_established' end);
  if wl is null then
    wl := (case when lifecycle = 'new'
      then '{"onboarding":40,"technical":25,"engagement":20,"support":10,"financial":5}'
      else '{"engagement":35,"financial":30,"technical":15,"support":15,"onboarding":5}' end)::json;
  end if;

  -- sub-scores (0..100)
  s_onb  := greatest(0, least(100, progress));
  s_tech := case farol when 'green' then 100 when 'amber' then 60 when 'red' then 20 else 70 end;
  s_eng  := case
              when days_login is null then (case when lifecycle = 'new' then 60 else 20 end)
              when days_login < 7 then 100 when days_login < 14 then 80 when days_login < 30 then 50 else 20 end;
  s_fin  := case when overdue = 0 then 100 else greatest(20, 100 - 40 * overdue) end;
  s_sup  := case when open_tickets = 0 then 100 else greatest(30, 100 - 25 * open_tickets) end;

  wsum := coalesce((wl->>'onboarding')::numeric,0) + coalesce((wl->>'technical')::numeric,0)
        + coalesce((wl->>'engagement')::numeric,0) + coalesce((wl->>'financial')::numeric,0)
        + coalesce((wl->>'support')::numeric,0);
  score := round((
      coalesce((wl->>'onboarding')::numeric,0) * s_onb + coalesce((wl->>'technical')::numeric,0) * s_tech +
      coalesce((wl->>'engagement')::numeric,0) * s_eng + coalesce((wl->>'financial')::numeric,0) * s_fin +
      coalesce((wl->>'support')::numeric,0) * s_sup
    ) / nullif(wsum, 0));
  score := greatest(0, least(100, coalesce(score, 0)));

  -- motivos (o "porquê")
  if farol = 'red' then reasons := reasons || 'Sistema em alerta (farol vermelho)'; end if;
  if farol = 'amber' then reasons := reasons || 'Sistema em ajuste (farol amarelo)'; end if;
  if overdue > 0 then reasons := reasons || (overdue || ' fatura(s) em atraso'); end if;
  if days_login is null and lifecycle = 'established' then reasons := reasons || 'Nunca acessou o portal'; end if;
  if days_login is not null and days_login >= 30 then reasons := reasons || ('Sem acesso há ' || round(days_login) || ' dias'); end if;
  if open_tickets > 0 then reasons := reasons || (open_tickets || ' chamado(s) em aberto há +3 dias'); end if;
  if lifecycle = 'new' and progress < 50 then reasons := reasons || ('Implantação em ' || round(progress) || '%'); end if;

  return json_build_object(
    'score', score,
    'label', case when score >= att then 'Saudável' when score >= risk then 'Atenção' else 'Em risco' end,
    'tone',  case when score >= att then 'ok'        when score >= risk then 'warn'    else 'crit' end,
    'lifecycle', lifecycle,
    'reasons', to_jsonb(reasons)
  );
end $$;


--
-- Name: reveal_module_secret(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reveal_module_secret(p_cred_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_org uuid; v_enc bytea;
begin
  select organization_id, secret_encrypted into v_org, v_enc
  from delivery.module_credentials where id = p_cred_id;
  if v_org is null then raise exception 'not found'; end if;
  if not (public.is_crasto_admin() or v_org = public.current_org_id()) then
    raise exception 'not authorized';
  end if;
  return extensions.pgp_sym_decrypt(v_enc, public.cred_key());
end $$;


--
-- Name: reveal_provider_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reveal_provider_key(p_provider text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'automation', 'vault'
    AS $$
  select ds.decrypted_secret
    from automation.integrations i
    join vault.decrypted_secrets ds on ds.name = i.vault_secret_name
   where i.key = p_provider and i.vault_secret_name is not null
   limit 1;
$$;


--
-- Name: same_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.same_org(p uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p is not null and p = public.current_org_id()
 $$;


--
-- Name: save_my_cnpj(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_my_cnpj(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
declare v_org uuid; v_role text; v_id uuid;
begin
  select organization_id, role into v_org, v_role from public.profiles where id = auth.uid();
  if v_org is null then raise exception 'sem organizacao'; end if;
  if v_role <> 'client_owner' then raise exception 'apenas o dono pode editar'; end if;
  if coalesce(p->>'id','') <> '' then
    update crm.company_cnpjs set
      cnpj=p->>'cnpj', trade_name=p->>'trade_name', legal_name=p->>'legal_name',
      country=coalesce(p->>'country',country), reg_type=coalesce(p->>'reg_type',reg_type),
      is_headquarters=coalesce((p->>'is_headquarters')::boolean,is_headquarters),
      is_active=coalesce((p->>'is_active')::boolean,is_active),
      inscricao_estadual=p->>'inscricao_estadual', inscricao_municipal=p->>'inscricao_municipal',
      regime_tributario=p->>'regime_tributario', notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid and organization_id=v_org returning id into v_id;
  else
    insert into crm.company_cnpjs(organization_id,cnpj,trade_name,legal_name,country,reg_type,is_headquarters,is_active,inscricao_estadual,inscricao_municipal,regime_tributario,notes)
    values (v_org,p->>'cnpj',p->>'trade_name',p->>'legal_name',coalesce(p->>'country','BR'),coalesce(p->>'reg_type','cnpj'),
      coalesce((p->>'is_headquarters')::boolean,false),coalesce((p->>'is_active')::boolean,true),
      p->>'inscricao_estadual',p->>'inscricao_municipal',p->>'regime_tributario',p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $$;


--
-- Name: save_my_partner(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_my_partner(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'crm'
    AS $$
declare v_org uuid; v_role text; v_id uuid;
begin
  select organization_id, role into v_org, v_role from public.profiles where id=auth.uid();
  if v_org is null then raise exception 'sem organizacao'; end if;
  if v_role <> 'client_owner' then raise exception 'apenas o dono edita'; end if;
  if coalesce(p->>'id','')<>'' then
    update crm.company_partners set full_name=p->>'full_name', cpf=p->>'cpf', rg=p->>'rg', email=p->>'email',
      mobile_phone=p->>'mobile_phone', role_title=p->>'role_title',
      ownership_percentage=nullif(p->>'ownership_percentage','')::numeric,
      is_ceo=coalesce((p->>'is_ceo')::boolean,is_ceo), is_active=coalesce((p->>'is_active')::boolean,is_active),
      notes=p->>'notes', updated_at=now()
    where id=(p->>'id')::uuid and organization_id=v_org returning id into v_id;
  else
    insert into crm.company_partners(organization_id,full_name,cpf,rg,email,mobile_phone,role_title,ownership_percentage,is_ceo,is_active,notes)
    values (v_org,p->>'full_name',p->>'cpf',p->>'rg',p->>'email',p->>'mobile_phone',p->>'role_title',nullif(p->>'ownership_percentage','')::numeric,coalesce((p->>'is_ceo')::boolean,false),coalesce((p->>'is_active')::boolean,true),p->>'notes')
    returning id into v_id;
  end if;
  return v_id;
end $$;


--
-- Name: set_module_access(uuid, text, text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_module_access(p_cm uuid, p_label text, p_login text, p_secret text, p_sso boolean DEFAULT false, p_url text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_id uuid; v_old bytea; v_org uuid; v_mod uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  select organization_id, vdi_module_id into v_org, v_mod from delivery.client_modules where id = p_cm;
  if v_org is null then raise exception 'instancia inexistente'; end if;
  select secret_encrypted into v_old from delivery.module_credentials where client_module_id = p_cm limit 1;
  delete from delivery.module_credentials where client_module_id = p_cm;
  insert into delivery.module_credentials(organization_id, vdi_module_id, client_module_id, label, login, secret_encrypted, sso_enabled, access_url)
  values (v_org, v_mod, p_cm, p_label, p_login,
          case when p_secret is null or p_secret='' then v_old
               else extensions.pgp_sym_encrypt(p_secret, public.cred_key()) end,
          coalesce(p_sso,false), p_url)
  returning id into v_id;
  return v_id;
end $$;


--
-- Name: set_module_credential(uuid, uuid, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_id uuid;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  insert into delivery.module_credentials(organization_id,vdi_module_id,label,login,secret_encrypted,sso_enabled)
  values (p_org,p_module,p_label,p_login,
          extensions.pgp_sym_encrypt(p_secret, public.cred_key()), coalesce(p_sso,false))
  returning id into v_id;
  return v_id;
end $$;


--
-- Name: set_module_credential(uuid, uuid, text, text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean DEFAULT false, p_url text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_id uuid; v_old bytea;
begin
  if not public.is_crasto_admin() then raise exception 'not authorized'; end if;
  select secret_encrypted into v_old from delivery.module_credentials
    where organization_id=p_org and vdi_module_id=p_module limit 1;
  delete from delivery.module_credentials where organization_id=p_org and vdi_module_id=p_module;
  insert into delivery.module_credentials(organization_id,vdi_module_id,label,login,secret_encrypted,sso_enabled,access_url)
  values (p_org,p_module,p_label,p_login,
          case when p_secret is null or p_secret='' then v_old
               else extensions.pgp_sym_encrypt(p_secret, public.cred_key()) end,
          coalesce(p_sso,false), p_url)
  returning id into v_id;
  return v_id;
end $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;


--
-- Name: update_my_org(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_my_org(p jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_org uuid; v_role text; v_country text; v_ddi text; v_num text;
begin
  select organization_id, role into v_org, v_role from public.profiles where id = auth.uid();
  if v_org is null then raise exception 'sem organizacao'; end if;
  if v_role <> 'client_owner' then raise exception 'apenas o dono pode editar os dados da empresa'; end if;
  update public.organizations set
    name       = coalesce(nullif(btrim(p->>'name'),''), name),
    legal_name = nullif(btrim(p->>'legal_name'),''),
    tax_id     = nullif(btrim(p->>'tax_id'),''),
    state_registration = nullif(btrim(p->>'state_registration'),''),
    municipal_registration = nullif(btrim(p->>'municipal_registration'),''),
    tax_regime = nullif(btrim(p->>'tax_regime'),''),
    owner_name = nullif(btrim(p->>'owner_name'),''),
    founded_on = nullif(p->>'founded_on','')::date,
    zip     = nullif(btrim(p->>'zip'),''),
    state   = nullif(btrim(p->>'state'),''),
    city    = nullif(btrim(p->>'city'),''),
    address = nullif(btrim(p->>'address'),''),
    address_number = nullif(btrim(p->>'address_number'),''),
    district = nullif(btrim(p->>'district'),''),
    address_complement = nullif(btrim(p->>'address_complement'),''),
    emails   = case when p ? 'emails'   then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'emails') x where btrim(x)<>''), '{}') else emails end,
    websites = case when p ? 'websites' then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'websites') x where btrim(x)<>''), '{}') else websites end,
    phones   = case when p ? 'phones'   then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'phones') x where btrim(x)<>''), '{}') else phones end,
    updated_at = now()
  where id = v_org;

  select country into v_country from public.organizations where id = v_org;
  v_num := regexp_replace(coalesce(p->'phones'->>0,''), '\D', '', 'g');
  if v_num <> '' then
    v_ddi := case v_country when 'US' then '+1' when 'PT' then '+351' when 'ES' then '+34' when 'MX' then '+52' when 'AR' then '+54' when 'CL' then '+56' when 'JP' then '+81' else '+55' end;
    update crm.phones set country_code = v_ddi, number = v_num where organization_id = v_org and is_primary is true;
    if not found then insert into crm.phones(organization_id,label,country_code,number,is_primary) values (v_org,'WhatsApp',v_ddi,v_num,true); end if;
  end if;
end $$;


--
-- Name: agents; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE agents.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    kind text,
    status text DEFAULT 'draft'::text NOT NULL,
    provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'paused'::text, 'offline'::text])))
);

ALTER TABLE ONLY agents.agents FORCE ROW LEVEL SECURITY;


--
-- Name: brain_overrides; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE agents.brain_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    global_item_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brain_overrides_action_check CHECK ((action = ANY (ARRAY['disable'::text, 'override'::text])))
);

ALTER TABLE ONLY agents.brain_overrides FORCE ROW LEVEL SECURITY;


--
-- Name: installed_packs; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE agents.installed_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    pack_id uuid NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY agents.installed_packs FORCE ROW LEVEL SECURITY;


--
-- Name: llm_models; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE agents.llm_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    label text NOT NULL,
    capabilities text[] DEFAULT '{}'::text[] NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT llm_models_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'descontinuado'::text])))
);

ALTER TABLE ONLY agents.llm_models FORCE ROW LEVEL SECURITY;


--
-- Name: dispatches; Type: TABLE; Schema: automation; Owner: -
--

CREATE TABLE automation.dispatches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    channel text NOT NULL,
    to_address text NOT NULL,
    template_id uuid,
    subject text,
    body text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    related_type text,
    related_id uuid,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dispatches_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text]))),
    CONSTRAINT dispatches_related_type_check CHECK ((related_type = ANY (ARRAY['proposal'::text, 'contract'::text, 'invoice'::text, 'notification'::text, 'other'::text]))),
    CONSTRAINT dispatches_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'canceled'::text])))
);


--
-- Name: integration_configs; Type: TABLE; Schema: automation; Owner: -
--

CREATE TABLE automation.integration_configs (
    key text NOT NULL,
    secret text,
    from_addr text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    secrets jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT integration_configs_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text, 'action_required'::text])))
);


--
-- Name: integrations; Type: TABLE; Schema: automation; Owner: -
--

CREATE TABLE automation.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    display_name text NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    vault_secret_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integrations_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text])))
);


--
-- Name: message_templates; Type: TABLE; Schema: automation; Owner: -
--

CREATE TABLE automation.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    subject text,
    body text NOT NULL,
    meta_template_name text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_templates_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text])))
);


--
-- Name: playbooks; Type: TABLE; Schema: automation; Owner: -
--

CREATE TABLE automation.playbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    type text NOT NULL,
    title text,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    model text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT playbooks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'final'::text]))),
    CONSTRAINT playbooks_type_check CHECK ((type = ANY (ARRAY['plano_diretor'::text, 'playbook_comercial'::text, 'marketing'::text, 'financeiro'::text])))
);


--
-- Name: invoices; Type: TABLE; Schema: billing; Owner: -
--

CREATE TABLE billing.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    description text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    due_date date,
    status text DEFAULT 'open'::text NOT NULL,
    provider text,
    provider_charge_id text,
    boleto_url text,
    pix_code text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_provider_check CHECK ((provider = ANY (ARRAY['asaas'::text, 'stripe'::text, 'manual'::text]))),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['open'::text, 'paid'::text, 'overdue'::text, 'canceled'::text])))
);


--
-- Name: commission_rules; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.commission_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connector_id uuid NOT NULL,
    service_id uuid,
    percent numeric(5,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_prices; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.service_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    price numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: services; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    unit text DEFAULT 'projeto'::text NOT NULL,
    price_table numeric(12,2) DEFAULT 0 NOT NULL,
    base_commission numeric(5,2) DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_min numeric(12,2),
    price_max numeric(12,2),
    internal boolean DEFAULT false NOT NULL,
    notes text,
    CONSTRAINT services_unit_check CHECK ((unit = ANY (ARRAY['mensal'::text, 'hora'::text, 'projeto'::text, 'setup_unico'::text])))
);


--
-- Name: vdi_catalog; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.vdi_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    department text,
    description text,
    source_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vdi_modules; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.vdi_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    icon text,
    external_url text,
    status text DEFAULT 'published'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    department text,
    internal_url text,
    setup_workdays integer DEFAULT 7 NOT NULL,
    client_deadline_days integer DEFAULT 30 NOT NULL,
    customization text DEFAULT 'standard'::text NOT NULL,
    tools_cost_by text DEFAULT 'client'::text NOT NULL,
    remix_date date,
    version text DEFAULT 'v1'::text NOT NULL,
    crm_solution boolean DEFAULT false NOT NULL,
    CONSTRAINT vdi_modules_customization_check CHECK ((customization = ANY (ARRAY['standard'::text, 'custom'::text]))),
    CONSTRAINT vdi_modules_status_check CHECK ((status = ANY (ARRAY['published'::text, 'beta'::text, 'draft'::text]))),
    CONSTRAINT vdi_modules_tools_cost_by_check CHECK ((tools_cost_by = ANY (ARRAY['client'::text, 'crasto'::text])))
);


--
-- Name: contracts; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    proposal_id uuid,
    autentique_document_id text,
    title text,
    status text DEFAULT 'pending'::text NOT NULL,
    url text,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contracts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text, 'cancelled'::text])))
);


--
-- Name: proposal_items; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.proposal_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    service_id uuid,
    description text NOT NULL,
    qty numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    line_total numeric(12,2) GENERATED ALWAYS AS ((qty * unit_price)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    specifics jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: proposals; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    connector_id uuid,
    title text,
    status text DEFAULT 'draft'::text NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    commission_total numeric(12,2) DEFAULT 0 NOT NULL,
    attachments jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    special_sale boolean DEFAULT false NOT NULL,
    tax_rate numeric(5,2) DEFAULT 8.68 NOT NULL,
    tax_amount numeric(12,2) GENERATED ALWAYS AS (
CASE
    WHEN special_sale THEN (0)::numeric
    ELSE round(((subtotal * tax_rate) / 100.0), 2)
END) STORED,
    bill_to text,
    bill_to_address text,
    currency text DEFAULT 'BRL'::text NOT NULL,
    fx_rate numeric(10,4),
    attachment_doc_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    contract_path text,
    contract_generated_at timestamp with time zone,
    autentique_doc_id text,
    autentique_link text,
    contract_status text DEFAULT 'none'::text NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT proposals_contract_status_check CHECK ((contract_status = ANY (ARRAY['none'::text, 'generated'::text, 'sent'::text, 'signed'::text, 'rejected'::text]))),
    CONSTRAINT proposals_currency_check CHECK ((currency = ANY (ARRAY['BRL'::text, 'USD'::text]))),
    CONSTRAINT proposals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: activities; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    type text DEFAULT 'note'::text,
    title text,
    description text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mapa_submissions; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.mapa_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    lang text DEFAULT 'pt'::text NOT NULL,
    email text,
    whatsapp text,
    empresa text,
    cargo text,
    segmento text,
    faturamento text,
    tempo text,
    dores text[] DEFAULT '{}'::text[] NOT NULL,
    dor_outro text,
    gargalo text,
    dimensoes jsonb DEFAULT '{}'::jsonb NOT NULL,
    scores jsonb DEFAULT '[]'::jsonb NOT NULL,
    maturidade integer,
    onde_paga text[] DEFAULT '{}'::text[] NOT NULL,
    passo1_key text,
    magic_hash text,
    intent_signal text,
    source text DEFAULT 'mapa_site'::text NOT NULL,
    email_sent boolean DEFAULT false NOT NULL,
    email_error text,
    user_agent text,
    ip inet
);


--
-- Name: mapadeia_submissions; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.mapadeia_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    origem text DEFAULT 'mapadeia_reuniao'::text NOT NULL,
    lang text,
    nome text,
    email text,
    whatsapp text,
    empresa text,
    deep jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw jsonb,
    user_agent text,
    ip inet
);


--
-- Name: people; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    role text,
    email text,
    birthday date,
    is_primary boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: phones; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.phones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    person_id uuid,
    label text DEFAULT 'mobile'::text,
    country_code text DEFAULT '+55'::text,
    number text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_ids; Type: TABLE; Schema: crm; Owner: -
--

CREATE TABLE crm.tax_ids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    kind text DEFAULT 'CNPJ'::text NOT NULL,
    value text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    address text
);


--
-- Name: client_modules; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.client_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    vdi_module_id uuid NOT NULL,
    status text DEFAULT 'implementing'::text NOT NULL,
    external_url text,
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rollout_progress integer DEFAULT 0 NOT NULL,
    rollout_due date,
    rollout_status text DEFAULT 'in_progress'::text NOT NULL,
    label text,
    crm_agent_id uuid,
    access_mode text DEFAULT 'link'::text NOT NULL,
    CONSTRAINT client_modules_access_mode_chk CHECK ((access_mode = ANY (ARRAY['link'::text, 'embed'::text, 'sso'::text]))),
    CONSTRAINT client_modules_status_check CHECK ((status = ANY (ARRAY['active'::text, 'implementing'::text, 'paused'::text, 'cancelled'::text])))
);


--
-- Name: client_services; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.client_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    service_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    service_name text,
    service_description text,
    service_category text,
    service_unit text
);


--
-- Name: implementations; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.implementations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    overall_progress integer DEFAULT 0 NOT NULL,
    contract_days integer DEFAULT 30 NOT NULL,
    started_at date,
    due_date date,
    status text DEFAULT 'in_progress'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT implementations_overall_progress_check CHECK (((overall_progress >= 0) AND (overall_progress <= 100))),
    CONSTRAINT implementations_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'delivered'::text, 'on_hold'::text])))
);


--
-- Name: module_credentials; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.module_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    vdi_module_id uuid,
    label text,
    login text,
    secret_encrypted bytea,
    sso_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    access_url text,
    client_module_id uuid
);


--
-- Name: module_sessions; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.module_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    client_module_id uuid NOT NULL,
    vdi_module_id uuid,
    user_id uuid NOT NULL,
    mode text DEFAULT 'embed'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone
);


--
-- Name: project_tasks; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.project_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    planned_start date,
    planned_end date,
    actual_start date,
    actual_end date,
    status text DEFAULT 'todo'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_tasks_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT project_tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text])))
);


--
-- Name: system_health; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.system_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    status text DEFAULT 'green'::text NOT NULL,
    message text,
    eta timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_health_status_check CHECK ((status = ANY (ARRAY['green'::text, 'amber'::text, 'red'::text])))
);


--
-- Name: user_module_access; Type: TABLE; Schema: delivery; Owner: -
--

CREATE TABLE delivery.user_module_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    vdi_module_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_usage; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.ai_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    provider text NOT NULL,
    tokens_in bigint DEFAULT 0 NOT NULL,
    tokens_out bigint DEFAULT 0 NOT NULL,
    cost numeric(12,2) DEFAULT 0 NOT NULL,
    period_start date,
    period_end date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    platform text,
    kind text DEFAULT 'cliente'::text NOT NULL,
    purpose text,
    status text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT ai_usage_provider_check CHECK (((provider IS NULL) OR (provider = ANY (ARRAY['anthropic'::text, 'openai'::text, 'google'::text, 'elevenlabs'::text, 'other'::text]))))
);


--
-- Name: expenses; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    category text NOT NULL,
    description text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    incurred_on date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['ia'::text, 'infra'::text, 'suporte'::text, 'outros'::text])))
);


--
-- Name: settings; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    cnpj text,
    plan text,
    status text DEFAULT 'active'::text NOT NULL,
    referred_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stage text DEFAULT 'prospecto'::text NOT NULL,
    country text DEFAULT 'BR'::text NOT NULL,
    tax_id text,
    tax_id_type text,
    founded_on date,
    website text,
    owner_name text,
    notes text,
    legal_name text,
    state_registration text,
    municipal_registration text,
    tax_regime text,
    zip text,
    state text,
    city text,
    address text,
    address_number text,
    district text,
    address_complement text,
    emails text[] DEFAULT '{}'::text[] NOT NULL,
    websites text[] DEFAULT '{}'::text[] NOT NULL,
    phones text[] DEFAULT '{}'::text[] NOT NULL,
    source text,
    first_diagnostic_at timestamp with time zone,
    last_maturity integer,
    intent_signal text,
    CONSTRAINT organizations_stage_check CHECK ((stage = ANY (ARRAY['contato'::text, 'prospecto'::text, 'lead'::text, 'qualificado'::text, 'cliente'::text])))
);


--
-- Name: client_pnl; Type: VIEW; Schema: finance; Owner: -
--

CREATE VIEW finance.client_pnl AS
 SELECT id AS organization_id,
    name AS organization_name,
    COALESCE(( SELECT sum(e.amount) AS sum
           FROM finance.expenses e
          WHERE (e.organization_id = o.id)), (0)::numeric) AS total_cost,
    COALESCE(( SELECT sum(p.subtotal) AS sum
           FROM commerce.proposals p
          WHERE ((p.organization_id = o.id) AND (p.status = 'accepted'::text))), (0)::numeric) AS total_sale,
    round(((COALESCE(( SELECT sum(p.subtotal) AS sum
           FROM commerce.proposals p
          WHERE ((p.organization_id = o.id) AND (p.status = 'accepted'::text))), (0)::numeric) * ( SELECT (settings.value)::numeric AS value
           FROM finance.settings
          WHERE (settings.key = 'tax_rate'::text))) / 100.0), 2) AS tax,
    ((COALESCE(( SELECT sum(p.subtotal) AS sum
           FROM commerce.proposals p
          WHERE ((p.organization_id = o.id) AND (p.status = 'accepted'::text))), (0)::numeric) - COALESCE(( SELECT sum(e.amount) AS sum
           FROM finance.expenses e
          WHERE (e.organization_id = o.id)), (0)::numeric)) - round(((COALESCE(( SELECT sum(p.subtotal) AS sum
           FROM commerce.proposals p
          WHERE ((p.organization_id = o.id) AND (p.status = 'accepted'::text))), (0)::numeric) * ( SELECT (settings.value)::numeric AS value
           FROM finance.settings
          WHERE (settings.key = 'tax_rate'::text))) / 100.0), 2)) AS profit
   FROM public.organizations o;


--
-- Name: commissions; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    connector_id uuid NOT NULL,
    proposal_id uuid,
    sale_amount numeric(12,2) DEFAULT 0 NOT NULL,
    percent numeric(5,2) DEFAULT 0 NOT NULL,
    commission_amount numeric(12,2) GENERATED ALWAYS AS (round(((sale_amount * percent) / 100.0), 2)) STORED,
    nf_status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commissions_nf_status_check CHECK ((nf_status = ANY (ARRAY['pending'::text, 'issued'::text, 'paid'::text])))
);


--
-- Name: support_hours; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.support_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    period date NOT NULL,
    plan_hours numeric(6,2) DEFAULT 0 NOT NULL,
    used_hours numeric(6,2) DEFAULT 0 NOT NULL,
    balance numeric(6,2) GENERATED ALWAYS AS ((plan_hours - used_hours)) STORED,
    status text DEFAULT 'no_plano'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_hours_status_check CHECK ((status = ANY (ARRAY['no_plano'::text, 'esgotado'::text, 'extra'::text, 'antecipado'::text])))
);


--
-- Name: connectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    commission_default numeric(5,2) DEFAULT 0 NOT NULL,
    payout_method text DEFAULT 'nota_fiscal'::text NOT NULL,
    bank_details jsonb,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_type text DEFAULT 'indicador'::text NOT NULL,
    email text,
    phone_country_code text DEFAULT '+55'::text NOT NULL,
    phone text,
    payment_method text DEFAULT 'pix'::text NOT NULL,
    payment_details text,
    issues_invoice boolean DEFAULT false NOT NULL,
    payment_handling text DEFAULT 'nota_fiscal'::text NOT NULL,
    contract_months integer DEFAULT 12 NOT NULL,
    notes text,
    CONSTRAINT connectors_agent_type_check CHECK ((agent_type = ANY (ARRAY['indicador'::text, 'conector'::text]))),
    CONSTRAINT connectors_payment_handling_check CHECK ((payment_handling = ANY (ARRAY['nota_fiscal'::text, 'por_fora'::text, 'reembolso'::text]))),
    CONSTRAINT connectors_payment_method_check CHECK ((payment_method = ANY (ARRAY['pix'::text, 'bank'::text, 'bitcoin'::text, 'other'::text]))),
    CONSTRAINT connectors_payout_method_check CHECK ((payout_method = ANY (ARRAY['nota_fiscal'::text, 'permuta'::text, 'parceria'::text])))
);


--
-- Name: member_screens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_screens (
    user_id uuid NOT NULL,
    screen_key text NOT NULL
);

ALTER TABLE ONLY public.member_screens FORCE ROW LEVEL SECURITY;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    role public.app_role DEFAULT 'client_member'::public.app_role NOT NULL,
    organization_id uuid,
    connector_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text
);


--
-- Name: incidents; Type: TABLE; Schema: support; Owner: -
--

CREATE TABLE support.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    severity text DEFAULT 'P3'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    sla_response_min integer,
    sla_resolution_min integer,
    client_message text,
    eta timestamp with time zone,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT incidents_severity_check CHECK ((severity = ANY (ARRAY['P1'::text, 'P2'::text, 'P3'::text, 'P4'::text]))),
    CONSTRAINT incidents_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: support; Owner: -
--

CREATE TABLE support.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    channel text DEFAULT 'portal'::text NOT NULL,
    title text,
    body text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_channel_check CHECK ((channel = ANY (ARRAY['portal'::text, 'email'::text, 'whatsapp'::text])))
);


--
-- Name: pending_actions; Type: TABLE; Schema: support; Owner: -
--

CREATE TABLE support.pending_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    type text DEFAULT 'other'::text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    due_date date,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pending_actions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text]))),
    CONSTRAINT pending_actions_type_check CHECK ((type = ANY (ARRAY['document'::text, 'credential'::text, 'approval'::text, 'schedule'::text, 'other'::text])))
);


--
-- Name: tickets; Type: TABLE; Schema: support; Owner: -
--

CREATE TABLE support.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    subject text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'support'::text NOT NULL,
    CONSTRAINT tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: ai_processing_queue; Type: TABLE; Schema: whatsapp; Owner: -
--

CREATE TABLE whatsapp.ai_processing_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY whatsapp.ai_processing_queue FORCE ROW LEVEL SECURITY;


--
-- Name: contacts; Type: TABLE; Schema: whatsapp; Owner: -
--

CREATE TABLE whatsapp.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_id uuid,
    name text,
    phone text,
    client_memory jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY whatsapp.contacts FORCE ROW LEVEL SECURITY;


--
-- Name: conversations; Type: TABLE; Schema: whatsapp; Owner: -
--

CREATE TABLE whatsapp.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_id uuid,
    contact_id uuid,
    status text DEFAULT 'ai'::text NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['ai'::text, 'human'::text, 'paused'::text])))
);

ALTER TABLE ONLY whatsapp.conversations FORCE ROW LEVEL SECURITY;


--
-- Name: dead_letter; Type: TABLE; Schema: whatsapp; Owner: -
--

CREATE TABLE whatsapp.dead_letter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    source text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY whatsapp.dead_letter FORCE ROW LEVEL SECURITY;


--
-- Name: message_grouping_queue; Type: TABLE; Schema: whatsapp; Owner: -
--

CREATE TABLE whatsapp.message_grouping_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    process_after timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY whatsapp.message_grouping_queue FORCE ROW LEVEL SECURITY;


--
-- Name: messages; Type: TABLE; Schema: whatsapp; Owner: -
--

CREATE TABLE whatsapp.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    from_type text,
    body text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY whatsapp.messages FORCE ROW LEVEL SECURITY;


--
-- Name: send_queue; Type: TABLE; Schema: whatsapp; Owner: -
--

CREATE TABLE whatsapp.send_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY whatsapp.send_queue FORCE ROW LEVEL SECURITY;


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: brain_overrides brain_overrides_pkey; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.brain_overrides
    ADD CONSTRAINT brain_overrides_pkey PRIMARY KEY (id);


--
-- Name: installed_packs installed_packs_pkey; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.installed_packs
    ADD CONSTRAINT installed_packs_pkey PRIMARY KEY (id);


--
-- Name: knowledge knowledge_pkey; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.knowledge
    ADD CONSTRAINT knowledge_pkey PRIMARY KEY (id);


--
-- Name: llm_models llm_models_pkey; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.llm_models
    ADD CONSTRAINT llm_models_pkey PRIMARY KEY (id);


--
-- Name: llm_models llm_models_provider_model_key; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.llm_models
    ADD CONSTRAINT llm_models_provider_model_key UNIQUE (provider, model);


--
-- Name: rules rules_pkey; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.rules
    ADD CONSTRAINT rules_pkey PRIMARY KEY (id);


--
-- Name: skill_packs skill_packs_key_key; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.skill_packs
    ADD CONSTRAINT skill_packs_key_key UNIQUE (key);


--
-- Name: skill_packs skill_packs_pkey; Type: CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.skill_packs
    ADD CONSTRAINT skill_packs_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: dispatches dispatches_pkey; Type: CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.dispatches
    ADD CONSTRAINT dispatches_pkey PRIMARY KEY (id);


--
-- Name: integration_configs integration_configs_pkey; Type: CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.integration_configs
    ADD CONSTRAINT integration_configs_pkey PRIMARY KEY (key);


--
-- Name: integrations integrations_key_key; Type: CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.integrations
    ADD CONSTRAINT integrations_key_key UNIQUE (key);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_channel_key_key; Type: CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.message_templates
    ADD CONSTRAINT message_templates_channel_key_key UNIQUE (channel, key);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: playbooks playbooks_pkey; Type: CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.playbooks
    ADD CONSTRAINT playbooks_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: billing; Owner: -
--

ALTER TABLE ONLY billing.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_connector_id_service_id_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.commission_rules
    ADD CONSTRAINT commission_rules_connector_id_service_id_key UNIQUE (connector_id, service_id);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: service_prices service_prices_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.service_prices
    ADD CONSTRAINT service_prices_pkey PRIMARY KEY (id);


--
-- Name: service_prices service_prices_service_id_organization_id_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.service_prices
    ADD CONSTRAINT service_prices_service_id_organization_id_key UNIQUE (service_id, organization_id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: vdi_catalog vdi_catalog_name_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.vdi_catalog
    ADD CONSTRAINT vdi_catalog_name_key UNIQUE (name);


--
-- Name: vdi_catalog vdi_catalog_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.vdi_catalog
    ADD CONSTRAINT vdi_catalog_pkey PRIMARY KEY (id);


--
-- Name: vdi_modules vdi_modules_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.vdi_modules
    ADD CONSTRAINT vdi_modules_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: proposal_items proposal_items_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposal_items
    ADD CONSTRAINT proposal_items_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: company_cnpjs company_cnpjs_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.company_cnpjs
    ADD CONSTRAINT company_cnpjs_pkey PRIMARY KEY (id);


--
-- Name: company_partners company_partners_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.company_partners
    ADD CONSTRAINT company_partners_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: mapa_submissions mapa_submissions_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.mapa_submissions
    ADD CONSTRAINT mapa_submissions_pkey PRIMARY KEY (id);


--
-- Name: mapadeia_submissions mapadeia_submissions_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.mapadeia_submissions
    ADD CONSTRAINT mapadeia_submissions_pkey PRIMARY KEY (id);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
-- Name: phones phones_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.phones
    ADD CONSTRAINT phones_pkey PRIMARY KEY (id);


--
-- Name: tax_ids tax_ids_pkey; Type: CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.tax_ids
    ADD CONSTRAINT tax_ids_pkey PRIMARY KEY (id);


--
-- Name: client_modules client_modules_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.client_modules
    ADD CONSTRAINT client_modules_pkey PRIMARY KEY (id);


--
-- Name: client_services client_services_organization_id_service_id_key; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.client_services
    ADD CONSTRAINT client_services_organization_id_service_id_key UNIQUE (organization_id, service_id);


--
-- Name: client_services client_services_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.client_services
    ADD CONSTRAINT client_services_pkey PRIMARY KEY (id);


--
-- Name: implementations implementations_organization_id_key; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.implementations
    ADD CONSTRAINT implementations_organization_id_key UNIQUE (organization_id);


--
-- Name: implementations implementations_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.implementations
    ADD CONSTRAINT implementations_pkey PRIMARY KEY (id);


--
-- Name: module_credentials module_credentials_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.module_credentials
    ADD CONSTRAINT module_credentials_pkey PRIMARY KEY (id);


--
-- Name: module_sessions module_sessions_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.module_sessions
    ADD CONSTRAINT module_sessions_pkey PRIMARY KEY (id);


--
-- Name: project_tasks project_tasks_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.project_tasks
    ADD CONSTRAINT project_tasks_pkey PRIMARY KEY (id);


--
-- Name: system_health system_health_organization_id_key; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.system_health
    ADD CONSTRAINT system_health_organization_id_key UNIQUE (organization_id);


--
-- Name: system_health system_health_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.system_health
    ADD CONSTRAINT system_health_pkey PRIMARY KEY (id);


--
-- Name: user_module_access user_module_access_pkey; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.user_module_access
    ADD CONSTRAINT user_module_access_pkey PRIMARY KEY (id);


--
-- Name: user_module_access user_module_access_user_id_vdi_module_id_key; Type: CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.user_module_access
    ADD CONSTRAINT user_module_access_user_id_vdi_module_id_key UNIQUE (user_id, vdi_module_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: operational_costs operational_costs_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.operational_costs
    ADD CONSTRAINT operational_costs_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: support_hours support_hours_organization_id_period_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.support_hours
    ADD CONSTRAINT support_hours_organization_id_period_key UNIQUE (organization_id, period);


--
-- Name: support_hours support_hours_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.support_hours
    ADD CONSTRAINT support_hours_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: connectors connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connectors
    ADD CONSTRAINT connectors_pkey PRIMARY KEY (id);


--
-- Name: member_screens member_screens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_screens
    ADD CONSTRAINT member_screens_pkey PRIMARY KEY (user_id, screen_key);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: pending_actions pending_actions_pkey; Type: CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.pending_actions
    ADD CONSTRAINT pending_actions_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: ai_processing_queue ai_processing_queue_pkey; Type: CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.ai_processing_queue
    ADD CONSTRAINT ai_processing_queue_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: dead_letter dead_letter_pkey; Type: CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.dead_letter
    ADD CONSTRAINT dead_letter_pkey PRIMARY KEY (id);


--
-- Name: message_grouping_queue message_grouping_queue_pkey; Type: CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.message_grouping_queue
    ADD CONSTRAINT message_grouping_queue_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: send_queue send_queue_pkey; Type: CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.send_queue
    ADD CONSTRAINT send_queue_pkey PRIMARY KEY (id);


--
-- Name: idx_agents_org; Type: INDEX; Schema: agents; Owner: -
--

CREATE INDEX idx_agents_org ON agents.agents USING btree (organization_id);


--
-- Name: events_action_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX events_action_idx ON audit.events USING btree (action);


--
-- Name: events_at_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX events_at_idx ON audit.events USING btree (at DESC);


--
-- Name: idx_audit_at; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX idx_audit_at ON audit.events USING btree (at DESC);


--
-- Name: idx_audit_org; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX idx_audit_org ON audit.events USING btree (organization_id);


--
-- Name: idx_disp_org; Type: INDEX; Schema: automation; Owner: -
--

CREATE INDEX idx_disp_org ON automation.dispatches USING btree (organization_id);


--
-- Name: idx_disp_status; Type: INDEX; Schema: automation; Owner: -
--

CREATE INDEX idx_disp_status ON automation.dispatches USING btree (status);


--
-- Name: idx_pb_org; Type: INDEX; Schema: automation; Owner: -
--

CREATE INDEX idx_pb_org ON automation.playbooks USING btree (organization_id);


--
-- Name: idx_inv_org; Type: INDEX; Schema: billing; Owner: -
--

CREATE INDEX idx_inv_org ON billing.invoices USING btree (organization_id);


--
-- Name: idx_inv_status; Type: INDEX; Schema: billing; Owner: -
--

CREATE INDEX idx_inv_status ON billing.invoices USING btree (status);


--
-- Name: idx_commrule_conn; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_commrule_conn ON catalog.commission_rules USING btree (connector_id);


--
-- Name: idx_svcprice_org; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_svcprice_org ON catalog.service_prices USING btree (organization_id);


--
-- Name: idx_vdicat_dep; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_vdicat_dep ON catalog.vdi_catalog USING btree (department);


--
-- Name: idx_vdimod_cat; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_vdimod_cat ON catalog.vdi_modules USING btree (category);


--
-- Name: uq_services_name; Type: INDEX; Schema: catalog; Owner: -
--

CREATE UNIQUE INDEX uq_services_name ON catalog.services USING btree (name);


--
-- Name: idx_contract_org; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_contract_org ON commerce.contracts USING btree (organization_id);


--
-- Name: idx_prop_org; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_prop_org ON commerce.proposals USING btree (organization_id);


--
-- Name: idx_propitem_prop; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_propitem_prop ON commerce.proposal_items USING btree (proposal_id);


--
-- Name: idx_crm_act_org; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_crm_act_org ON crm.activities USING btree (organization_id);


--
-- Name: idx_crm_docs_org; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_crm_docs_org ON crm.documents USING btree (organization_id);


--
-- Name: idx_crm_people_org; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_crm_people_org ON crm.people USING btree (organization_id);


--
-- Name: idx_crm_phones_org; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_crm_phones_org ON crm.phones USING btree (organization_id);


--
-- Name: idx_mapa_sub_created; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_mapa_sub_created ON crm.mapa_submissions USING btree (created_at DESC);


--
-- Name: idx_mapa_sub_email; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_mapa_sub_email ON crm.mapa_submissions USING btree (lower(email));


--
-- Name: idx_mapa_sub_ip; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_mapa_sub_ip ON crm.mapa_submissions USING btree (ip, created_at DESC);


--
-- Name: idx_mapa_sub_org; Type: INDEX; Schema: crm; Owner: -
--

CREATE INDEX idx_mapa_sub_org ON crm.mapa_submissions USING btree (organization_id);


--
-- Name: idx_cm_org; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX idx_cm_org ON delivery.client_modules USING btree (organization_id);


--
-- Name: idx_health_org; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX idx_health_org ON delivery.system_health USING btree (organization_id);


--
-- Name: idx_impl_org; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX idx_impl_org ON delivery.implementations USING btree (organization_id);


--
-- Name: idx_task_org; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX idx_task_org ON delivery.project_tasks USING btree (organization_id);


--
-- Name: idx_uma_org; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX idx_uma_org ON delivery.user_module_access USING btree (organization_id);


--
-- Name: idx_uma_user; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX idx_uma_user ON delivery.user_module_access USING btree (user_id);


--
-- Name: module_sessions_cm_idx; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX module_sessions_cm_idx ON delivery.module_sessions USING btree (client_module_id, started_at DESC);


--
-- Name: module_sessions_org_idx; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX module_sessions_org_idx ON delivery.module_sessions USING btree (organization_id, started_at DESC);


--
-- Name: module_sessions_user_idx; Type: INDEX; Schema: delivery; Owner: -
--

CREATE INDEX module_sessions_user_idx ON delivery.module_sessions USING btree (user_id, started_at DESC);


--
-- Name: idx_ai_org; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_ai_org ON finance.ai_usage USING btree (organization_id);


--
-- Name: idx_ai_prov; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_ai_prov ON finance.ai_usage USING btree (provider);


--
-- Name: idx_comm_conn; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_comm_conn ON finance.commissions USING btree (connector_id);


--
-- Name: idx_comm_org; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_comm_org ON finance.commissions USING btree (organization_id);


--
-- Name: idx_exp_org; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_exp_org ON finance.expenses USING btree (organization_id);


--
-- Name: idx_sh_org; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_sh_org ON finance.support_hours USING btree (organization_id);


--
-- Name: idx_org_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_stage ON public.organizations USING btree (stage);


--
-- Name: idx_orgs_referred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_referred ON public.organizations USING btree (referred_by);


--
-- Name: idx_profiles_conn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_conn ON public.profiles USING btree (connector_id);


--
-- Name: idx_profiles_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_org ON public.profiles USING btree (organization_id);


--
-- Name: idx_inc_org; Type: INDEX; Schema: support; Owner: -
--

CREATE INDEX idx_inc_org ON support.incidents USING btree (organization_id);


--
-- Name: idx_notif_org; Type: INDEX; Schema: support; Owner: -
--

CREATE INDEX idx_notif_org ON support.notifications USING btree (organization_id);


--
-- Name: idx_pend_org; Type: INDEX; Schema: support; Owner: -
--

CREATE INDEX idx_pend_org ON support.pending_actions USING btree (organization_id);


--
-- Name: idx_tick_org; Type: INDEX; Schema: support; Owner: -
--

CREATE INDEX idx_tick_org ON support.tickets USING btree (organization_id);


--
-- Name: events trg_audit_immutable; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER trg_audit_immutable BEFORE DELETE OR UPDATE ON audit.events FOR EACH ROW EXECUTE FUNCTION audit.no_mutate();


--
-- Name: dispatches trg_dispatches_upd; Type: TRIGGER; Schema: automation; Owner: -
--

CREATE TRIGGER trg_dispatches_upd BEFORE UPDATE ON automation.dispatches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: integrations trg_integrations_upd; Type: TRIGGER; Schema: automation; Owner: -
--

CREATE TRIGGER trg_integrations_upd BEFORE UPDATE ON automation.integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: message_templates trg_message_templates_upd; Type: TRIGGER; Schema: automation; Owner: -
--

CREATE TRIGGER trg_message_templates_upd BEFORE UPDATE ON automation.message_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: playbooks trg_playbooks_upd; Type: TRIGGER; Schema: automation; Owner: -
--

CREATE TRIGGER trg_playbooks_upd BEFORE UPDATE ON automation.playbooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoices trg_invoices_upd; Type: TRIGGER; Schema: billing; Owner: -
--

CREATE TRIGGER trg_invoices_upd BEFORE UPDATE ON billing.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: commission_rules trg_commrule_upd; Type: TRIGGER; Schema: catalog; Owner: -
--

CREATE TRIGGER trg_commrule_upd BEFORE UPDATE ON catalog.commission_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: services trg_svc_upd; Type: TRIGGER; Schema: catalog; Owner: -
--

CREATE TRIGGER trg_svc_upd BEFORE UPDATE ON catalog.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_prices trg_svcprice_upd; Type: TRIGGER; Schema: catalog; Owner: -
--

CREATE TRIGGER trg_svcprice_upd BEFORE UPDATE ON catalog.service_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: vdi_modules trg_vdimod_upd; Type: TRIGGER; Schema: catalog; Owner: -
--

CREATE TRIGGER trg_vdimod_upd BEFORE UPDATE ON catalog.vdi_modules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contracts trg_contract_upd; Type: TRIGGER; Schema: commerce; Owner: -
--

CREATE TRIGGER trg_contract_upd BEFORE UPDATE ON commerce.contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: proposals trg_prop_upd; Type: TRIGGER; Schema: commerce; Owner: -
--

CREATE TRIGGER trg_prop_upd BEFORE UPDATE ON commerce.proposals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: people trg_people_upd; Type: TRIGGER; Schema: crm; Owner: -
--

CREATE TRIGGER trg_people_upd BEFORE UPDATE ON crm.people FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: client_modules trg_cm_upd; Type: TRIGGER; Schema: delivery; Owner: -
--

CREATE TRIGGER trg_cm_upd BEFORE UPDATE ON delivery.client_modules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: system_health trg_health_upd; Type: TRIGGER; Schema: delivery; Owner: -
--

CREATE TRIGGER trg_health_upd BEFORE UPDATE ON delivery.system_health FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: implementations trg_impl_upd; Type: TRIGGER; Schema: delivery; Owner: -
--

CREATE TRIGGER trg_impl_upd BEFORE UPDATE ON delivery.implementations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: module_credentials trg_modcred_upd; Type: TRIGGER; Schema: delivery; Owner: -
--

CREATE TRIGGER trg_modcred_upd BEFORE UPDATE ON delivery.module_credentials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: project_tasks trg_task_upd; Type: TRIGGER; Schema: delivery; Owner: -
--

CREATE TRIGGER trg_task_upd BEFORE UPDATE ON delivery.project_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: commissions trg_comm_upd; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER trg_comm_upd BEFORE UPDATE ON finance.commissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: support_hours trg_sh_upd; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER trg_sh_upd BEFORE UPDATE ON finance.support_hours FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: connectors trg_conn_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conn_updated BEFORE UPDATE ON public.connectors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations trg_org_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_prof_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prof_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: incidents trg_incidents_upd; Type: TRIGGER; Schema: support; Owner: -
--

CREATE TRIGGER trg_incidents_upd BEFORE UPDATE ON support.incidents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notifications trg_notifications_upd; Type: TRIGGER; Schema: support; Owner: -
--

CREATE TRIGGER trg_notifications_upd BEFORE UPDATE ON support.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pending_actions trg_pending_actions_upd; Type: TRIGGER; Schema: support; Owner: -
--

CREATE TRIGGER trg_pending_actions_upd BEFORE UPDATE ON support.pending_actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tickets trg_tickets_upd; Type: TRIGGER; Schema: support; Owner: -
--

CREATE TRIGGER trg_tickets_upd BEFORE UPDATE ON support.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: agents agents_organization_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.agents
    ADD CONSTRAINT agents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: brain_overrides brain_overrides_agent_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.brain_overrides
    ADD CONSTRAINT brain_overrides_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents.agents(id) ON DELETE CASCADE;


--
-- Name: installed_packs installed_packs_agent_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.installed_packs
    ADD CONSTRAINT installed_packs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents.agents(id) ON DELETE CASCADE;


--
-- Name: installed_packs installed_packs_pack_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.installed_packs
    ADD CONSTRAINT installed_packs_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES agents.skill_packs(id) ON DELETE CASCADE;


--
-- Name: knowledge knowledge_agent_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.knowledge
    ADD CONSTRAINT knowledge_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents.agents(id) ON DELETE CASCADE;


--
-- Name: knowledge knowledge_organization_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.knowledge
    ADD CONSTRAINT knowledge_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rules rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: -
--

ALTER TABLE ONLY agents.rules
    ADD CONSTRAINT rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: dispatches dispatches_organization_id_fkey; Type: FK CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.dispatches
    ADD CONSTRAINT dispatches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: dispatches dispatches_template_id_fkey; Type: FK CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.dispatches
    ADD CONSTRAINT dispatches_template_id_fkey FOREIGN KEY (template_id) REFERENCES automation.message_templates(id) ON DELETE SET NULL;


--
-- Name: playbooks playbooks_created_by_fkey; Type: FK CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.playbooks
    ADD CONSTRAINT playbooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: playbooks playbooks_organization_id_fkey; Type: FK CONSTRAINT; Schema: automation; Owner: -
--

ALTER TABLE ONLY automation.playbooks
    ADD CONSTRAINT playbooks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_organization_id_fkey; Type: FK CONSTRAINT; Schema: billing; Owner: -
--

ALTER TABLE ONLY billing.invoices
    ADD CONSTRAINT invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: commission_rules commission_rules_connector_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.commission_rules
    ADD CONSTRAINT commission_rules_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.connectors(id) ON DELETE CASCADE;


--
-- Name: commission_rules commission_rules_service_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.commission_rules
    ADD CONSTRAINT commission_rules_service_id_fkey FOREIGN KEY (service_id) REFERENCES catalog.services(id) ON DELETE CASCADE;


--
-- Name: service_prices service_prices_organization_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.service_prices
    ADD CONSTRAINT service_prices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: service_prices service_prices_service_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.service_prices
    ADD CONSTRAINT service_prices_service_id_fkey FOREIGN KEY (service_id) REFERENCES catalog.services(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_organization_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.contracts
    ADD CONSTRAINT contracts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_proposal_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.contracts
    ADD CONSTRAINT contracts_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES commerce.proposals(id) ON DELETE SET NULL;


--
-- Name: proposal_items proposal_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposal_items
    ADD CONSTRAINT proposal_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: proposal_items proposal_items_proposal_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposal_items
    ADD CONSTRAINT proposal_items_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES commerce.proposals(id) ON DELETE CASCADE;


--
-- Name: proposal_items proposal_items_service_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposal_items
    ADD CONSTRAINT proposal_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES catalog.services(id) ON DELETE SET NULL;


--
-- Name: proposals proposals_connector_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposals
    ADD CONSTRAINT proposals_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.connectors(id) ON DELETE SET NULL;


--
-- Name: proposals proposals_created_by_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposals
    ADD CONSTRAINT proposals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: proposals proposals_organization_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.proposals
    ADD CONSTRAINT proposals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: activities activities_created_by_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.activities
    ADD CONSTRAINT activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: activities activities_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.activities
    ADD CONSTRAINT activities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: company_cnpjs company_cnpjs_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.company_cnpjs
    ADD CONSTRAINT company_cnpjs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: company_partners company_partners_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.company_partners
    ADD CONSTRAINT company_partners_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: documents documents_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.documents
    ADD CONSTRAINT documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: mapa_submissions mapa_submissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.mapa_submissions
    ADD CONSTRAINT mapa_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: mapadeia_submissions mapadeia_submissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.mapadeia_submissions
    ADD CONSTRAINT mapadeia_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: people people_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.people
    ADD CONSTRAINT people_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: phones phones_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.phones
    ADD CONSTRAINT phones_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: phones phones_person_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.phones
    ADD CONSTRAINT phones_person_id_fkey FOREIGN KEY (person_id) REFERENCES crm.people(id) ON DELETE CASCADE;


--
-- Name: tax_ids tax_ids_organization_id_fkey; Type: FK CONSTRAINT; Schema: crm; Owner: -
--

ALTER TABLE ONLY crm.tax_ids
    ADD CONSTRAINT tax_ids_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: client_modules client_modules_organization_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.client_modules
    ADD CONSTRAINT client_modules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: client_modules client_modules_vdi_module_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.client_modules
    ADD CONSTRAINT client_modules_vdi_module_id_fkey FOREIGN KEY (vdi_module_id) REFERENCES catalog.vdi_modules(id) ON DELETE RESTRICT;


--
-- Name: client_services client_services_organization_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.client_services
    ADD CONSTRAINT client_services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: client_services client_services_service_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.client_services
    ADD CONSTRAINT client_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES catalog.services(id) ON DELETE RESTRICT;


--
-- Name: implementations implementations_organization_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.implementations
    ADD CONSTRAINT implementations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: module_credentials module_credentials_client_module_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.module_credentials
    ADD CONSTRAINT module_credentials_client_module_id_fkey FOREIGN KEY (client_module_id) REFERENCES delivery.client_modules(id) ON DELETE CASCADE;


--
-- Name: module_credentials module_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.module_credentials
    ADD CONSTRAINT module_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: module_credentials module_credentials_vdi_module_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.module_credentials
    ADD CONSTRAINT module_credentials_vdi_module_id_fkey FOREIGN KEY (vdi_module_id) REFERENCES catalog.vdi_modules(id) ON DELETE SET NULL;


--
-- Name: module_sessions module_sessions_client_module_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.module_sessions
    ADD CONSTRAINT module_sessions_client_module_id_fkey FOREIGN KEY (client_module_id) REFERENCES delivery.client_modules(id) ON DELETE CASCADE;


--
-- Name: module_sessions module_sessions_organization_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.module_sessions
    ADD CONSTRAINT module_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: project_tasks project_tasks_organization_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.project_tasks
    ADD CONSTRAINT project_tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: system_health system_health_organization_id_fkey; Type: FK CONSTRAINT; Schema: delivery; Owner: -
--

ALTER TABLE ONLY delivery.system_health
    ADD CONSTRAINT system_health_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_organization_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.ai_usage
    ADD CONSTRAINT ai_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_connector_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.commissions
    ADD CONSTRAINT commissions_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.connectors(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.commissions
    ADD CONSTRAINT commissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_proposal_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.commissions
    ADD CONSTRAINT commissions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES commerce.proposals(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_organization_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.expenses
    ADD CONSTRAINT expenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: support_hours support_hours_organization_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.support_hours
    ADD CONSTRAINT support_hours_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: member_screens member_screens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_screens
    ADD CONSTRAINT member_screens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.connectors(id);


--
-- Name: profiles profiles_connector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.connectors(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: incidents incidents_organization_id_fkey; Type: FK CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.incidents
    ADD CONSTRAINT incidents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_organization_id_fkey; Type: FK CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.notifications
    ADD CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pending_actions pending_actions_organization_id_fkey; Type: FK CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.pending_actions
    ADD CONSTRAINT pending_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_created_by_fkey; Type: FK CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.tickets
    ADD CONSTRAINT tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_organization_id_fkey; Type: FK CONSTRAINT; Schema: support; Owner: -
--

ALTER TABLE ONLY support.tickets
    ADD CONSTRAINT tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_agent_id_fkey; Type: FK CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.contacts
    ADD CONSTRAINT contacts_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents.agents(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_organization_id_fkey; Type: FK CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.contacts
    ADD CONSTRAINT contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_agent_id_fkey; Type: FK CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.conversations
    ADD CONSTRAINT conversations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents.agents(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES whatsapp.contacts(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_organization_id_fkey; Type: FK CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.conversations
    ADD CONSTRAINT conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES whatsapp.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: whatsapp; Owner: -
--

ALTER TABLE ONLY whatsapp.messages
    ADD CONSTRAINT messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agents; Type: ROW SECURITY; Schema: agents; Owner: -
--

ALTER TABLE agents.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: brain_overrides; Type: ROW SECURITY; Schema: agents; Owner: -
--

ALTER TABLE agents.brain_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: installed_packs; Type: ROW SECURITY; Schema: agents; Owner: -
--

ALTER TABLE agents.installed_packs ENABLE ROW LEVEL SECURITY;

--
-- Name: agents iso; Type: POLICY; Schema: agents; Owner: -
--

CREATE POLICY iso ON agents.agents USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: brain_overrides iso; Type: POLICY; Schema: agents; Owner: -
--

CREATE POLICY iso ON agents.brain_overrides USING ((public.is_crasto_admin() OR (EXISTS ( SELECT 1
   FROM agents.agents a
  WHERE ((a.id = brain_overrides.agent_id) AND (a.organization_id = public.current_org_id())))))) WITH CHECK ((public.is_crasto_admin() OR (EXISTS ( SELECT 1
   FROM agents.agents a
  WHERE ((a.id = brain_overrides.agent_id) AND (a.organization_id = public.current_org_id()))))));


--
-- Name: installed_packs iso; Type: POLICY; Schema: agents; Owner: -
--

CREATE POLICY iso ON agents.installed_packs USING ((public.is_crasto_admin() OR (EXISTS ( SELECT 1
   FROM agents.agents a
  WHERE ((a.id = installed_packs.agent_id) AND (a.organization_id = public.current_org_id())))))) WITH CHECK (public.is_crasto_admin());


--
-- Name: knowledge iso; Type: POLICY; Schema: agents; Owner: -
--

CREATE POLICY iso ON agents.knowledge USING ((public.is_crasto_admin() OR (organization_id = public.current_org_id()) OR (scope = 'global'::text))) WITH CHECK ((public.is_crasto_admin() OR (organization_id = public.current_org_id())));


--
-- Name: llm_models iso; Type: POLICY; Schema: agents; Owner: -
--

CREATE POLICY iso ON agents.llm_models USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: rules iso; Type: POLICY; Schema: agents; Owner: -
--

CREATE POLICY iso ON agents.rules USING ((public.is_crasto_admin() OR (organization_id = public.current_org_id()) OR (scope = 'global'::text))) WITH CHECK (public.is_crasto_admin());


--
-- Name: skill_packs iso; Type: POLICY; Schema: agents; Owner: -
--

CREATE POLICY iso ON agents.skill_packs USING ((public.is_crasto_admin() OR (scope = 'global'::text))) WITH CHECK (public.is_crasto_admin());


--
-- Name: knowledge; Type: ROW SECURITY; Schema: agents; Owner: -
--

ALTER TABLE agents.knowledge ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_models; Type: ROW SECURITY; Schema: agents; Owner: -
--

ALTER TABLE agents.llm_models ENABLE ROW LEVEL SECURITY;

--
-- Name: rules; Type: ROW SECURITY; Schema: agents; Owner: -
--

ALTER TABLE agents.rules ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_packs; Type: ROW SECURITY; Schema: agents; Owner: -
--

ALTER TABLE agents.skill_packs ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: audit; Owner: -
--

ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;

--
-- Name: dispatches; Type: ROW SECURITY; Schema: automation; Owner: -
--

ALTER TABLE automation.dispatches ENABLE ROW LEVEL SECURITY;

--
-- Name: dispatches dispatches_admin_only; Type: POLICY; Schema: automation; Owner: -
--

CREATE POLICY dispatches_admin_only ON automation.dispatches USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: integration_configs; Type: ROW SECURITY; Schema: automation; Owner: -
--

ALTER TABLE automation.integration_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: automation; Owner: -
--

ALTER TABLE automation.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations integrations_admin_only; Type: POLICY; Schema: automation; Owner: -
--

CREATE POLICY integrations_admin_only ON automation.integrations USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: message_templates; Type: ROW SECURITY; Schema: automation; Owner: -
--

ALTER TABLE automation.message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: message_templates message_templates_admin_only; Type: POLICY; Schema: automation; Owner: -
--

CREATE POLICY message_templates_admin_only ON automation.message_templates USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: playbooks; Type: ROW SECURITY; Schema: automation; Owner: -
--

ALTER TABLE automation.playbooks ENABLE ROW LEVEL SECURITY;

--
-- Name: playbooks playbooks_admin_only; Type: POLICY; Schema: automation; Owner: -
--

CREATE POLICY playbooks_admin_only ON automation.playbooks USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: invoices; Type: ROW SECURITY; Schema: billing; Owner: -
--

ALTER TABLE billing.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_admin_all; Type: POLICY; Schema: billing; Owner: -
--

CREATE POLICY invoices_admin_all ON billing.invoices USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: invoices invoices_client_read; Type: POLICY; Schema: billing; Owner: -
--

CREATE POLICY invoices_client_read ON billing.invoices FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: commission_rules; Type: ROW SECURITY; Schema: catalog; Owner: -
--

ALTER TABLE catalog.commission_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rules commrule_admin_all; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY commrule_admin_all ON catalog.commission_rules USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: service_prices; Type: ROW SECURITY; Schema: catalog; Owner: -
--

ALTER TABLE catalog.service_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: catalog; Owner: -
--

ALTER TABLE catalog.services ENABLE ROW LEVEL SECURITY;

--
-- Name: services services_admin_all; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY services_admin_all ON catalog.services USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: service_prices svcprice_admin_all; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY svcprice_admin_all ON catalog.service_prices USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: vdi_catalog; Type: ROW SECURITY; Schema: catalog; Owner: -
--

ALTER TABLE catalog.vdi_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: vdi_catalog vdi_catalog_admin; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY vdi_catalog_admin ON catalog.vdi_catalog USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: vdi_modules; Type: ROW SECURITY; Schema: catalog; Owner: -
--

ALTER TABLE catalog.vdi_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: vdi_modules vdimod_admin_all; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY vdimod_admin_all ON catalog.vdi_modules USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: vdi_modules vdimod_read_active; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY vdimod_read_active ON catalog.vdi_modules FOR SELECT USING ((active = true));


--
-- Name: contracts contract_admin_all; Type: POLICY; Schema: commerce; Owner: -
--

CREATE POLICY contract_admin_all ON commerce.contracts USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: contracts contract_client_read; Type: POLICY; Schema: commerce; Owner: -
--

CREATE POLICY contract_client_read ON commerce.contracts FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: contracts; Type: ROW SECURITY; Schema: commerce; Owner: -
--

ALTER TABLE commerce.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals prop_admin_all; Type: POLICY; Schema: commerce; Owner: -
--

CREATE POLICY prop_admin_all ON commerce.proposals USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: proposals prop_client_read; Type: POLICY; Schema: commerce; Owner: -
--

CREATE POLICY prop_client_read ON commerce.proposals FOR SELECT USING (((organization_id = public.current_org_id()) AND (status <> 'draft'::text)));


--
-- Name: proposal_items propitem_admin_all; Type: POLICY; Schema: commerce; Owner: -
--

CREATE POLICY propitem_admin_all ON commerce.proposal_items USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: proposal_items propitem_client_read; Type: POLICY; Schema: commerce; Owner: -
--

CREATE POLICY propitem_client_read ON commerce.proposal_items FOR SELECT USING (((organization_id = public.current_org_id()) AND (EXISTS ( SELECT 1
   FROM commerce.proposals p
  WHERE ((p.id = proposal_items.proposal_id) AND (p.status <> 'draft'::text))))));


--
-- Name: proposal_items; Type: ROW SECURITY; Schema: commerce; Owner: -
--

ALTER TABLE commerce.proposal_items ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals; Type: ROW SECURITY; Schema: commerce; Owner: -
--

ALTER TABLE commerce.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: activities; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activities activities_admin; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY activities_admin ON crm.activities USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: company_cnpjs cnpjs_admin_all; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY cnpjs_admin_all ON crm.company_cnpjs USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: company_cnpjs; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.company_cnpjs ENABLE ROW LEVEL SECURITY;

--
-- Name: company_partners; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.company_partners ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_admin; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY documents_admin ON crm.documents USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: mapa_submissions mapa_sub_admin_read; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY mapa_sub_admin_read ON crm.mapa_submissions FOR SELECT USING (public.is_crasto_admin());


--
-- Name: mapa_submissions; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.mapa_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: mapadeia_submissions; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.mapadeia_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: company_partners partners_admin_all; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY partners_admin_all ON crm.company_partners USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: people; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.people ENABLE ROW LEVEL SECURITY;

--
-- Name: people people_admin; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY people_admin ON crm.people USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: phones; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.phones ENABLE ROW LEVEL SECURITY;

--
-- Name: phones phones_admin; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY phones_admin ON crm.phones USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: tax_ids; Type: ROW SECURITY; Schema: crm; Owner: -
--

ALTER TABLE crm.tax_ids ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_ids tax_ids_admin; Type: POLICY; Schema: crm; Owner: -
--

CREATE POLICY tax_ids_admin ON crm.tax_ids USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: client_modules; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.client_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: client_modules client_modules_admin_all; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY client_modules_admin_all ON delivery.client_modules USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: client_modules client_modules_client_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY client_modules_client_read ON delivery.client_modules FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: client_modules client_modules_connector_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY client_modules_connector_read ON delivery.client_modules FOR SELECT USING (public.is_referred_org(organization_id));


--
-- Name: client_services; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.client_services ENABLE ROW LEVEL SECURITY;

--
-- Name: client_services client_services_admin_all; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY client_services_admin_all ON delivery.client_services USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: client_services client_services_client_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY client_services_client_read ON delivery.client_services FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: client_services client_services_connector_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY client_services_connector_read ON delivery.client_services FOR SELECT USING (public.is_referred_org(organization_id));


--
-- Name: implementations; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.implementations ENABLE ROW LEVEL SECURITY;

--
-- Name: implementations implementations_admin_all; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY implementations_admin_all ON delivery.implementations USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: implementations implementations_client_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY implementations_client_read ON delivery.implementations FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: implementations implementations_connector_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY implementations_connector_read ON delivery.implementations FOR SELECT USING (public.is_referred_org(organization_id));


--
-- Name: module_credentials modcred_admin_all; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY modcred_admin_all ON delivery.module_credentials USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: module_credentials modcred_client_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY modcred_client_read ON delivery.module_credentials FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: module_credentials; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.module_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: module_sessions; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.module_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: module_sessions module_sessions_admin_all; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY module_sessions_admin_all ON delivery.module_sessions USING (public.is_admin_viewing_all());


--
-- Name: module_sessions module_sessions_own_insert; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY module_sessions_own_insert ON delivery.module_sessions FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (organization_id = public.current_org_id())));


--
-- Name: module_sessions module_sessions_own_update; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY module_sessions_own_update ON delivery.module_sessions FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: module_sessions module_sessions_owner_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY module_sessions_owner_read ON delivery.module_sessions FOR SELECT USING (((organization_id = public.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.organization_id = module_sessions.organization_id) AND ((p.role)::text = 'client_owner'::text))))));


--
-- Name: module_sessions module_sessions_self_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY module_sessions_self_read ON delivery.module_sessions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: project_tasks; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.project_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: project_tasks project_tasks_admin_all; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY project_tasks_admin_all ON delivery.project_tasks USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: project_tasks project_tasks_client_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY project_tasks_client_read ON delivery.project_tasks FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: project_tasks project_tasks_connector_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY project_tasks_connector_read ON delivery.project_tasks FOR SELECT USING (public.is_referred_org(organization_id));


--
-- Name: system_health; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.system_health ENABLE ROW LEVEL SECURITY;

--
-- Name: system_health system_health_admin_all; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY system_health_admin_all ON delivery.system_health USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: system_health system_health_client_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY system_health_client_read ON delivery.system_health FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: system_health system_health_connector_read; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY system_health_connector_read ON delivery.system_health FOR SELECT USING (public.is_referred_org(organization_id));


--
-- Name: user_module_access uma_select_own; Type: POLICY; Schema: delivery; Owner: -
--

CREATE POLICY uma_select_own ON delivery.user_module_access FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_module_access; Type: ROW SECURITY; Schema: delivery; Owner: -
--

ALTER TABLE delivery.user_module_access ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage ai_usage_admin_only; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY ai_usage_admin_only ON finance.ai_usage USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: commissions; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions commissions_admin_only; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY commissions_admin_only ON finance.commissions USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: expenses; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_admin_only; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY expenses_admin_only ON finance.expenses USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: operational_costs; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.operational_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: settings settings_admin_only; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY settings_admin_only ON finance.settings USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: support_hours; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.support_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: support_hours support_hours_admin_only; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY support_hours_admin_only ON finance.support_hours USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: transactions; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: connectors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;

--
-- Name: connectors connectors_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connectors_admin_all ON public.connectors USING (public.is_crasto_admin()) WITH CHECK (public.is_crasto_admin());


--
-- Name: connectors connectors_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connectors_self_read ON public.connectors FOR SELECT USING ((id = public.current_connector_id()));


--
-- Name: member_screens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_screens ENABLE ROW LEVEL SECURITY;

--
-- Name: member_screens ms_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ms_read ON public.member_screens USING (((user_id = auth.uid()) OR public.is_crasto_admin())) WITH CHECK (public.is_crasto_admin());


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations orgs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orgs_admin_all ON public.organizations USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: organizations orgs_client_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orgs_client_read_own ON public.organizations FOR SELECT USING ((id = public.current_org_id()));


--
-- Name: organizations orgs_connector_read_referred; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orgs_connector_read_referred ON public.organizations FOR SELECT USING (((referred_by IS NOT NULL) AND (referred_by = public.current_connector_id())));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_admin_all ON public.profiles USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: profiles profiles_same_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_same_org_read ON public.profiles FOR SELECT USING (((organization_id IS NOT NULL) AND public.same_org(organization_id)));


--
-- Name: profiles profiles_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_self_read ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: profiles profiles_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: incidents; Type: ROW SECURITY; Schema: support; Owner: -
--

ALTER TABLE support.incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: incidents incidents_admin_all; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY incidents_admin_all ON support.incidents USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: incidents incidents_client_read; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY incidents_client_read ON support.incidents FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: notifications notif_client_read; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY notif_client_read ON support.notifications FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: notifications notif_client_update; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY notif_client_update ON support.notifications FOR UPDATE USING ((organization_id = public.current_org_id())) WITH CHECK ((organization_id = public.current_org_id()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: support; Owner: -
--

ALTER TABLE support.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_admin_all; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY notifications_admin_all ON support.notifications USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: pending_actions; Type: ROW SECURITY; Schema: support; Owner: -
--

ALTER TABLE support.pending_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_actions pending_actions_admin_all; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY pending_actions_admin_all ON support.pending_actions USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: pending_actions pending_client_read; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY pending_client_read ON support.pending_actions FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: pending_actions pending_client_update; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY pending_client_update ON support.pending_actions FOR UPDATE USING ((organization_id = public.current_org_id())) WITH CHECK ((organization_id = public.current_org_id()));


--
-- Name: tickets; Type: ROW SECURITY; Schema: support; Owner: -
--

ALTER TABLE support.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets tickets_admin_all; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY tickets_admin_all ON support.tickets USING (public.is_admin_viewing_all()) WITH CHECK (public.is_crasto_admin());


--
-- Name: tickets tickets_client_insert; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY tickets_client_insert ON support.tickets FOR INSERT WITH CHECK ((organization_id = public.current_org_id()));


--
-- Name: tickets tickets_client_read; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY tickets_client_read ON support.tickets FOR SELECT USING ((organization_id = public.current_org_id()));


--
-- Name: tickets tickets_client_update; Type: POLICY; Schema: support; Owner: -
--

CREATE POLICY tickets_client_update ON support.tickets FOR UPDATE USING ((organization_id = public.current_org_id())) WITH CHECK ((organization_id = public.current_org_id()));


--
-- Name: ai_processing_queue; Type: ROW SECURITY; Schema: whatsapp; Owner: -
--

ALTER TABLE whatsapp.ai_processing_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: whatsapp; Owner: -
--

ALTER TABLE whatsapp.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: whatsapp; Owner: -
--

ALTER TABLE whatsapp.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: dead_letter; Type: ROW SECURITY; Schema: whatsapp; Owner: -
--

ALTER TABLE whatsapp.dead_letter ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_processing_queue iso; Type: POLICY; Schema: whatsapp; Owner: -
--

CREATE POLICY iso ON whatsapp.ai_processing_queue USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: contacts iso; Type: POLICY; Schema: whatsapp; Owner: -
--

CREATE POLICY iso ON whatsapp.contacts USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: conversations iso; Type: POLICY; Schema: whatsapp; Owner: -
--

CREATE POLICY iso ON whatsapp.conversations USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: dead_letter iso; Type: POLICY; Schema: whatsapp; Owner: -
--

CREATE POLICY iso ON whatsapp.dead_letter USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: message_grouping_queue iso; Type: POLICY; Schema: whatsapp; Owner: -
--

CREATE POLICY iso ON whatsapp.message_grouping_queue USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: messages iso; Type: POLICY; Schema: whatsapp; Owner: -
--

CREATE POLICY iso ON whatsapp.messages USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: send_queue iso; Type: POLICY; Schema: whatsapp; Owner: -
--

CREATE POLICY iso ON whatsapp.send_queue USING (((organization_id = public.current_org_id()) OR public.is_crasto_admin())) WITH CHECK (((organization_id = public.current_org_id()) OR public.is_crasto_admin()));


--
-- Name: message_grouping_queue; Type: ROW SECURITY; Schema: whatsapp; Owner: -
--

ALTER TABLE whatsapp.message_grouping_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: whatsapp; Owner: -
--

ALTER TABLE whatsapp.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: send_queue; Type: ROW SECURITY; Schema: whatsapp; Owner: -
--

ALTER TABLE whatsapp.send_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA audit; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA audit TO service_role;


--
-- Name: SCHEMA automation; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA automation TO authenticated;
GRANT USAGE ON SCHEMA automation TO service_role;


--
-- Name: SCHEMA billing; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA billing TO authenticated;
GRANT USAGE ON SCHEMA billing TO service_role;


--
-- Name: SCHEMA catalog; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA catalog TO authenticated;
GRANT USAGE ON SCHEMA catalog TO service_role;


--
-- Name: SCHEMA commerce; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA commerce TO authenticated;
GRANT USAGE ON SCHEMA commerce TO service_role;


--
-- Name: SCHEMA crm; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA crm TO authenticated;
GRANT USAGE ON SCHEMA crm TO service_role;


--
-- Name: SCHEMA delivery; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA delivery TO authenticated;
GRANT USAGE ON SCHEMA delivery TO service_role;


--
-- Name: SCHEMA finance; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA finance TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA support; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA support TO authenticated;
GRANT USAGE ON SCHEMA support TO service_role;


--
-- Name: FUNCTION log_as(p_actor uuid, p_actor_email text, p_action text, p_target_type text, p_target_id text, p_org uuid, p_context jsonb, p_system text, p_ip text); Type: ACL; Schema: audit; Owner: -
--

REVOKE ALL ON FUNCTION audit.log_as(p_actor uuid, p_actor_email text, p_action text, p_target_type text, p_target_id text, p_org uuid, p_context jsonb, p_system text, p_ip text) FROM PUBLIC;
GRANT ALL ON FUNCTION audit.log_as(p_actor uuid, p_actor_email text, p_action text, p_target_type text, p_target_id text, p_org uuid, p_context jsonb, p_system text, p_ip text) TO service_role;


--
-- Name: FUNCTION add_my_document(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_my_document(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.add_my_document(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.add_my_document(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_accept_proposal(p_proposal_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_accept_proposal(p_proposal_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_accept_proposal(p_proposal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_accept_proposal(p_proposal_id uuid) TO service_role;


--
-- Name: FUNCTION admin_access_list(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_access_list() TO anon;
GRANT ALL ON FUNCTION public.admin_access_list() TO authenticated;
GRANT ALL ON FUNCTION public.admin_access_list() TO service_role;


--
-- Name: FUNCTION admin_ai_cost(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_ai_cost(p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.admin_ai_cost(p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.admin_ai_cost(p_from date, p_to date) TO service_role;


--
-- Name: FUNCTION admin_audit_log(p_from date, p_to date, p_org uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_audit_log(p_from date, p_to date, p_org uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_audit_log(p_from date, p_to date, p_org uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_audit_log(p_from date, p_to date, p_org uuid) TO service_role;


--
-- Name: FUNCTION admin_audit_record(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_audit_record(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_audit_record(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_audit_record(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_brain_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_brain_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_brain_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_brain_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION admin_brain_list(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_brain_list() TO anon;
GRANT ALL ON FUNCTION public.admin_brain_list() TO authenticated;
GRANT ALL ON FUNCTION public.admin_brain_list() TO service_role;


--
-- Name: FUNCTION admin_brain_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_brain_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_brain_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_brain_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_client_pnl(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_client_pnl() TO anon;
GRANT ALL ON FUNCTION public.admin_client_pnl() TO authenticated;
GRANT ALL ON FUNCTION public.admin_client_pnl() TO service_role;


--
-- Name: FUNCTION admin_clients(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_clients() TO anon;
GRANT ALL ON FUNCTION public.admin_clients() TO authenticated;
GRANT ALL ON FUNCTION public.admin_clients() TO service_role;


--
-- Name: FUNCTION admin_commissions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_commissions() TO anon;
GRANT ALL ON FUNCTION public.admin_commissions() TO authenticated;
GRANT ALL ON FUNCTION public.admin_commissions() TO service_role;


--
-- Name: FUNCTION admin_console_overview(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_console_overview() TO anon;
GRANT ALL ON FUNCTION public.admin_console_overview() TO authenticated;
GRANT ALL ON FUNCTION public.admin_console_overview() TO service_role;


--
-- Name: FUNCTION admin_costs_by_provider(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_costs_by_provider() TO anon;
GRANT ALL ON FUNCTION public.admin_costs_by_provider() TO authenticated;
GRANT ALL ON FUNCTION public.admin_costs_by_provider() TO service_role;


--
-- Name: FUNCTION admin_finance_overview(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_finance_overview() TO anon;
GRANT ALL ON FUNCTION public.admin_finance_overview() TO authenticated;
GRANT ALL ON FUNCTION public.admin_finance_overview() TO service_role;


--
-- Name: FUNCTION admin_health_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_health_check() TO anon;
GRANT ALL ON FUNCTION public.admin_health_check() TO authenticated;
GRANT ALL ON FUNCTION public.admin_health_check() TO service_role;


--
-- Name: FUNCTION admin_health_config(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_health_config() TO anon;
GRANT ALL ON FUNCTION public.admin_health_config() TO authenticated;
GRANT ALL ON FUNCTION public.admin_health_config() TO service_role;


--
-- Name: FUNCTION admin_integration_config(p_key text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_integration_config(p_key text) TO anon;
GRANT ALL ON FUNCTION public.admin_integration_config(p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_integration_config(p_key text) TO service_role;


--
-- Name: FUNCTION admin_integrations_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_integrations_status() TO anon;
GRANT ALL ON FUNCTION public.admin_integrations_status() TO authenticated;
GRANT ALL ON FUNCTION public.admin_integrations_status() TO service_role;


--
-- Name: FUNCTION admin_llm_models(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_llm_models() TO anon;
GRANT ALL ON FUNCTION public.admin_llm_models() TO authenticated;
GRANT ALL ON FUNCTION public.admin_llm_models() TO service_role;


--
-- Name: FUNCTION admin_mapa_by_org(p_org uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_mapa_by_org(p_org uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_mapa_by_org(p_org uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_mapa_by_org(p_org uuid) TO service_role;


--
-- Name: FUNCTION admin_module_clients(p_module uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_module_clients(p_module uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_module_clients(p_module uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_module_clients(p_module uuid) TO service_role;


--
-- Name: FUNCTION admin_overview(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_overview() TO anon;
GRANT ALL ON FUNCTION public.admin_overview() TO authenticated;
GRANT ALL ON FUNCTION public.admin_overview() TO service_role;


--
-- Name: FUNCTION admin_registration_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_registration_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_registration_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_registration_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION admin_registration_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_registration_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_registration_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_registration_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_reopen_proposal(p_proposal_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_reopen_proposal(p_proposal_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_reopen_proposal(p_proposal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_reopen_proposal(p_proposal_id uuid) TO service_role;


--
-- Name: FUNCTION admin_rule_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_rule_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_rule_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_rule_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION admin_rule_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_rule_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_rule_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_rule_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_rules_list(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_rules_list() TO anon;
GRANT ALL ON FUNCTION public.admin_rules_list() TO authenticated;
GRANT ALL ON FUNCTION public.admin_rules_list() TO service_role;


--
-- Name: FUNCTION admin_save_integration(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_save_integration(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_save_integration(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_save_integration(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_set_default_model(p_provider text, p_model text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_default_model(p_provider text, p_model text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_default_model(p_provider text, p_model text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_default_model(p_provider text, p_model text) TO service_role;


--
-- Name: FUNCTION admin_set_health_config(p json); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_health_config(p json) TO anon;
GRANT ALL ON FUNCTION public.admin_set_health_config(p json) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_health_config(p json) TO service_role;


--
-- Name: FUNCTION admin_set_integration(p_key text, p_secret text, p_from text, p_status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_integration(p_key text, p_secret text, p_from text, p_status text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_integration(p_key text, p_secret text, p_from text, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_integration(p_key text, p_secret text, p_from text, p_status text) TO service_role;


--
-- Name: FUNCTION admin_set_user_access(p_user uuid, p_role text, p_screens text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_user_access(p_user uuid, p_role text, p_screens text[]) TO anon;
GRANT ALL ON FUNCTION public.admin_set_user_access(p_user uuid, p_role text, p_screens text[]) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_user_access(p_user uuid, p_role text, p_screens text[]) TO service_role;


--
-- Name: FUNCTION admin_set_user_role(p_user uuid, p_role text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_user_role(p_user uuid, p_role text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_user_role(p_user uuid, p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_user_role(p_user uuid, p_role text) TO service_role;


--
-- Name: FUNCTION admin_skill_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_skill_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_skill_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_skill_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION admin_skill_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_skill_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_skill_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_skill_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_skills_list(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_skills_list() TO anon;
GRANT ALL ON FUNCTION public.admin_skills_list() TO authenticated;
GRANT ALL ON FUNCTION public.admin_skills_list() TO service_role;


--
-- Name: FUNCTION admin_support_hours(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_support_hours() TO anon;
GRANT ALL ON FUNCTION public.admin_support_hours() TO authenticated;
GRANT ALL ON FUNCTION public.admin_support_hours() TO service_role;


--
-- Name: FUNCTION admin_user_access(p_user uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_user_access(p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_user_access(p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_user_access(p_user uuid) TO service_role;


--
-- Name: FUNCTION audit_login(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_login() TO anon;
GRANT ALL ON FUNCTION public.audit_login() TO authenticated;
GRANT ALL ON FUNCTION public.audit_login() TO service_role;


--
-- Name: FUNCTION business_settings(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.business_settings() TO anon;
GRANT ALL ON FUNCTION public.business_settings() TO authenticated;
GRANT ALL ON FUNCTION public.business_settings() TO service_role;


--
-- Name: FUNCTION client_support_hours(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.client_support_hours() TO anon;
GRANT ALL ON FUNCTION public.client_support_hours() TO authenticated;
GRANT ALL ON FUNCTION public.client_support_hours() TO service_role;


--
-- Name: FUNCTION connector_commissions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.connector_commissions() TO anon;
GRANT ALL ON FUNCTION public.connector_commissions() TO authenticated;
GRANT ALL ON FUNCTION public.connector_commissions() TO service_role;


--
-- Name: FUNCTION cred_key(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cred_key() TO service_role;


--
-- Name: FUNCTION crm_identity_lookup(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.crm_identity_lookup(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.crm_identity_lookup(p_email text) TO service_role;


--
-- Name: FUNCTION current_connector_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_connector_id() TO anon;
GRANT ALL ON FUNCTION public.current_connector_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_connector_id() TO service_role;


--
-- Name: FUNCTION current_org_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_org_id() TO anon;
GRANT ALL ON FUNCTION public.current_org_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_org_id() TO service_role;


--
-- Name: FUNCTION delete_my_cnpj(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_my_cnpj(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_my_cnpj(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_my_cnpj(p_id uuid) TO service_role;


--
-- Name: FUNCTION delete_my_document(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_my_document(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_my_document(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_my_document(p_id uuid) TO service_role;


--
-- Name: FUNCTION delete_my_partner(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_my_partner(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_my_partner(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_my_partner(p_id uuid) TO service_role;


--
-- Name: FUNCTION fin_account_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_account_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fin_account_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fin_account_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION fin_account_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_account_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.fin_account_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fin_account_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION fin_accounts(p_type text, p_status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_accounts(p_type text, p_status text) TO anon;
GRANT ALL ON FUNCTION public.fin_accounts(p_type text, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.fin_accounts(p_type text, p_status text) TO service_role;


--
-- Name: FUNCTION fin_ai_cost_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_ai_cost_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fin_ai_cost_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fin_ai_cost_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION fin_ai_cost_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_ai_cost_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.fin_ai_cost_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fin_ai_cost_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION fin_cost_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_cost_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fin_cost_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fin_cost_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION fin_cost_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_cost_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.fin_cost_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fin_cost_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION fin_costs(p_active boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_costs(p_active boolean) TO anon;
GRANT ALL ON FUNCTION public.fin_costs(p_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.fin_costs(p_active boolean) TO service_role;


--
-- Name: FUNCTION fin_transaction_delete(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_transaction_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fin_transaction_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fin_transaction_delete(p_id uuid) TO service_role;


--
-- Name: FUNCTION fin_transaction_upsert(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_transaction_upsert(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.fin_transaction_upsert(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fin_transaction_upsert(p jsonb) TO service_role;


--
-- Name: FUNCTION fin_transactions(p_type text, p_status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_transactions(p_type text, p_status text) TO anon;
GRANT ALL ON FUNCTION public.fin_transactions(p_type text, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.fin_transactions(p_type text, p_status text) TO service_role;


--
-- Name: FUNCTION global_brain(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.global_brain() FROM PUBLIC;
GRANT ALL ON FUNCTION public.global_brain() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION is_admin_viewing_all(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin_viewing_all() TO anon;
GRANT ALL ON FUNCTION public.is_admin_viewing_all() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_viewing_all() TO service_role;


--
-- Name: FUNCTION is_crasto_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_crasto_admin() TO anon;
GRANT ALL ON FUNCTION public.is_crasto_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_crasto_admin() TO service_role;


--
-- Name: FUNCTION is_referred_org(org uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_referred_org(org uuid) TO anon;
GRANT ALL ON FUNCTION public.is_referred_org(org uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_referred_org(org uuid) TO service_role;


--
-- Name: FUNCTION llm_runtime(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.llm_runtime() FROM PUBLIC;
GRANT ALL ON FUNCTION public.llm_runtime() TO service_role;


--
-- Name: FUNCTION mapa_ingest(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mapa_ingest(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mapa_ingest(payload jsonb) TO service_role;


--
-- Name: FUNCTION mapa_mark_email(p_sub uuid, p_sent boolean, p_error text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mapa_mark_email(p_sub uuid, p_sent boolean, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mapa_mark_email(p_sub uuid, p_sent boolean, p_error text) TO service_role;


--
-- Name: FUNCTION mapadeia_ingest(payload jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mapadeia_ingest(payload jsonb) TO anon;
GRANT ALL ON FUNCTION public.mapadeia_ingest(payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.mapadeia_ingest(payload jsonb) TO service_role;


--
-- Name: TABLE company_cnpjs; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE crm.company_cnpjs TO authenticated;


--
-- Name: FUNCTION my_cnpjs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_cnpjs() TO anon;
GRANT ALL ON FUNCTION public.my_cnpjs() TO authenticated;
GRANT ALL ON FUNCTION public.my_cnpjs() TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE crm.documents TO authenticated;
GRANT ALL ON TABLE crm.documents TO service_role;


--
-- Name: FUNCTION my_documents(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_documents() TO anon;
GRANT ALL ON FUNCTION public.my_documents() TO authenticated;
GRANT ALL ON FUNCTION public.my_documents() TO service_role;


--
-- Name: FUNCTION my_faturas(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_faturas() TO anon;
GRANT ALL ON FUNCTION public.my_faturas() TO authenticated;
GRANT ALL ON FUNCTION public.my_faturas() TO service_role;


--
-- Name: FUNCTION my_org_contact(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_org_contact() TO anon;
GRANT ALL ON FUNCTION public.my_org_contact() TO authenticated;
GRANT ALL ON FUNCTION public.my_org_contact() TO service_role;


--
-- Name: TABLE company_partners; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE crm.company_partners TO authenticated;


--
-- Name: FUNCTION my_partners(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_partners() TO anon;
GRANT ALL ON FUNCTION public.my_partners() TO authenticated;
GRANT ALL ON FUNCTION public.my_partners() TO service_role;


--
-- Name: FUNCTION my_screens(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_screens() TO anon;
GRANT ALL ON FUNCTION public.my_screens() TO authenticated;
GRANT ALL ON FUNCTION public.my_screens() TO service_role;


--
-- Name: FUNCTION org_health(o uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.org_health(o uuid) TO anon;
GRANT ALL ON FUNCTION public.org_health(o uuid) TO authenticated;
GRANT ALL ON FUNCTION public.org_health(o uuid) TO service_role;


--
-- Name: FUNCTION reveal_module_secret(p_cred_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reveal_module_secret(p_cred_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reveal_module_secret(p_cred_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reveal_module_secret(p_cred_id uuid) TO service_role;


--
-- Name: FUNCTION reveal_provider_key(p_provider text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reveal_provider_key(p_provider text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reveal_provider_key(p_provider text) TO service_role;


--
-- Name: FUNCTION same_org(p uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.same_org(p uuid) TO anon;
GRANT ALL ON FUNCTION public.same_org(p uuid) TO authenticated;
GRANT ALL ON FUNCTION public.same_org(p uuid) TO service_role;


--
-- Name: FUNCTION save_my_cnpj(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_my_cnpj(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_my_cnpj(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_my_cnpj(p jsonb) TO service_role;


--
-- Name: FUNCTION save_my_partner(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_my_partner(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_my_partner(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_my_partner(p jsonb) TO service_role;


--
-- Name: FUNCTION set_module_access(p_cm uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_module_access(p_cm uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text) TO anon;
GRANT ALL ON FUNCTION public.set_module_access(p_cm uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text) TO authenticated;
GRANT ALL ON FUNCTION public.set_module_access(p_cm uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text) TO service_role;


--
-- Name: FUNCTION set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean) TO anon;
GRANT ALL ON FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean) TO service_role;


--
-- Name: FUNCTION set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text) TO anon;
GRANT ALL ON FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text) TO authenticated;
GRANT ALL ON FUNCTION public.set_module_credential(p_org uuid, p_module uuid, p_label text, p_login text, p_secret text, p_sso boolean, p_url text) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION update_my_org(p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_my_org(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_my_org(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.update_my_org(p jsonb) TO service_role;


--
-- Name: TABLE dispatches; Type: ACL; Schema: automation; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE automation.dispatches TO authenticated;
GRANT ALL ON TABLE automation.dispatches TO service_role;


--
-- Name: TABLE integration_configs; Type: ACL; Schema: automation; Owner: -
--

GRANT ALL ON TABLE automation.integration_configs TO service_role;


--
-- Name: TABLE integrations; Type: ACL; Schema: automation; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE automation.integrations TO authenticated;
GRANT ALL ON TABLE automation.integrations TO service_role;


--
-- Name: TABLE message_templates; Type: ACL; Schema: automation; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE automation.message_templates TO authenticated;
GRANT ALL ON TABLE automation.message_templates TO service_role;


--
-- Name: TABLE playbooks; Type: ACL; Schema: automation; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE automation.playbooks TO authenticated;
GRANT ALL ON TABLE automation.playbooks TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: billing; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE billing.invoices TO authenticated;
GRANT ALL ON TABLE billing.invoices TO service_role;


--
-- Name: TABLE commission_rules; Type: ACL; Schema: catalog; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalog.commission_rules TO authenticated;
GRANT ALL ON TABLE catalog.commission_rules TO service_role;


--
-- Name: TABLE service_prices; Type: ACL; Schema: catalog; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalog.service_prices TO authenticated;
GRANT ALL ON TABLE catalog.service_prices TO service_role;


--
-- Name: TABLE services; Type: ACL; Schema: catalog; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalog.services TO authenticated;
GRANT ALL ON TABLE catalog.services TO service_role;


--
-- Name: TABLE vdi_catalog; Type: ACL; Schema: catalog; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalog.vdi_catalog TO authenticated;
GRANT ALL ON TABLE catalog.vdi_catalog TO service_role;


--
-- Name: TABLE vdi_modules; Type: ACL; Schema: catalog; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalog.vdi_modules TO authenticated;
GRANT ALL ON TABLE catalog.vdi_modules TO service_role;


--
-- Name: TABLE contracts; Type: ACL; Schema: commerce; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE commerce.contracts TO authenticated;
GRANT ALL ON TABLE commerce.contracts TO service_role;


--
-- Name: TABLE proposal_items; Type: ACL; Schema: commerce; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE commerce.proposal_items TO authenticated;
GRANT ALL ON TABLE commerce.proposal_items TO service_role;


--
-- Name: TABLE proposals; Type: ACL; Schema: commerce; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE commerce.proposals TO authenticated;
GRANT ALL ON TABLE commerce.proposals TO service_role;


--
-- Name: TABLE activities; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE crm.activities TO authenticated;
GRANT ALL ON TABLE crm.activities TO service_role;


--
-- Name: TABLE mapa_submissions; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE crm.mapa_submissions TO service_role;
GRANT SELECT ON TABLE crm.mapa_submissions TO authenticated;


--
-- Name: TABLE people; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE crm.people TO authenticated;
GRANT ALL ON TABLE crm.people TO service_role;


--
-- Name: TABLE phones; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE crm.phones TO authenticated;
GRANT ALL ON TABLE crm.phones TO service_role;


--
-- Name: TABLE tax_ids; Type: ACL; Schema: crm; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE crm.tax_ids TO authenticated;
GRANT ALL ON TABLE crm.tax_ids TO service_role;


--
-- Name: TABLE client_modules; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE delivery.client_modules TO authenticated;
GRANT ALL ON TABLE delivery.client_modules TO service_role;


--
-- Name: TABLE client_services; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE delivery.client_services TO authenticated;


--
-- Name: TABLE implementations; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE delivery.implementations TO authenticated;
GRANT ALL ON TABLE delivery.implementations TO service_role;


--
-- Name: TABLE module_credentials; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE delivery.module_credentials TO authenticated;
GRANT ALL ON TABLE delivery.module_credentials TO service_role;


--
-- Name: TABLE module_sessions; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE delivery.module_sessions TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE delivery.module_sessions TO service_role;


--
-- Name: TABLE project_tasks; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE delivery.project_tasks TO authenticated;
GRANT ALL ON TABLE delivery.project_tasks TO service_role;


--
-- Name: TABLE system_health; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE delivery.system_health TO authenticated;
GRANT ALL ON TABLE delivery.system_health TO service_role;


--
-- Name: TABLE user_module_access; Type: ACL; Schema: delivery; Owner: -
--

GRANT SELECT ON TABLE delivery.user_module_access TO authenticated;
GRANT SELECT,INSERT,DELETE ON TABLE delivery.user_module_access TO service_role;


--
-- Name: TABLE ai_usage; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.ai_usage TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.expenses TO service_role;


--
-- Name: TABLE settings; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.settings TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE client_pnl; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.client_pnl TO service_role;


--
-- Name: TABLE commissions; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.commissions TO service_role;


--
-- Name: TABLE support_hours; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.support_hours TO service_role;


--
-- Name: TABLE connectors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.connectors TO anon;
GRANT ALL ON TABLE public.connectors TO authenticated;
GRANT ALL ON TABLE public.connectors TO service_role;


--
-- Name: TABLE member_screens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.member_screens TO anon;
GRANT ALL ON TABLE public.member_screens TO authenticated;
GRANT ALL ON TABLE public.member_screens TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE incidents; Type: ACL; Schema: support; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE support.incidents TO authenticated;
GRANT ALL ON TABLE support.incidents TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: support; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE support.notifications TO authenticated;
GRANT ALL ON TABLE support.notifications TO service_role;


--
-- Name: TABLE pending_actions; Type: ACL; Schema: support; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE support.pending_actions TO authenticated;
GRANT ALL ON TABLE support.pending_actions TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: support; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE support.tickets TO authenticated;
GRANT ALL ON TABLE support.tickets TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict ovJ14ZKd4m0ZddNOKJaeOzzjNObbeYrHWZx9gs3eN9Y8mYNNydPuWtxPyDSGMNx

