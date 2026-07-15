import { Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from './rls-db.service';

/**
 * Trilha de auditoria — UMA só para o sistema inteiro (Portal + WhatsApp CRM).
 * Mora em `audit.events` no banco do Portal (append-only; `trg_audit_immutable`
 * impede UPDATE/DELETE, inclusive nosso).
 *
 * REGRAS:
 * - O ATOR vem SEMPRE do JWT verificado (`req.user`), nunca do corpo da requisição.
 *   Quem chama só escolhe a AÇÃO e o alvo; dizer "fui fulano" não cola.
 * - Auditar NUNCA derruba a operação auditada: se o log falhar, registramos no
 *   console e seguimos. Perder um log é ruim; perder o convite do cliente é pior.
 * - `system` separa Portal de CRM na mesma trilha (a tela filtra por isso).
 */
@Injectable()
export class AuditService {
  private log_ = new Logger('Audit');

  constructor(private readonly db: RlsDbService) {}

  private ip(req: any): string | null {
    const fwd = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req?.ip || req?.socket?.remoteAddress || null;
  }

  /** Registra um evento. `req` é a requisição (de onde saem ator e IP). */
  async log(
    req: any,
    action: string,
    opts: { targetType?: string; targetId?: string | null; org?: string | null; ctx?: Record<string, unknown>; system?: 'portal' | 'crm' } = {},
  ): Promise<void> {
    const actor = req?.user?.id ?? null;
    const email = req?.user?.email ?? null;
    try {
      await this.db.asService((c) => c.query(
        `select audit.log_as($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [actor, email, action, opts.targetType ?? null, opts.targetId ?? null, opts.org ?? null,
         JSON.stringify(opts.ctx ?? {}), opts.system ?? 'portal', this.ip(req)],
      ));
    } catch (e: any) {
      this.log_.warn(`falhou ao auditar ${action}: ${e.message}`);
    }
  }
}
