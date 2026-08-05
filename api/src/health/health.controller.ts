import { Controller, Get, Query } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { Pool } from 'pg';

// Marcador de versão do deploy — confirma de fora que o container subiu o build atual.
const VER = 'cockpit-live-1';

@Controller('health')
export class HealthController {
  constructor(private readonly db: RlsDbService) {}

  @Get()
  async health(@Query('deep') deep?: string) {
    let db = 'down';
    try {
      await this.db.asService(async (c) => { await c.query('select 1'); });
      db = 'up';
    } catch { db = 'down'; }

    const out: any = { ok: db === 'up', service: 'portal-api', layer: 'middle-end', db, ver: VER };

    // Checagem cross-DB (wacrm) só sob demanda (?deep=1) — não roda no healthcheck do container.
    if (deep === '1' && process.env.WACRM_DATABASE_URL) {
      const t = Date.now();
      const pool = new Pool({ connectionString: process.env.WACRM_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 8000 });
      try {
        const c = await pool.connect();
        try { await c.query('select 1'); } finally { c.release(); }
        out.wacrm = { ok: true, ms: Date.now() - t };
      } catch (e: any) {
        out.wacrm = { ok: false, ms: Date.now() - t, error: String(e?.message || e).slice(0, 200) };
      } finally { await pool.end().catch(() => {}); }
    }
    return out;
  }
}
