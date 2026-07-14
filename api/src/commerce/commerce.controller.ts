import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context COMMERCE (schema commerce) — propostas, itens, contratos.
// asUser → RLS: cliente vê só proposta enviada (rascunho oculto) + contrato próprio; admin tudo.
// Geração de contrato/Autentique/IA continuam em Edge Functions (server-side) no cliente.
@Controller('commerce')
@UseGuards(JwtOrgGuard)
export class CommerceController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  private ins(table: string, b: any, returning = '') {
    const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    return { sql: `insert into ${table} (${cols.map((k) => `"${k}"`).join(',')}) values (${ph})${returning ? ' returning ' + returning : ''}`, vals: cols.map((k) => b[k]) };
  }

  @Post('proposals')
  create(@Req() req: any, @Body() b: any) { const { sql, vals } = this.ins('commerce.proposals', b, '*'); return this.db.asUser(this.uid(req), async (c) => (await c.query(sql, vals)).rows[0]); }
  @Get('proposals')
  listByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,title,subtotal,status,accepted_at,connector_id,created_at from commerce.proposals where organization_id=$1 order by created_at desc', [org])).rows); }
  @Post('proposals/:id/accept')
  accept(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_accept_proposal($1) as r', [id])).rows[0]?.r); }
  @Post('proposals/:id/reopen')
  reopen(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_reopen_proposal($1) as r', [id])).rows[0]?.r); }
  @Post('proposal-items')
  addItems(@Req() req: any, @Body() rows: any[]) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return null;
    return this.db.asUser(this.uid(req), async (c) => {
      for (const row of list) { const { sql, vals } = this.ins('commerce.proposal_items', row); await c.query(sql, vals); }
      return { ok: true, inserted: list.length };
    });
  }
}
