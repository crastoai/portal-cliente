import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifica o JWT do usuário via JWKS pública do Supabase Auth do Portal (ES256/RS256).
 * - IDP_JWKS_URL (opcional) sobrescreve; default = SUPABASE_URL do Portal.
 * - IDP_ISSUER (opcional) valida o claim iss.
 * Sem segredo compartilhado. Tenant vem do banco (current_org_id), nunca de header.
 */
@Injectable()
export class JwtOrgGuard implements CanActivate {
  private jwksUrl =
    process.env.IDP_JWKS_URL ||
    `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  private jwks = createRemoteJWKSet(new URL(this.jwksUrl));

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('sem token');
    try {
      const opts = process.env.IDP_ISSUER ? { issuer: process.env.IDP_ISSUER } : {};
      const { payload } = await jwtVerify(token, this.jwks, opts);
      req.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('token inválido');
    }
  }
}
