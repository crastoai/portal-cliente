import { Controller, Get, Query } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { Pool } from 'pg';

// Marcador de deploy: muda a cada build p/ confirmar que o container subiu o código novo.
const VER = 'cockpit-diag-2';

@Controller('health')
export class HealthController {
  constructor(private readonly db: RlsDbService) {}

  @Get()
  async health() {
    let db = 'down';
    try {
      await this.db.asService(async (c) => { await c.query('select 1'); });
      db = 'up';
    } catch { db = 'down'; }

    let wacrm: { ok: boolean; ms?: number; error?: string } = { ok: false };
    const url = process.env.WACRM_DATABASE_URL;
    if (!url) {
      wacrm = { ok: false, error: 'WACRM_DATABASE_URL ausente' };
    } else {
      const t = Date.now();
      const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 8000 });
      try {
        const c = await pool.connect();
        try { await c.query('select 1'); } finally { c.release(); }
        wacrm = { ok: true, ms: Date.now() - t };
      } catch (e: any) {
        wacrm = { ok: false, ms: Date.now() - t, error: String(e?.message || e).slice(0, 200) };
      } finally {
        await pool.end().catch(() => {});
      }
    }
    return { ok: db === 'up', service: 'portal-api', layer: 'middle-end', db, ver: VER, wacrm };
  }

  // PROBE (temporário, travado pela INTERNAL_SERVICE_KEY): roda EXATAMENTE o que o cockpitMine roda
  // p/ uma org, mas DEVOLVE o erro em vez de engolir (o .catch do controller mascarava a causa).
  @Get('cockpit-probe')
  async cockpitProbe(@Query('key') key: string, @Query('org') org: string) {
    if (!process.env.INTERNAL_SERVICE_KEY || key !== process.env.INTERNAL_SERVICE_KEY) return { error: 'forbidden' };
    const out: any = { org, ver: VER };

    // identity (asService) — igual ao controller
    try {
      out.identity = await this.db.asService(async (c) => {
        const name = (await c.query('select name from public.organizations where id=$1', [org])).rows[0]?.name ?? null;
        return { org_name: name };
      });
    } catch (e: any) { out.identity_error = String(e?.message || e); }

    // resultados() — bloco principal, com erro EXPLÍCITO
    const url = process.env.WACRM_DATABASE_URL;
    if (!url) { out.resultados_error = 'WACRM_DATABASE_URL ausente'; return out; }
    const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 8000 });
    const t = Date.now();
    try {
      const c = await pool.connect();
      try {
        const m = (await c.query(
          `with w as (select now()-'30 days'::interval f, now() t)
           select (select count(distinct msg.conversation_id) from whatsapp.messages msg, w where msg.organization_id=$1 and msg.created_at>=w.f and msg.created_at<w.t)::int atend,
                  (select count(*) from whatsapp.contacts ct, w where ct.organization_id=$1 and ct.created_at>=w.f and ct.created_at<w.t)::int leads,
                  (select count(*) filter (where from_type='ai') from whatsapp.messages, w where organization_id=$1 and created_at>=w.f)::int ai,
                  (select count(*) filter (where from_type='human') from whatsapp.messages, w where organization_id=$1 and created_at>=w.f)::int human`,
          [org])).rows[0];
        out.resultados = { ...m, ms: Date.now() - t };
      } finally { c.release(); }
    } catch (e: any) {
      out.resultados_error = String(e?.message || e);
      out.resultados_ms = Date.now() - t;
    } finally { await pool.end().catch(() => {}); }
    return out;
  }
}
