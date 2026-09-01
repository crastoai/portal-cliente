import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { Observable, from, throwError } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { RlsDbService } from './rls-db.service';

// ENFORCEMENT do break de 30 min no PORTAL (espelha o presence.interceptor do wacrm).
//
// A cada request autenticado (throttle 60s/usuário): se a sessão ATIVA do Portal
// (delivery.user_sessions, medida por last_active_at = atividade real do heartbeat) ficou > 30 MIN
// sem atividade, ela é fechada (logout_reason='idle_timeout'), os refresh tokens são revogados no
// GoTrue (scope global, usando o próprio access token da request → derruba mesmo com navegador
// adulterado) e a request é rejeitada (401). O aviso de 30s aparece antes (idle guard do front).
//
// GLOBAL (APP_INTERCEPTOR): roda também em rotas públicas — por isso é NO-OP quando não há req.user
// (interceptors rodam DEPOIS dos guards, então em rota guardada req.user já está setado).
// FAIL-OPEN: erro de DB nunca tranca o usuário (o idle guard do front é a 1ª linha).
// Quem GERENCIA a sessão (abrir/estender) é o heartbeat (/api/delivery/heartbeat), não este.
@Injectable()
export class SessionEnforcementInterceptor implements NestInterceptor {
  private static lastCheck = new Map<string, number>();

  constructor(private readonly db: RlsDbService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const uid = req?.user?.id;
    if (!uid) return next.handle();
    const now = Date.now();
    const prev = SessionEnforcementInterceptor.lastCheck.get(uid) || 0;
    if (now - prev <= 60_000) return next.handle(); // fast path: checado há < 60s
    return from(this.check(uid, req)).pipe(
      mergeMap((allowed) => (allowed ? next.handle() : throwError(() => new UnauthorizedException('idle_timeout')))),
    );
  }

  // false = DERRUBADO (idle > 30min): sessão fechada + tokens revogados. true = segue.
  private async check(uid: string, req: any): Promise<boolean> {
    let drop = false;
    try {
      await this.db.asService(async (c) => {
        const r = (await c.query(
          `select id, (now() - last_active_at) > interval '12 hours' as idle
             from delivery.user_sessions
            where user_id = $1 and logout_at is null
            order by started_at desc limit 1`,
          [uid],
        )).rows[0];
        if (r && r.idle) {
          await c.query(
            `update delivery.user_sessions set logout_at = last_active_at, logout_reason = 'idle_timeout' where id = $1`,
            [r.id],
          );
          drop = true;
          return;
        }
        SessionEnforcementInterceptor.lastCheck.set(uid, Date.now());
      });
    } catch {
      return true; // fail-open
    }
    if (drop) {
      await this.revokeTokens(req).catch(() => {});
      return false;
    }
    return true;
  }

  // Revoga os refresh tokens do usuário no GoTrue (scope global) com o próprio access token da request.
  private async revokeTokens(req: any): Promise<void> {
    const base = process.env.SUPABASE_URL, key = process.env.PORTAL_SERVICE_KEY;
    const authz: string = req?.headers?.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!base || !key || !token) return;
    await fetch(`${base}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
  }
}
