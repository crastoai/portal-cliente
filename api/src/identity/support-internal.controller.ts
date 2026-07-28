import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { RlsDbService } from '../common/rls-db.service';
import { EmailService } from '../common/email.service';
import { ticketInternalAlert } from '../common/email-templates';
import { UsersService } from './users.service';

/**
 * Porta de serviço para o SUPORTE AUTÔNOMO do Jorge (subagente técnico interno, no WhatsApp CRM).
 *
 * O Jorge resolve muita coisa sozinho pelo banco do CRM (service-role), mas duas ações moram no
 * Portal e por isso passam por aqui: (1) REENVIAR ACESSO ao usuário (a identidade/IdP e o e-mail
 * vivem no Portal — SSOT) e (2) ESCALAR pro John por e-mail. Autenticação = mesmo segredo de
 * serviço (`PORTAL_SERVICE_KEY`) que o CRM já usa, comparado com `timingSafeEqual`.
 */
@Controller('internal/support')
export class SupportInternalController {
  constructor(private readonly users: UsersService, private readonly db: RlsDbService, private readonly email: EmailService) {}

  private autorizar(chave?: string) {
    const esperado = process.env.PORTAL_SERVICE_KEY || '';
    if (!esperado) throw new ForbiddenException('PORTAL_SERVICE_KEY ausente na API.');
    const a = Buffer.from(String(chave || '')); const b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('chave de serviço inválida');
  }

  /** Reenvia o link de acesso (define/nova senha) para o e-mail. Reaproveita o fluxo `forgot`. */
  @Post('resend-access')
  async resendAccess(@Headers('x-service-key') chave: string, @Body() b: any) {
    this.autorizar(chave);
    const email = String(b?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: 'email_invalido' };
    // `forgot` é privacy-preserving: envia só se a conta existir e sempre devolve ok. Ator = interno.
    await this.users.forgot({ ip: 'internal:jorge', headers: {} }, email).catch(() => {});
    return { ok: true };
  }

  /** Escala um caso para o John (e demais crasto_admin) por e-mail, com o contexto da conversa. */
  @Post('escalate')
  async escalate(@Headers('x-service-key') chave: string, @Body() b: any) {
    this.autorizar(chave);
    const motivo = String(b?.motivo || '').trim() || 'Escalonamento de suporte';
    const resumo = String(b?.resumo || '').trim();
    const falas: any[] = Array.isArray(b?.falas) ? b.falas.slice(0, 8) : [];

    // Destinatários: override por env (John), senão a caixa dos crasto_admin (o John é um deles).
    let para = String(process.env.SUPPORT_ESCALATION_EMAILS || '').split(',').map((s) => s.trim()).filter((s) => s.includes('@'));
    if (!para.length) {
      para = await this.db.asService(async (c) =>
        (await c.query(`select email from public.profiles where role='crasto_admin' and coalesce(email,'')<>''`)).rows.map((r: any) => r.email));
    }
    if (!para.length) return { ok: false, erro: 'sem_destinatario' };

    const empresa = b?.org_id
      ? await this.db.asService(async (c) => (await c.query(`select name from public.organizations where id=$1`, [b.org_id])).rows[0]?.name)
      : null;
    const descricao = [
      resumo,
      falas.length ? '\n\nÚltimas mensagens:\n' + falas.map((m: any) => `• ${m.de || '?'}: ${String(m.texto || '').slice(0, 300)}`).join('\n') : '',
      b?.url ? `\n\nAbrir a conversa: ${b.url}` : '',
    ].join('');
    const mail = ticketInternalAlert({ code: 'SUPORTE', org: empresa || (b?.org_id ? String(b.org_id) : '—'), subject: motivo, description: descricao, kind: 'escalation', who: 'Jorge (suporte automático)' });

    const r = await Promise.all(para.map(async (to) => ({ to, ...(await this.email.send(to, `[Jorge → John] ${mail.subject}`, mail.html)) })));
    return { ok: r.some((x) => x.ok), enviados: r.filter((x) => x.ok).length, total: r.length };
  }
}
