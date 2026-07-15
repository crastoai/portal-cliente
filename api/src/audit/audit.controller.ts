import { Body, Controller, MessageEvent, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { Observable, concatMap, interval, map, startWith } from 'rxjs';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';
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
  constructor(private readonly audit: AuditService, private readonly db: RlsDbService) {}

  /**
   * Trilha AO VIVO (SSE) — a tela atualiza sozinha, sem recarregar.
   *
   * Padrão da casa (igual ao dashboard do CRM): SSE consumido por **fetch-stream com
   * Bearer**, não por EventSource. EventSource não manda header, o que obrigaria o token
   * na URL — e token em URL vaza em log de proxy e histórico. Numa TELA DE AUDITORIA
   * isso seria especialmente irônico.
   *
   * Roda em asUser: quem filtra é a RPC (`admin_audit_log` exige is_crasto_admin) —
   * o stream não é um atalho para ver o que não se pode ver pelo GET.
   */
  @Sse('stream')
  @UseGuards(AdminGuard)
  stream(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string, @Query('org') org?: string): Observable<MessageEvent> {
    const uid = req.user.id;
    // admin_audit_log devolve SETOF: agregamos em JSON (mesmo tratamento do proxy de
    // analytics). Chamar como escalar traria tupla crua, não objeto.
    const ler = () => this.db.asUser(uid, async (c) =>
      (await c.query(
        `select coalesce(json_agg(t), '[]'::json) as e from public.admin_audit_log($1::date,$2::date,$3::uuid) t`,
        [from || null, to || null, org || null])).rows[0]?.e ?? []);
    return interval(5000).pipe(
      startWith(0),
      concatMap(() => ler().catch(() => [])),
      map((eventos) => ({ data: { eventos } }) as MessageEvent),
    );
  }

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
