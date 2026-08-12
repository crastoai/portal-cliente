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
    // `kind` pode vir com múltiplos tipos separados por vírgula (ex.: 'support,improvement_request').
    const kinds = (kind || '').split(',').map((k) => k.trim()).filter(Boolean);
    return this.db.asUser(this.uid(req), async (c) => (kinds.length
      ? (await c.query('select id,subject,description,status,organization_id,created_at,kind,assigned_to,attachments from support.tickets where kind = any($1) order by created_at desc', [kinds])).rows
      : (await c.query('select id,subject,description,status,organization_id,created_at,kind,assigned_to,attachments from support.tickets order by created_at desc')).rows));
  }
  @Patch('tickets/:id/status')
  ticketStatus(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query('update support.tickets set status=$2 where id=$1', [id, b.status ?? null]); return { ok: true }; }); }
  /** Admin: define o responsável pelo chamado (agente_ia=Jorge / john / crasto), ou limpa (null). */
  @Patch('tickets/:id/assign')
  @UseGuards(AdminGuard)
  ticketAssign(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    const who = ['agente_ia', 'john', 'crasto'].includes(b?.assigned_to) ? b.assigned_to : null;
    return this.db.asUser(this.uid(req), async (c) => { await c.query('update support.tickets set assigned_to=$2 where id=$1', [id, who]); return { ok: true, assigned_to: who }; });
  }

  @Get('pending-actions/mine')
  pendingMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,type,description,status from support.pending_actions order by status desc')).rows); }

  // ── Central de notificações (agregada, por perfil via RLS) ──
  @Get('notifications')
  notifications(@Req() req: any) {
    const uid = this.uid(req);
    return this.db.asUser(uid, async (c) => {
      const admin = (await c.query('select public.is_crasto_admin() as a')).rows[0]?.a === true;
      const seen = (await c.query('select notifications_seen_at from public.profiles where id=$1', [uid])).rows[0]?.notifications_seen_at ?? null;
      const items: any[] = [];
      if (admin) {
        const L: any = { implementation_request: 'Solicitação de implantação', improvement_request: 'Demanda de melhoria', support: 'Chamado de suporte' };
        const LINK: any = { implementation_request: '/admin/implantacoes', improvement_request: '/admin/tickets', support: '/admin/tickets' };
        const tk = (await c.query(`select t.subject, t.kind, t.assigned_to, t.created_at as at, o.name as org from support.tickets t join public.organizations o on o.id=t.organization_id where t.status='open' order by t.created_at desc limit 30`)).rows;
        for (const r of tk) items.push({ type: r.kind, title: (L[r.kind] || 'Chamado') + ': ' + (r.subject || ''), subtitle: r.org, at: r.at, assignee: r.assigned_to, link: LINK[r.kind] || '/admin/tickets' });
        const red = (await c.query(`select o.id, o.name, h.updated_at as at from delivery.system_health h join public.organizations o on o.id=h.organization_id where h.status='red' order by h.updated_at desc limit 20`)).rows;
        for (const r of red) items.push({ type: 'health_red', title: 'Ambiente em risco: ' + r.name, subtitle: 'farol vermelho', at: r.at, assignee: null, link: '/admin/cliente/' + r.id });
      } else {
        // Lembrete de pagamento a partir das faturas REAIS (my_faturas → finance.accounts, escopo do
        // próprio cliente via auth.uid). Só o que interessa lembrar: vencidas ou vencendo em 7 dias.
        const hoje = new Date().toISOString().slice(0, 10);
        const lim = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        const inv = (await c.query(`select id, description, amount, due_date, status from public.my_faturas() where status = 'open' and due_date is not null and due_date <= $1 order by due_date`, [lim])).rows;
        for (const r of inv) {
          const venc = r.due_date < hoje;
          const dt = new Date(r.due_date + 'T00:00:00').toLocaleDateString('pt-BR');
          items.push({ type: 'invoice', title: venc ? 'Fatura vencida — pague via Pix' : 'Fatura a vencer — pague via Pix', subtitle: (r.description || 'Parcela') + ' · R$ ' + Number(r.amount || 0).toLocaleString('pt-BR') + ' · vence ' + dt, at: r.due_date, assignee: null, link: '/app/financeiro' });
        }
        const upd = (await c.query(`select subject, status, updated_at as at from support.tickets where status in ('in_progress','resolved') order by updated_at desc limit 20`)).rows;
        for (const r of upd) items.push({ type: 'ticket_update', title: 'Atualização no seu chamado', subtitle: r.subject, at: r.at, assignee: null, link: '/app/suporte' });
      }
      items.sort((a, b) => (new Date(b.at || 0).getTime()) - (new Date(a.at || 0).getTime()));
      const count = seen ? items.filter((i) => i.at && new Date(i.at) > new Date(seen)).length : items.length;
      return { items: items.slice(0, 30), count, admin };
    });
  }
  @Post('notifications/seen')
  notifSeen(@Req() req: any) { const uid = this.uid(req); return this.db.asUser(uid, async (c) => { await c.query('update public.profiles set notifications_seen_at=now() where id=$1', [uid]); return { ok: true }; }); }
}
