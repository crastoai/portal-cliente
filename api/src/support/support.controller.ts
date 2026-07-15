import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';
import { TicketsService } from './tickets.service';

// Bounded context SUPPORT (schema support) — tickets, ações pendentes, incidentes, notificações.
// asUser → RLS: cliente vê os da própria org; admin tudo.
// Abrir chamado e notificar TAMBÉM vivem aqui (antes eram Edge Functions que liam a chave
// do Resend em texto plano; agora a chave vem do cofre — ver TicketsService).
@Controller('support')
@UseGuards(JwtOrgGuard)
export class SupportController {
  constructor(private readonly db: RlsDbService, private readonly tickets: TicketsService) {}
  private uid(req: any): string { return req.user.id; }

  /** Cliente abre chamado/solicitação — a org vem da RLS, nunca do corpo. */
  @Post('tickets')
  open(@Req() req: any, @Body() b: any) { return this.tickets.open(req, this.uid(req), b); }

  /** Admin avisa o cliente por e-mail e move o status. */
  @Post('tickets/:id/notify')
  @UseGuards(AdminGuard)
  notify(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.tickets.notify(req, this.uid(req), id, b?.template); }

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
