import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

// Métricas de RESULTADO do cliente puxadas DIRETO do wacrm (cross-DB) — o "depois" do Cockpit.
// SEMPRE escopadas por organization_id (que vem do current_org_id() do Portal, confiável). Mais
// confiável que a federação HTTP /api/dashboard (que depende do contexto/role do token). Pool lazy,
// max:3 (não estoura o pooler do wacrm). Sem WACRM_DATABASE_URL → null (o front mostra "—").
@Injectable()
export class WacrmMetricsService {
  private pool?: Pool;
  private db(): Pool | null {
    const url = process.env.WACRM_DATABASE_URL;
    if (!url) return null;
    if (!this.pool) this.pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 8000 });
    return this.pool;
  }

  // Resultados dos últimos 30 dias (+ trend vs 30 anteriores). SEMPRE filtra organization_id=$1.
  async resultados(orgId: string): Promise<{
    tempo_resposta: number | null; automacao: number | null; atendimentos: number | null; novos_leads: number | null;
    conversas_ia: number | null; dur_media: number | null;
    trend: { atendimentos: number | null; novos_leads: number | null }; volume: { label: string; n: number }[];
  } | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      const m = (await c.query(
        `with w as (select now()-'30 days'::interval f, now() t),
              pr as (select now()-'60 days'::interval f, now()-'30 days'::interval t)
         select
           (select count(distinct msg.conversation_id) from whatsapp.messages msg, w  where msg.organization_id=$1 and msg.created_at>=w.f  and msg.created_at<w.t)::int  atend,
           (select count(distinct msg.conversation_id) from whatsapp.messages msg, pr where msg.organization_id=$1 and msg.created_at>=pr.f and msg.created_at<pr.t)::int atend_prev,
           (select count(*) from whatsapp.contacts ct, w  where ct.organization_id=$1 and ct.created_at>=w.f  and ct.created_at<w.t)::int  leads,
           (select count(*) from whatsapp.contacts ct, pr where ct.organization_id=$1 and ct.created_at>=pr.f and ct.created_at<pr.t)::int leads_prev,
           (select count(*) filter (where from_type='ai')    from whatsapp.messages, w where organization_id=$1 and created_at>=w.f)::int ai,
           (select count(*) filter (where from_type='human') from whatsapp.messages, w where organization_id=$1 and created_at>=w.f)::int human,
           (select count(distinct conversation_id) from whatsapp.messages, w where organization_id=$1 and from_type='ai' and created_at>=w.f and created_at<w.t)::int conversas_ia`,
        [orgId])).rows[0];
      // Duração média de conversa (30d) — proxy medido de "tempo de atendimento" p/ derivar horas.
      const dm = (await c.query(
        `with w as (select now()-'30 days'::interval f),
              c as (select conversation_id, extract(epoch from (max(created_at)-min(created_at))) dur
                      from whatsapp.messages, w where organization_id=$1 and created_at>=w.f group by conversation_id)
         select coalesce(round(avg(dur) filter (where dur between 30 and 7200)),0)::int dur_media from c`,
        [orgId])).rows[0];
      const tm = (await c.query(
        `with w as (select now()-'30 days'::interval f, now() t),
         pairs as (
           select extract(epoch from (r.created_at - msg.created_at)) sec
             from whatsapp.messages msg, w
             join lateral (select created_at from whatsapp.messages a
               where a.conversation_id=msg.conversation_id and a.from_type in ('ai','human') and a.created_at>msg.created_at
               order by a.created_at asc limit 1) r on true
            where msg.organization_id=$1 and msg.from_type='user' and msg.created_at>=w.f and msg.created_at<w.t)
         select coalesce(round(avg(sec)),0)::int tmed from pairs where sec between 0 and 3600`,
        [orgId])).rows[0];
      const vol = (await c.query(
        `with days as (select generate_series(0,29) i)
         select to_char((now()::date - i),'DD/MM') label,
                (select count(*) from whatsapp.messages msg where msg.organization_id=$1 and msg.created_at::date=(now()::date - i))::int n
           from days order by i desc`,
        [orgId])).rows;
      const total = (m.ai || 0) + (m.human || 0);
      const pct = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : null) : Math.round(((cur - prev) / prev) * 100));
      return {
        tempo_resposta: tm.tmed > 0 ? tm.tmed : null,
        automacao: total > 0 ? Math.round((m.ai / total) * 100) : null,
        atendimentos: m.atend > 0 ? m.atend : null,
        novos_leads: m.leads > 0 ? m.leads : null,
        conversas_ia: m.conversas_ia > 0 ? m.conversas_ia : null,
        dur_media: dm.dur_media > 0 ? dm.dur_media : null,
        trend: { atendimentos: pct(m.atend, m.atend_prev), novos_leads: pct(m.leads, m.leads_prev) },
        volume: vol,
      };
    } finally {
      c.release();
    }
  }

  // KPIs EXTRA do cockpit (funil de conversão · SLA de 1ª resposta · pico de atendimento). 30 dias,
  // escopo por org. Alimenta os gráficos do Painel de KPIs do dono. Sem dado → zeros/null (front degrada).
  async kpisExtra(orgId: string): Promise<{
    funil: { prospecto: number; prospecto_in: number; lead: number; lead_in: number; lead_frios: number; lead_frios_in: number; lead_mornos: number; lead_mornos_in: number; lead_quentes: number; lead_quentes_in: number; oportunidade: number; oportunidade_in: number; ganho: number; ganho_in: number; perdido: number; perdido_in: number };
    sla: { pct5: number | null; mediana_s: number; respondidas: number; sem_resposta: number };
    pico: number[][];
  } | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      // Funil de conversão DEAL-CENTRIC (modelo canônico do Crasto): Prospecto → Lead → Oportunidade →
      // Ganho, com a etapa Lead subdividida por TEMPERATURA (frio/morno/quente, `deals.temperatura` que
      // a IA classifica) e Perdido como balde TERMINAL separado (não é o fim do funil de conversão).
      // Lê os NEGÓCIOS (deals) por NOME de etapa do kanban (won/lost por regex — nunca por posição).
      // `_in` = subconjunto INBOUND de cada etapa (o toggle do card faz: Tudo=n · Inbound=n_in ·
      // Outbound=n−n_in). origem vem de deals.origem (migration 092).
      const f = (await c.query(
        `select count(*) filter (where st='Prospecto')::int prospecto,
                count(*) filter (where st='Prospecto' and inb)::int prospecto_in,
                count(*) filter (where st='Lead')::int lead,
                count(*) filter (where st='Lead' and inb)::int lead_in,
                count(*) filter (where st='Lead' and temperatura='frio')::int lead_frios,
                count(*) filter (where st='Lead' and temperatura='frio' and inb)::int lead_frios_in,
                count(*) filter (where st='Lead' and temperatura='morno')::int lead_mornos,
                count(*) filter (where st='Lead' and temperatura='morno' and inb)::int lead_mornos_in,
                count(*) filter (where st='Lead' and temperatura='quente')::int lead_quentes,
                count(*) filter (where st='Lead' and temperatura='quente' and inb)::int lead_quentes_in,
                count(*) filter (where st='Oportunidade')::int oportunidade,
                count(*) filter (where st='Oportunidade' and inb)::int oportunidade_in,
                count(*) filter (where st ~* '(ganho|fechad|fechamento|won|vendid)')::int ganho,
                count(*) filter (where st ~* '(ganho|fechad|fechamento|won|vendid)' and inb)::int ganho_in,
                count(*) filter (where st ~* '(perdid|lost)')::int perdido,
                count(*) filter (where st ~* '(perdid|lost)' and inb)::int perdido_in
           from (
             select d.temperatura, s.name st, (d.origem = 'inbound') as inb
               from whatsapp.deals d
               join whatsapp.pipeline_stages s on s.id = d.stage_id
              where d.organization_id = $1
           ) x`, [orgId])).rows[0];
      const s = (await c.query(
        `select count(*) filter (where resp_s is not null)::int respondidas,
                count(*) filter (where resp_s is not null and resp_s<=300)::int em5,
                count(*) filter (where resp_s is null)::int sem,
                coalesce(percentile_cont(0.5) within group (order by resp_s) filter (where resp_s is not null),0)::int mediana
           from (
             select extract(epoch from (
               (select min(o.created_at) from whatsapp.messages o
                 where o.conversation_id=cv.id and o.from_type in ('ai','human') and coalesce(o.internal,false)=false and o.created_at>=fi.first_in)
               - fi.first_in)) resp_s
               from whatsapp.conversations cv
               join lateral (select min(u.created_at) first_in from whatsapp.messages u
                              where u.conversation_id=cv.id and u.from_type='user') fi on true
              where cv.organization_id=$1 and fi.first_in >= now()-'30 days'::interval
           ) t`, [orgId])).rows[0];
      // Pico por dia-da-semana × faixa de 3h. IMPORTANTE: o Supabase grava created_at em UTC —
      // sem converter, o pico saía ~3h adiantado (ex.: 12h reais viravam 15h) e o dono via horário
      // errado. `at time zone 'America/Sao_Paulo'` traz a hora LOCAL do dono antes de extrair dia/hora.
      const pk = (await c.query(
        `select extract(isodow from (created_at at time zone 'America/Sao_Paulo'))::int d,
                floor(extract(hour from (created_at at time zone 'America/Sao_Paulo'))/3)::int b,
                count(*)::int n
           from whatsapp.messages where organization_id=$1 and created_at >= now()-'30 days'::interval
          group by 1,2`, [orgId])).rows;
      const grid = Array.from({ length: 7 }, () => Array(8).fill(0));
      let mx = 1;
      for (const row of pk) { const d = row.d - 1, b = row.b; if (d >= 0 && d < 7 && b >= 0 && b < 8) { grid[d][b] = row.n; if (row.n > mx) mx = row.n; } }
      return {
        funil: { prospecto: f.prospecto, prospecto_in: f.prospecto_in, lead: f.lead, lead_in: f.lead_in, lead_frios: f.lead_frios, lead_frios_in: f.lead_frios_in, lead_mornos: f.lead_mornos, lead_mornos_in: f.lead_mornos_in, lead_quentes: f.lead_quentes, lead_quentes_in: f.lead_quentes_in, oportunidade: f.oportunidade, oportunidade_in: f.oportunidade_in, ganho: f.ganho, ganho_in: f.ganho_in, perdido: f.perdido, perdido_in: f.perdido_in },
        sla: { pct5: s.respondidas > 0 ? Math.round((s.em5 * 100) / s.respondidas) : null, mediana_s: s.mediana, respondidas: s.respondidas, sem_resposta: s.sem },
        pico: grid.map((r) => r.map((n) => +(n / mx).toFixed(3))),
      };
    } finally {
      c.release();
    }
  }

  // MINI-COCKPIT do WhatsApp CRM — pulso AO VIVO AGORA (para o topo do módulo). Escopo por org.
  async liveNow(orgId: string): Promise<{ agentesOnline: number; agentesTotal: number; conversasAtivas: number; fila: number; automacaoHoje: number | null } | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      const r = (await c.query(
        `select
           (select count(*) from public.profiles where organization_id=$1 and last_seen_at > now() - interval '5 minutes')::int online,
           (select count(*) from public.profiles where organization_id=$1)::int total,
           (select count(*) from whatsapp.conversations where organization_id=$1 and coalesce(archived,false)=false and status in ('ai','human'))::int ativas,
           (select count(*) from whatsapp.conversations where organization_id=$1 and coalesce(archived,false)=false and last_inbound is not null and (last_outbound is null or last_inbound > last_outbound))::int fila,
           (select count(*) filter (where from_type='ai')    from whatsapp.messages where organization_id=$1 and created_at >= date_trunc('day', now()))::int ai_hoje,
           (select count(*) filter (where from_type='human') from whatsapp.messages where organization_id=$1 and created_at >= date_trunc('day', now()))::int human_hoje`,
        [orgId])).rows[0];
      const tot = (r.ai_hoje || 0) + (r.human_hoje || 0);
      return { agentesOnline: r.online, agentesTotal: r.total, conversasAtivas: r.ativas, fila: r.fila, automacaoHoje: tot > 0 ? Math.round((r.ai_hoje / tot) * 100) : null };
    } finally {
      c.release();
    }
  }

  // DRILL-DOWN do Cockpit (Fase 1): tempo de 1ª resposta POR COLABORADOR — humano por sender_user_id,
  // IA pela persona carimbada (acting_agent_id) OU, quando não há carimbo, pelo agente da conversa
  // (brain/base) — assim não sobra balde "IA (geral)"; o dono vê só os agentes reais. Nomes de
  // public.profiles / agents.agents. Ordenado do mais LENTO (destaca quem trava). `last_seen_at` =
  // ativo/último acesso real. Escopo por org. Sem WACRM_DB → null.
  async responseByCollaborator(orgId: string, from?: string | null, to?: string | null, onlyUserId?: string | null): Promise<{ kind: 'human' | 'ai'; id: string | null; nome: string; tmed: number | null; convs: number; respostas: number; last_seen_at: string | null }[] | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      // Janela do período: $2/$3 = De/Até (YYYY-MM-DD). Default = últimos 30 dias. `to` é
      // inclusivo do dia inteiro (+1 dia, limite exclusivo). Sem filtro → comportamento antigo.
      const rows = (await c.query(
        `with w as (select coalesce($2::date, (now()-'30 days'::interval)::date) f,
                           coalesce($3::date + 1, now()::date + 1) t),
         pairs as (
           select r.from_type, r.sender_user_id, r.conversation_id,
                  -- IA sem persona carimbada (acting_agent_id null) é atribuída ao agente DA CONVERSA
                  -- (brain/base). Senão cairia num balde genérico "IA (geral)" que confunde o dono.
                  case when r.from_type='ai' then coalesce(r.acting_agent_id, cv.brain_agent_id, cv.agent_id) end as eff_agent_id,
                  extract(epoch from (r.created_at - msg.created_at)) sec
             from whatsapp.messages msg, w
             join lateral (select from_type, sender_user_id, acting_agent_id, conversation_id, created_at
               from whatsapp.messages a
              where a.conversation_id=msg.conversation_id and a.from_type in ('ai','human') and a.created_at>msg.created_at
              order by a.created_at asc limit 1) r on true
             join whatsapp.conversations cv on cv.id = r.conversation_id
            where msg.organization_id=$1 and msg.from_type='user' and msg.created_at>=w.f and msg.created_at<w.t
              and ($4::uuid is null or (r.from_type='human' and r.sender_user_id=$4::uuid)))
         select pp.from_type, pp.sender_user_id, pp.eff_agent_id as acting_agent_id,
                case when pp.from_type='human' then coalesce(pr.full_name,'Atendente (não identificado)')
                     else coalesce(ag.name,'IA') end as nome,
                coalesce(round(avg(pp.sec) filter (where pp.sec between 0 and 3600)),0)::int tmed,
                count(distinct pp.conversation_id)::int convs,
                count(*) filter (where pp.sec between 0 and 3600)::int respostas,
                pr.last_seen_at
           from pairs pp
           left join public.profiles pr on pr.id = pp.sender_user_id
           left join agents.agents  ag on ag.id = pp.eff_agent_id
          group by pp.from_type, pp.sender_user_id, pp.eff_agent_id, nome, pr.last_seen_at
          order by tmed desc`,
        [orgId, from ?? null, to ?? null, onlyUserId ?? null])).rows;
      return rows.map((r: any) => ({
        kind: r.from_type === 'ai' ? 'ai' : 'human',
        id: (r.from_type === 'ai' ? r.acting_agent_id : r.sender_user_id) || null,
        nome: r.nome,
        tmed: r.tmed > 0 ? r.tmed : null,
        convs: r.convs,
        respostas: r.respostas,
        last_seen_at: r.last_seen_at || null,
      }));
    } finally {
      c.release();
    }
  }

  // DRILL-DOWN Fase 2: as CONVERSAS em que um colaborador respondeu (humano por sender_user_id, IA
  // pela persona carimbada OU pelo agente da conversa — mesma re-atribuição do nível 1, senão o
  // clique na Giovanna não traria as conversas "órfãs" dela). Traz contato + se está AGUARDANDO
  // resposta agora (last_inbound>last_outbound) + o id p/ deep-link no CRM. Escopo por org.
  async collabConversations(orgId: string, kind: 'human' | 'ai', id: string | null, from?: string | null, to?: string | null, q?: string | null): Promise<{ id: string; nome: string; phone: string | null; aguardando: boolean; last_inbound: string | null; last_outbound: string | null }[] | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      // $4/$5 = período De/Até (default 30d, `to` inclusivo). $6 = busca por lead (nome/telefone).
      const rows = (await c.query(
        `with w as (select coalesce($4::date, (now()-'30 days'::interval)::date) f,
                           coalesce($5::date + 1, now()::date + 1) t),
         resp as (
           select m.conversation_id
             from whatsapp.messages m
             join whatsapp.conversations c on c.id = m.conversation_id
             cross join w
            where m.organization_id=$1 and m.created_at>=w.f and m.created_at<w.t
              and case when $2='ai'
                       -- espelha a re-atribuição do nível 1: IA = agente carimbado OU o agente da conversa
                       then m.from_type='ai'    and (($3::uuid is not null and coalesce(m.acting_agent_id, c.brain_agent_id, c.agent_id)=$3::uuid) or ($3::uuid is null and coalesce(m.acting_agent_id, c.brain_agent_id, c.agent_id) is null))
                       else m.from_type='human' and (($3::uuid is not null and m.sender_user_id=$3::uuid)  or ($3::uuid is null and m.sender_user_id  is null))
                  end)
         select cv.id, coalesce(nullif(ct.name,''), ct.phone, 'Contato') nome, ct.phone,
                (cv.last_inbound is not null and (cv.last_outbound is null or cv.last_inbound > cv.last_outbound)) aguardando,
                cv.last_inbound, cv.last_outbound
           from (select distinct conversation_id from resp) rc
           join whatsapp.conversations cv on cv.id = rc.conversation_id
           left join whatsapp.contacts ct on ct.id = cv.contact_id
          where coalesce(cv.archived,false)=false
            and ($6::text is null or ct.name ilike '%'||$6||'%' or ct.phone ilike '%'||$6||'%')
          order by aguardando desc, coalesce(cv.last_inbound, cv.last_outbound) desc nulls last
          limit 40`,
        [orgId, kind, id, from ?? null, to ?? null, (q && q.trim()) ? q.trim() : null])).rows;
      return rows.map((r: any) => ({ id: String(r.id), nome: r.nome, phone: r.phone || null, aguardando: !!r.aguardando, last_inbound: r.last_inbound || null, last_outbound: r.last_outbound || null }));
    } finally {
      c.release();
    }
  }

  // DRILL-DOWN do card "Atendimentos feitos pela IA" — SÓ agentes de IA e TODOS da empresa (base =
  // agents.agents, inclusive os com 0 atendimento no período; humanos NÃO entram). Métricas de
  // atendimento por agente com a MESMA re-atribuição do responseByCollaborator (acting_agent_id,
  // senão o agente da conversa). status = live/paused/offline/implanting; IA fica "sempre no ar".
  async aiAgentsByOrg(orgId: string, from?: string | null, to?: string | null): Promise<{ kind: 'ai'; id: string; nome: string; status: string; tmed: number | null; convs: number; respostas: number; last_seen_at: string | null }[] | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      const rows = (await c.query(
        `with w as (select coalesce($2::date, (now()-'30 days'::interval)::date) f,
                           coalesce($3::date + 1, now()::date + 1) t),
         pairs as (
           select coalesce(r.acting_agent_id, cv.brain_agent_id, cv.agent_id) as eff_agent_id,
                  r.conversation_id, extract(epoch from (r.created_at - msg.created_at)) sec
             from whatsapp.messages msg, w
             join lateral (select acting_agent_id, conversation_id, created_at
               from whatsapp.messages a
              where a.conversation_id = msg.conversation_id and a.from_type = 'ai' and a.created_at > msg.created_at
              order by a.created_at asc limit 1) r on true
             join whatsapp.conversations cv on cv.id = r.conversation_id
            where msg.organization_id = $1 and msg.from_type = 'user' and msg.created_at >= w.f and msg.created_at < w.t)
         select ag.id, ag.name nome, ag.status::text status,
                coalesce(round(avg(pp.sec) filter (where pp.sec between 0 and 3600)), 0)::int tmed,
                count(distinct pp.conversation_id)::int convs,
                count(pp.sec) filter (where pp.sec between 0 and 3600)::int respostas
           from agents.agents ag
           left join pairs pp on pp.eff_agent_id = ag.id
          where ag.organization_id = $1 and ag.archived_at is null
          group by ag.id, ag.name, ag.status
          order by convs desc, ag.name`,
        [orgId, from ?? null, to ?? null])).rows;
      return rows.map((r: any) => ({
        kind: 'ai' as const, id: String(r.id), nome: r.nome || 'IA', status: r.status,
        tmed: r.tmed > 0 ? r.tmed : null, convs: r.convs, respostas: r.respostas, last_seen_at: null,
      }));
    } finally {
      c.release();
    }
  }

  // DRILL-DOWN de HORAS (Fase A · nível 2) — as SESSÕES (login/logout) de um colaborador no período.
  // login=started_at, logout=coalesce(logout_at, last_active_at, last_ping_at) (fim da atividade). Escopo
  // por org (exists em profiles); o membro só chega aqui com o próprio id (forçado no controller).
  async collabSessions(orgId: string, userId: string, from?: string | null, to?: string | null): Promise<{ id: string; login: string; logout: string; minutos: number }[] | null> {
    const p = this.db();
    if (!p || !orgId || !userId) return null;
    const c = await p.connect();
    try {
      const rows = (await c.query(
        `with w as (select coalesce($3::date, (now()-'30 days'::interval)::date) f,
                           coalesce($4::date + 1, now()::date + 1) t)
         select s.id, s.started_at login, coalesce(s.logout_at, s.last_active_at) logout,
                round(extract(epoch from (coalesce(s.logout_at, s.last_active_at) - s.started_at)) / 60)::int minutos
           from public.user_sessions s, w
          where s.user_id = $2::uuid
            and exists (select 1 from public.profiles pr where pr.id = s.user_id and pr.organization_id = $1)
            and coalesce(s.logout_at, s.last_active_at) is not null
            and s.started_at >= w.f and s.started_at < w.t
          order by s.started_at desc
          limit 200`,
        [orgId, userId, from ?? null, to ?? null])).rows;
      return rows.map((r: any) => ({ id: String(r.id), login: r.login, logout: r.logout, minutos: r.minutos }));
    } finally {
      c.release();
    }
  }

  // RELÓGIO DE PONTO — sessões CRUAS do wacrm (em epoch ms) + last_seen por usuário, para o MERGE
  // Portal+wacrm (a união de intervalos por user_id é feita no controller, junto das sessões do Portal).
  async pontoRaw(orgId: string, onlyUserId?: string | null): Promise<{ sessions: { uid: string; s: number; e: number }[]; lastSeen: Record<string, number> } | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      const sess = (await c.query(
        `select s.user_id::text uid, extract(epoch from s.started_at) * 1000 s,
                extract(epoch from coalesce(s.logout_at, s.last_active_at)) * 1000 e
           from public.user_sessions s join public.profiles p on p.id = s.user_id
          where p.organization_id = $1 and s.started_at > now() - '180 days'::interval
            and coalesce(s.logout_at, s.last_active_at) is not null
            and ($2::uuid is null or s.user_id = $2::uuid)`,
        [orgId, onlyUserId ?? null])).rows;
      const ls = (await c.query(
        `select id::text uid, extract(epoch from last_seen_at) * 1000 ls from public.profiles
          where organization_id = $1 and last_seen_at is not null and ($2::uuid is null or id = $2::uuid)`,
        [orgId, onlyUserId ?? null])).rows;
      const lastSeen: Record<string, number> = {};
      for (const r of ls) lastSeen[r.uid] = Number(r.ls);
      return { sessions: sess.map((r: any) => ({ uid: r.uid, s: Number(r.s), e: Number(r.e) })), lastSeen };
    } finally {
      c.release();
    }
  }

  // DRILL-DOWN do card "Leads / mês" — lista de LEADS = whatsapp.contacts (mesma fonte que o card
  // conta). Paginado (OFFSET/LIMIT → abas, sem scroll infinito); `total` p/ montar as abas. FAROL:
  // interesse da conversa (conversations.interest, ligado por contact_id) + funil de vendas
  // (whatsapp.leads.status + valor, casado por telefone — não há FK, pode faltar). Busca por nome/tel.
  async leadsList(orgId: string, from?: string | null, to?: string | null, q?: string | null, pageSize = 12, offset = 0): Promise<{ rows: { id: string; nome: string; phone: string | null; email: string | null; company: string | null; created_at: string; convs: number; interest: string; funil_status: string | null; valor: number | null }[]; total: number } | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      const rows = (await c.query(
        `with w as (select coalesce($2::date, (now()-'30 days'::interval)::date) f,
                           coalesce($3::date + 1, now()::date + 1) t)
         select ct.id, coalesce(nullif(ct.name,''), ct.phone, 'Contato') nome, ct.phone, ct.email, ct.company, ct.created_at,
                (select count(*) from whatsapp.conversations cv where cv.contact_id = ct.id)::int convs,
                (select case when bool_or(cv.interest = 'interested') then 'interested'
                             when bool_or(cv.interest = 'declined')   then 'declined' else 'unknown' end
                   from whatsapp.conversations cv where cv.contact_id = ct.id) interest,
                l.status funil_status, l.valor,
                count(*) over()::int total
           from whatsapp.contacts ct, w
           left join lateral (select status, valor from whatsapp.leads l
              where l.organization_id = ct.organization_id and l.telefone = ct.phone
              order by valor desc nulls last, last_activity_at desc nulls last limit 1) l on true
          where ct.organization_id = $1 and ct.created_at >= w.f and ct.created_at < w.t
            and ($4::text is null or ct.name ilike '%'||$4||'%' or ct.phone ilike '%'||$4||'%')
          order by ct.created_at desc
          limit $5 offset $6`,
        [orgId, from ?? null, to ?? null, (q && q.trim()) ? q.trim() : null, pageSize, offset])).rows;
      const total = rows[0]?.total ?? 0;
      return {
        rows: rows.map((r: any) => ({
          id: String(r.id), nome: r.nome, phone: r.phone || null, email: r.email || null, company: r.company || null,
          created_at: r.created_at, convs: r.convs, interest: r.interest || 'unknown',
          funil_status: r.funil_status || null, valor: r.valor != null ? Number(r.valor) : null,
        })),
        total,
      };
    } finally {
      c.release();
    }
  }

  // DETALHE de um lead (master-detail): cabeçalho + interesse/funil + as CONVERSAS dele (p/ o front
  // listar e escolher). O resumo da IA vem à parte (Psiquê/DeepSeek, cacheado).
  async leadDetail(orgId: string, contactId: string): Promise<{ nome: string; phone: string | null; email: string | null; company: string | null; interest: string; funil_status: string | null; valor: number | null; conversas: { id: string; interest: string | null; status: string | null; msgs: number; last_inbound: string | null; last_outbound: string | null }[] } | null> {
    const p = this.db();
    if (!p || !orgId || !contactId) return null;
    const c = await p.connect();
    try {
      const h = (await c.query(
        `select coalesce(nullif(ct.name,''), ct.phone, 'Contato') nome, ct.phone, ct.email, ct.company,
                (select case when bool_or(cv.interest='interested') then 'interested'
                             when bool_or(cv.interest='declined') then 'declined' else 'unknown' end
                   from whatsapp.conversations cv where cv.contact_id = ct.id) interest,
                l.status funil_status, l.valor
           from whatsapp.contacts ct
           left join lateral (select status, valor from whatsapp.leads l
              where l.organization_id = ct.organization_id and l.telefone = ct.phone
              order by valor desc nulls last, last_activity_at desc nulls last limit 1) l on true
          where ct.id = $2 and ct.organization_id = $1`,
        [orgId, contactId])).rows[0];
      if (!h) return null;
      const conversas = (await c.query(
        `select cv.id, cv.interest, cv.status,
                (select count(*) from whatsapp.messages m where m.conversation_id = cv.id and m.body is not null)::int msgs,
                cv.last_inbound, cv.last_outbound
           from whatsapp.conversations cv
          where cv.contact_id = $2 and cv.organization_id = $1
          order by coalesce(cv.last_inbound, cv.last_outbound) desc nulls last`,
        [orgId, contactId])).rows;
      return {
        nome: h.nome, phone: h.phone || null, email: h.email || null, company: h.company || null,
        interest: h.interest || 'unknown', funil_status: h.funil_status || null, valor: h.valor != null ? Number(h.valor) : null,
        conversas: conversas.map((r: any) => ({ id: String(r.id), interest: r.interest || null, status: r.status || null, msgs: r.msgs, last_inbound: r.last_inbound || null, last_outbound: r.last_outbound || null })),
      };
    } finally {
      c.release();
    }
  }

  // TRANSCRIPT da conversa de um lead (p/ o DeepSeek resumir). Rotula cada fala: cliente / IA(nome) /
  // humano(nome). Limitado p/ caber no contexto do modelo. Escopo por org.
  async leadTranscript(orgId: string, contactId: string): Promise<string | null> {
    const p = this.db();
    if (!p || !orgId || !contactId) return null;
    const c = await p.connect();
    try {
      const rows = (await c.query(
        `select m.from_type, m.body, ag.name agent_name, pr.full_name human_name
           from whatsapp.messages m
           join whatsapp.conversations cv on cv.id = m.conversation_id
           left join agents.agents ag on ag.id = coalesce(m.acting_agent_id, cv.brain_agent_id, cv.agent_id)
           left join public.profiles pr on pr.id = m.sender_user_id
          where cv.contact_id = $2 and m.organization_id = $1 and m.body is not null
          order by m.created_at asc
          limit 400`,
        [orgId, contactId])).rows;
      if (!rows.length) return null;
      return rows.map((r: any) => {
        const who = r.from_type === 'user' ? 'Cliente' : r.from_type === 'ai' ? `IA${r.agent_name ? ' (' + r.agent_name + ')' : ''}` : (r.human_name || 'Atendente');
        return `${who}: ${String(r.body).replace(/\s+/g, ' ').trim()}`;
      }).join('\n');
    } finally {
      c.release();
    }
  }

  // IDs dos leads (contatos) do período — para o classificador de potencial (IA) saber quais existem.
  async recentLeadIds(orgId: string, from?: string | null, to?: string | null, limit = 500): Promise<string[] | null> {
    const p = this.db();
    if (!p || !orgId) return null;
    const c = await p.connect();
    try {
      const rows = (await c.query(
        `with w as (select coalesce($2::date, (now()-'30 days'::interval)::date) f, coalesce($3::date + 1, now()::date + 1) t)
         select ct.id::text id from whatsapp.contacts ct, w
          where ct.organization_id = $1 and ct.created_at >= w.f and ct.created_at < w.t
          order by ct.created_at desc limit $4`,
        [orgId, from ?? null, to ?? null, limit])).rows;
      return rows.map((r: any) => String(r.id));
    } finally {
      c.release();
    }
  }
}
