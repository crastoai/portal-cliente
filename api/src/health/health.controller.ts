import { Controller, Get } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { Pool } from 'pg';

// Marcador de deploy: muda a cada build p/ confirmar que o container subiu o código novo.
const VER = 'cockpit-diag-1';

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

    // DIAGNÓSTICO (temporário): o container alcança o wacrm cross-DB? Só conectividade — sem dado,
    // sem segredo. É por aqui que o resultados() do Cockpit falhava silenciosamente (.catch → null).
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

    // `ok` depende só do banco do Portal — o teste do wacrm NÃO derruba o healthcheck do container.
    return { ok: db === 'up', service: 'portal-api', layer: 'middle-end', db, ver: VER, wacrm };
  }
}
