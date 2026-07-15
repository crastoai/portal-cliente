import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AuditService } from '../common/audit.service';

/**
 * Eventos reportados pelo NAVEGADOR (Portal e WhatsApp CRM).
 *
 * Por que o cliente reporta em vez do servidor observar: login e definição de senha
 * acontecem entre o navegador e o Supabase Auth (GoTrue) — não passam pela nossa API,
 * então não há como vê-los do lado de cá. (O `auth.audit_log_entries` do GoTrue está
 * vazio neste projeto.) O JWT já foi emitido, então o ator é confiável.
 *
 * Trava: só estas ações entram por aqui, e o ATOR vem do JWT verificado — o corpo não
 * escolhe quem foi. O pior que um cliente mal-intencionado faz é registrar o próprio
 * login duas vezes.
 */
const REPORTAVEIS = new Set(['login', 'logout', 'password_set', 'first_access']);

@Controller('audit')
@UseGuards(JwtOrgGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Post('event')
  async event(@Req() req: any, @Body() b: any) {
    const action = String(b?.action || '');
    if (!REPORTAVEIS.has(action)) return { ok: false, error: 'ação não reportável' };
    const system = b?.system === 'crm' ? 'crm' : 'portal';
    await this.audit.log(req, action, {
      targetType: 'session',
      targetId: req.user?.id ?? null,
      system,
      // contexto livre, mas só o que é útil e não-sensível (nunca senha/token)
      ctx: {
        ...(b?.first_access ? { primeiro_acesso: true } : {}),
        ...(b?.via ? { via: String(b.via).slice(0, 40) } : {}),
        ua: String(req.headers['user-agent'] || '').slice(0, 160),
      },
    });
    return { ok: true };
  }
}
