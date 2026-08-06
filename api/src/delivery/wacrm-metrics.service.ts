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
}
