import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context CATALOG (schema catalog). asUser → RLS: cliente vê vdi_modules ativos +
// serviços client-facing; admin vê tudo. service_prices/commission_rules são internos (não expostos aqui).
@Controller('catalog')
@UseGuards(JwtOrgGuard)
export class CatalogController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  // lista de colunas validada (evita injeção via ?fields=)
  private cols(fields: string | undefined, def: string): string {
    const src = (fields || def).split(',').map((s) => s.trim()).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));
    return src.length ? src.map((s) => `"${s}"`).join(',') : def.split(',').map((s) => `"${s.trim()}"`).join(',');
  }
  private set(patch: Record<string, any>, startAt: number) {
    const keys = Object.keys(patch || {}).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    return { sets: keys.map((k, i) => `"${k}"=$${startAt + i}`).join(', '), vals: keys.map((k) => patch[k]), ok: keys.length > 0 };
  }
  private insertOf(table: string, b: any) {
    const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    return { sql: `insert into ${table} (${cols.map((k) => `"${k}"`).join(',')}) values (${ph})`, vals: cols.map((k) => b[k]) };
  }

  // ── vdi_modules ──
  @Get('vdi-modules/active')
  vmActive(@Req() req: any, @Query('fields') fields: string) {
    const cols = this.cols(fields, 'id,name,description,category');
    return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${cols} from catalog.vdi_modules where active=true order by category`)).rows);
  }
  @Get('vdi-modules/active-by-name')
  vmActiveByName(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,name,category,department,internal_url from catalog.vdi_modules where active=true order by name')).rows);
  }
  @Get('vdi-modules')
  vmAll(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from catalog.vdi_modules order by department, name')).rows);
  }
  @Get('vdi-modules/by-ids')
  vmByIds(@Req() req: any, @Query('ids') ids: string, @Query('fields') fields: string) {
    const arr = (ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cols = this.cols(fields, 'id,name,description,category');
    return this.db.asUser(this.uid(req), async (c) => (arr.length ? (await c.query(`select ${cols} from catalog.vdi_modules where id = any($1)`, [arr])).rows : []));
  }
  @Post('vdi-modules')
  vmCreate(@Req() req: any, @Body() b: any) { const { sql, vals } = this.insertOf('catalog.vdi_modules', b); return this.db.asUser(this.uid(req), async (c) => { await c.query(sql, vals); return { ok: true }; }); }
  @Patch('vdi-modules/:id')
  vmUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update catalog.vdi_modules set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }
  @Delete('vdi-modules/:id')
  vmRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from catalog.vdi_modules where id=$1', [id]); return { ok: true }; }); }

  // ── vdi_catalog (nomes/departamentos) ──
  @Get('vdi-catalog/names')
  vcNames(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select name,department,description from catalog.vdi_catalog order by name')).rows); }

  // ── services (catálogo Crasto; interno vs client-facing pela RLS/filtro) ──
  @Get('services')
  svcList(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from catalog.services order by category')).rows); }
  @Get('services/client-facing')
  svcClient(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select id,name,description,category,unit from catalog.services where active=true and internal=false order by category, name`)).rows); }
  @Get('services/by-ids')
  svcByIds(@Req() req: any, @Query('ids') ids: string) { const arr = (ids || '').split(',').map((s) => s.trim()).filter(Boolean); return this.db.asUser(this.uid(req), async (c) => (arr.length ? (await c.query('select id,name,description,category,unit from catalog.services where id = any($1)', [arr])).rows : [])); }
  @Get('services/proposals')
  svcProposals(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,name,unit,price_table,category from catalog.services order by price_table desc')).rows); }
  @Post('services')
  svcCreate(@Req() req: any, @Body() b: any) { const { sql, vals } = this.insertOf('catalog.services', b); return this.db.asUser(this.uid(req), async (c) => { await c.query(sql, vals); return { ok: true }; }); }
  @Patch('services/:id')
  svcUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update catalog.services set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }
  @Delete('services/:id')
  svcRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from catalog.services where id=$1', [id]); return { ok: true }; }); }
}
