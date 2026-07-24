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

  // Colunas que o CLIENTE pode ver. Tudo que revele a origem interna da solução — acima de
  // tudo `internal_url`, que aponta para app.viverdeia.ai — é 🔒 INTERNO: o cliente nunca
  // sabe de onde vem a solução (regra inegociável do CONTEXTO_GERAL). O `?fields=` vem do
  // NAVEGADOR: antes ele era só saneado contra injeção, então bastava pedir
  // `fields=internal_url` para listar a Viver de IA inteira. Agora há duas camadas —
  // whitelist aqui e, para as internas, `is_crasto_admin()` avaliado no BANCO (não em JS,
  // que o cliente não controla mas também não é a fonte de verdade de quem é admin).
  // Prazo/setup/customização SÃO client-facing (a tela Catálogo do cliente os mostra: "entrega
  // em X dias"). Interno é só o que revela a ORIGEM/bastidor da solução.
  private static readonly PUBLIC_COLS = new Set([
    'id', 'name', 'description', 'category', 'icon', 'external_url', 'status', 'active',
    'created_at', 'updated_at', 'crm_solution',
    'setup_workdays', 'client_deadline_days', 'customization',
  ]);
  private static readonly INTERNAL_COLS = new Set([
    'internal_url', 'department', 'tools_cost_by', 'remix_date', 'version',
  ]);

  /** Monta o SELECT: coluna pública sai direta; coluna interna sai mascarada por admin. */
  private cols(fields: string | undefined, def: string): string {
    const pedidas = (fields || def).split(',').map((s) => s.trim()).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));
    const out: string[] = [];
    for (const col of pedidas) {
      if (CatalogController.PUBLIC_COLS.has(col)) out.push(`"${col}"`);
      // NULL para quem não é admin — a mesma consulta serve os dois, o banco decide.
      else if (CatalogController.INTERNAL_COLS.has(col)) out.push(`case when public.is_crasto_admin() then "${col}" end as "${col}"`);
      // desconhecida → ignorada (nunca interpolar coluna que não está no catálogo acima)
    }
    return out.length ? out.join(',') : def.split(',').map((s) => `"${s.trim()}"`).join(',');
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
