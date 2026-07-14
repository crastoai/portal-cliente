import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context CRM (schema crm) — pessoas, telefones, documentos, atividades, tax_ids da empresa.
// asUser → RLS escopa por organization_id (cliente sua org; admin tudo).
@Controller('crm')
@UseGuards(JwtOrgGuard)
export class CrmController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  private set(patch: Record<string, any>, startAt: number) {
    const keys = Object.keys(patch || {}).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    return { sets: keys.map((k, i) => `"${k}"=$${startAt + i}`).join(', '), vals: keys.map((k) => patch[k]), ok: keys.length > 0 };
  }
  private ins(table: string, b: any, returning = '') {
    const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    return { sql: `insert into ${table} (${cols.map((k) => `"${k}"`).join(',')}) values (${ph})${returning ? ' returning ' + returning : ''}`, vals: cols.map((k) => b[k]) };
  }

  // ── people ──
  @Get('people')
  peopleByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from crm.people where organization_id=$1 order by is_primary desc', [org])).rows); }
  @Post('people')
  peopleAdd(@Req() req: any, @Body() b: any) { const { sql, vals } = this.ins('crm.people', b); return this.db.asUser(this.uid(req), async (c) => { await c.query(sql, vals); return { ok: true }; }); }
  @Patch('people/:id')
  peopleUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update crm.people set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }

  // ── phones ──
  @Get('phones')
  phonesByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from crm.phones where organization_id=$1', [org])).rows); }
  @Get('phones/by-orgs')
  phonesByOrgs(@Req() req: any, @Query('orgs') orgs: string) { const arr = (orgs || '').split(',').map((s) => s.trim()).filter(Boolean); return this.db.asUser(this.uid(req), async (c) => (arr.length ? (await c.query('select organization_id,country_code,number,is_primary from crm.phones where organization_id = any($1)', [arr])).rows : [])); }
  @Post('phones')
  phonesAdd(@Req() req: any, @Body() b: any) { const { sql, vals } = this.ins('crm.phones', b); return this.db.asUser(this.uid(req), async (c) => { await c.query(sql, vals); return { ok: true }; }); }
  @Patch('phones/:id')
  phonesUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update crm.phones set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }

  // ── documents ──
  @Get('documents')
  docsByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from crm.documents where organization_id=$1 order by uploaded_at desc', [org])).rows); }
  @Post('documents')
  docsAdd(@Req() req: any, @Body() b: any) { const { sql, vals } = this.ins('crm.documents', b, 'id'); return this.db.asUser(this.uid(req), async (c) => (await c.query(sql, vals)).rows[0]); }
  @Delete('documents/:id')
  docsRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from crm.documents where id=$1', [id]); return { ok: true }; }); }

  // ── activities ──
  @Get('activities')
  actByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from crm.activities where organization_id=$1 order by occurred_at desc', [org])).rows); }
  @Post('activities')
  actAdd(@Req() req: any, @Body() b: any) { const { sql, vals } = this.ins('crm.activities', b); return this.db.asUser(this.uid(req), async (c) => { await c.query(sql, vals); return { ok: true }; }); }

  // ── tax_ids ──
  @Get('tax-ids')
  taxByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,kind,value,address,is_primary from crm.tax_ids where organization_id=$1 order by is_primary desc, created_at', [org])).rows); }
  @Post('tax-ids')
  taxAdd(@Req() req: any, @Body() b: any) { const { sql, vals } = this.ins('crm.tax_ids', b); return this.db.asUser(this.uid(req), async (c) => { await c.query(sql, vals); return { ok: true }; }); }
  @Patch('tax-ids/:id')
  taxUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update crm.tax_ids set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }
  @Delete('tax-ids/:id')
  taxRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from crm.tax_ids where id=$1', [id]); return { ok: true }; }); }
  @Post('tax-ids/:id/primary')
  taxPrimary(@Req() req: any, @Param('id') id: string, @Query('org') org: string) {
    return this.db.asUser(this.uid(req), async (c) => {
      await c.query('update crm.tax_ids set is_primary=false where organization_id=$1', [org]);
      await c.query('update crm.tax_ids set is_primary=true where id=$1', [id]);
      return { ok: true };
    });
  }

  // ── remoção genérica (whitelist de tabela) ──
  @Delete('row/:table/:id')
  removeRow(@Req() req: any, @Param('table') table: string, @Param('id') id: string) {
    const allow = ['people', 'phones', 'activities', 'documents'];
    if (!allow.includes(table)) return { ok: false };
    return this.db.asUser(this.uid(req), async (c) => { await c.query(`delete from crm.${table} where id=$1`, [id]); return { ok: true }; });
  }
}
