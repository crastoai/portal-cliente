import { Controller, Get } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';

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
    return { ok: db === 'up', service: 'portal-api', layer: 'middle-end', db };
  }
}
