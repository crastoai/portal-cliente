import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RlsDbService } from './rls-db.service';

// Portão do MÓDULO Financeiro (vendável, multitenant). Substitui o AdminGuard nas
// rotas do módulo: em vez de exigir crasto_admin, exige que a ORG do usuário tenha o
// módulo Financeiro ATIVO (has_finance_module) E que o papel possa ver financeiro
// (pode_ver_financeiro — dono/admin, ou membro com a tela liberada). A Crasto passa
// sempre (is_crasto_admin curto-circuita has_finance_module). Roda DEPOIS do JwtOrgGuard.
// O ISOLAMENTO real do dado é no banco (RPCs escopam por owner_org_id = fin_scope_org()).
@Injectable()
export class FinanceAccessGuard implements CanActivate {
  constructor(private readonly db: RlsDbService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.id) throw new UnauthorizedException('sem usuário');
    const ok = await this.db.asUser(req.user.id, async (c) =>
      (await c.query('select public.has_finance_module() and public.pode_ver_financeiro() as a')).rows[0]?.a === true,
    );
    if (!ok) throw new ForbiddenException('acesso ao módulo Financeiro requerido');
    return true;
  }
}
