import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from './rls-db.service';

/**
 * IdP (Supabase Auth do Portal) — a ÚNICA fonte de identidade da Crasto.AI.
 * Portal e WhatsApp CRM são a mesma conta e a mesma senha (o CRM usa este Auth via JWKS).
 *
 * REGRA DE OURO: nós NUNCA criamos, transportamos, exibimos ou redefinimos senha de
 * ninguém. Senha só nasce no navegador da própria pessoa, por um link de uso único.
 * (O fluxo antigo gerava senha temporária, mandava por e-mail em texto claro e mostrava
 * ao admin — trocado em 2026-07-14.)
 */
@Injectable()
export class IdpService {
  private log = new Logger('Idp');
  private readonly gotrue = (process.env.SUPABASE_URL || '') + '/auth/v1';
  private readonly svcKey = process.env.PORTAL_SERVICE_KEY || '';
  /** Validade do link (espelha o MAILER_OTP_EXP padrão do GoTrue). */
  readonly linkHours = 24;

  constructor(private readonly db: RlsDbService) {}

  /**
   * Existe identidade para este e-mail? Ela já tem senha?
   * Via RPC security-definer: `service_role` NÃO lê auth.users (lá mora o hash) e
   * de propósito não tem esse grant. A função devolve só estes dois fatos.
   */
  async lookup(email: string): Promise<{ id: string; hasPassword: boolean } | null> {
    return this.db.asService(async (c) => {
      const u = (await c.query(`select * from public.crm_identity_lookup($1)`, [email])).rows[0];
      return u ? { id: u.id, hasPassword: u.has_password } : null;
    });
  }

  /**
   * Gera o token de convite (cria a identidade) ou de recuperação (já existe) no GoTrue.
   * Devolve o `hashed_token` — quem chama monta a URL da SUA página de definir senha.
   * Não usamos o action_link/redirect do Supabase: assim o link é do nosso domínio e não
   * dependemos da allow-list de redirect do GoTrue.
   *
   * `recovery` NÃO redefine a senha: só permite que a pessoa defina uma nova. A senha
   * atual continua valendo até ela usar o link.
   */
  async token(email: string, type: 'invite' | 'recovery', data?: Record<string, unknown>): Promise<{ token: string; userId?: string }> {
    if (!this.svcKey) throw new BadRequestException('PORTAL_SERVICE_KEY ausente na API — não é possível gerar o convite.');
    const r = await fetch(`${this.gotrue}/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: this.svcKey, Authorization: 'Bearer ' + this.svcKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, email, ...(data ? { data } : {}) }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      this.log.warn(`generate_link ${type} ${r.status}: ${j?.msg || j?.message || ''}`);
      throw new BadRequestException(j?.msg || j?.message || `Falha ao gerar o link de acesso (${r.status})`);
    }
    const token = j.hashed_token || j.properties?.hashed_token;
    if (!token) throw new BadRequestException('GoTrue não devolveu o token do convite.');
    return { token, userId: j.id || j.user?.id };
  }

  /**
   * Garante a identidade e devolve o link para a pessoa DEFINIR a senha dela.
   * - não existe  → invite (cria a identidade, já com o nome no metadata)
   * - existe      → recovery (não mexe na senha atual)
   * `base` é a URL da página que recebe o token (Portal: /nova-senha; CRM: /definir-senha).
   */
  async accessLink(email: string, base: string, fullName?: string | null): Promise<{ id: string; url: string; isNew: boolean }> {
    const found = await this.lookup(email);
    const type = found ? 'recovery' : 'invite';
    const gen = await this.token(email, type, found ? undefined : { full_name: fullName || '' });
    const id = found?.id || gen.userId || (await this.lookup(email))?.id;
    if (!id) throw new BadRequestException('Não foi possível criar a identidade deste usuário.');
    const sep = base.includes('?') ? '&' : '?';
    return { id, url: `${base}${sep}token=${encodeURIComponent(gen.token)}&type=${type}`, isNew: !found };
  }
}
