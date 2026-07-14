import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context SUPPORT (schema support) — tickets, ações pendentes, incidentes, notificações.
// asUser → RLS: cliente vê os da própria org; admin tudo. Abrir chamado / notificar ficam em Edge Functions.
@Controller('support')
@UseGuards(JwtOrgGuard)
export class SupportController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }

  @Get('tickets/mine')
  ticketsMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,subject,status from support.tickets order by created_at desc')).rows); }
  @Get('tickets')
  ticketsAll(@Req() req: any, @Query('kind') kind: string) {
    return this.db.asUser(this.uid(req), async (c) => (kind
      ? (await c.query('select id,subject,description,status,organization_id,created_at,kind from support.tickets where kind=$1 order by created_at desc', [kind])).rows
      : (await c.query('select id,subject,description,status,organization_id,created_at,kind from support.tickets order by created_at desc')).rows));
  }
  @Patch('tickets/:id/status')
  ticketStatus(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query('update support.tickets set status=$2 where id=$1', [id, b.status ?? null]); return { ok: true }; }); }

  @Get('pending-actions/mine')
  pendingMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,type,description,status from support.pending_actions order by status desc')).rows); }
}
