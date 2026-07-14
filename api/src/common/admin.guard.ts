import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RlsDbService } from './rls-db.service';

// Deve rodar DEPOIS do JwtOrgGuard. Confirma crasto_admin no contexto do usuário.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly db: RlsDbService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.id) throw new UnauthorizedException('sem usuário');
    const ok = await this.db.asUser(req.user.id, async (c) =>
      (await c.query('select public.is_crasto_admin() as a')).rows[0]?.a === true,
    );
    if (!ok) throw new ForbiddenException('acesso admin (crasto_admin) requerido');
    return true;
  }
}
