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
           (select count(*) filter (where from_type='human') from whatsapp.messages, w where organization_id=$1 and created_at>=w.f)::int human`,
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
        trend: { atendimentos: pct(m.atend, m.atend_prev), novos_leads: pct(m.leads, m.leads_prev) },
        volume: vol,
      };
    } finally {
      c.release();
    }
  }
}
