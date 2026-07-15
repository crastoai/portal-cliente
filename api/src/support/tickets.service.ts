import { BadRequestException, Injectable } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { EmailService } from '../common/email.service';
import { ticketReceived, ticketResolved, requestReceived, ticketInternalAlert } from '../common/email-templates';

/**
 * Chamados: abrir (cliente) e avisar (admin).
 * SUBSTITUI as Edge Functions `client-support-ticket` e `admin-ticket-notify` (2026-07-14),
 * que liam a chave do Resend em texto plano de `integration_configs.secret`. Aqui a chave
 * vem do COFRE (EmailService).
 *
 * O INSERT roda em `asUser`: a RLS decide a org do chamado — o cliente não escolhe por
 * qual empresa abre. Nunca confiar em organization_id vindo do corpo da requisição.
 */
@Injectable()
export class TicketsService {
  constructor(private readonly db: RlsDbService, private readonly email: EmailService) {}

  /** Código humano do chamado. Não há coluna `number`: derivamos do id (estável e curto). */
  private code(id: string) { return id.replace(/-/g, '').slice(0, 6).toUpperCase(); }

  /** Para onde vai o aviso interno: os admins REAIS da Crasto (sem endereço chumbado). */
  private async crastoInbox(): Promise<string[]> {
    return this.db.asService(async (c) => (await c.query(
      `select email from public.profiles where role='crasto_admin' and coalesce(email,'') <> ''`)).rows.map((r) => r.email));
  }

  /** Cliente abre um chamado (suporte) ou uma solicitação de implantação. */
  async open(uid: string, b: { subject?: string; description?: string; kind?: string }) {
    const subject = String(b.subject || '').trim();
    if (!subject) throw new BadRequestException('Informe o assunto.');
    const kind = b.kind === 'implementation_request' ? 'implementation_request' : 'support';

    // asUser → a org vem da RLS/current_org_id, não do cliente.
    const t = await this.db.asUser(uid, async (c) => (await c.query(
      `insert into support.tickets (organization_id, subject, description, status, created_by, kind)
       values (public.current_org_id(), $1, $2, 'open', $3, $4) returning id, organization_id`,
      [subject, b.description || null, uid, kind])).rows[0]);
    if (!t?.id) throw new BadRequestException('Não foi possível abrir o chamado.');
    const code = this.code(t.id);

    const who = await this.db.asService(async (c) => (await c.query(
      `select p.email, p.full_name, o.name org from public.profiles p
         left join public.organizations o on o.id = p.organization_id where p.id=$1`, [uid])).rows[0]);

    // Confirmação ao cliente + aviso interno. E-mail nunca derruba o chamado já gravado.
    const tpl = kind === 'implementation_request'
      ? requestReceived({ name: who?.full_name, code, subject })
      : ticketReceived({ name: who?.full_name, code, subject });
    const confirmed = who?.email ? (await this.email.send(who.email, tpl.subject, tpl.html)).ok : false;

    const alert = ticketInternalAlert({ code, org: who?.org || '—', subject, description: b.description, kind, who: who?.email });
    const inbox = await this.crastoInbox();
    const notified = (await Promise.all(inbox.map((to) => this.email.send(to, alert.subject, alert.html))))
      .some((r) => r.ok);

    return { ok: true, number: code, id: t.id, confirmed, notified };
  }

  /** Admin avisa o cliente e move o status do chamado. */
  async notify(uid: string, ticketId: string, template: string) {
    const tpl = template === 'received' ? 'received' : 'resolved';
    const t = await this.db.asService(async (c) => (await c.query(
      `select t.id, t.subject, t.kind, t.created_by, t.status,
              p.email, p.full_name
         from support.tickets t left join public.profiles p on p.id = t.created_by
        where t.id=$1`, [ticketId])).rows[0]);
    if (!t) throw new BadRequestException('Chamado não encontrado.');

    const code = this.code(t.id);
    const msg = tpl === 'resolved'
      ? ticketResolved({ name: t.full_name, code, subject: t.subject })
      : (t.kind === 'implementation_request'
        ? requestReceived({ name: t.full_name, code, subject: t.subject })
        : ticketReceived({ name: t.full_name, code, subject: t.subject }));
    const sent = t.email ? await this.email.send(t.email, msg.subject, msg.html) : { ok: false, error: 'usuário sem e-mail' };

    // Status muda mesmo se o e-mail falhar (o trabalho foi feito) — asUser mantém a RLS.
    const status = tpl === 'resolved' ? 'resolved' : 'in_progress';
    await this.db.asUser(uid, (c) => c.query(`update support.tickets set status=$2, updated_at=now() where id=$1`, [ticketId, status]));

    return { ok: true, status, email: t.email, email_sent: sent.ok, email_error: sent.error };
  }
}
