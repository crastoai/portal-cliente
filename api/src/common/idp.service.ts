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
  async token(email: string, type: 'invite' | 'recovery' | 'magiclink', data?: Record<string, unknown>): Promise<{ token: string; userId?: string }> {
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
   * IMPERSONAÇÃO (auditoria — "Acessar como"). Devolve uma SESSÃO válida do usuário SEM senha:
   * cria um magiclink de uso único (admin/generate_link) e o CONSOME aqui no servidor
   * (`POST /verify` com o `token_hash`) — o token some no backend, nunca chega ao navegador.
   * NÃO redefine a senha e NÃO derruba as sessões existentes da pessoa (o GoTrue permite várias).
   * Quem chama (controller) é responsável por checar crasto_admin e AUDITAR o acesso.
   */
  async mintSession(email: string): Promise<{ access_token: string; refresh_token: string; expires_at?: number }> {
    if (!this.svcKey) throw new BadRequestException('PORTAL_SERVICE_KEY ausente na API.');
    const { token } = await this.token(email, 'magiclink');
    const r = await fetch(`${this.gotrue}/verify`, {
      method: 'POST',
      headers: { apikey: this.svcKey, Authorization: 'Bearer ' + this.svcKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: token }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.access_token) {
      this.log.warn(`verify magiclink ${r.status}: ${j?.msg || j?.message || ''}`);
      throw new BadRequestException(j?.msg || j?.message || `Falha ao gerar a sessão de acesso (${r.status}).`);
    }
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at };
  }

  /**
   * Garante a identidade e devolve o link para a pessoa DEFINIR a senha dela.
   * - não existe  → invite (cria a identidade, já com o nome no metadata)
   * - existe      → recovery (não mexe na senha atual)
   * `base` é a URL da página que recebe o token (Portal: /nova-senha; CRM: /definir-senha).
   */
  /**
   * Atualiza a IDENTIDADE (nome e/ou e-mail de login) no GoTrue — via admin API. O e-mail
   * é confirmado direto (email_confirm) porque é ato de admin/provisionamento, não
   * auto-serviço. NÃO toca na senha. GoTrue recusa e-mail já usado por outra conta.
   */
  async updateUser(id: string, patch: { email?: string; full_name?: string }): Promise<void> {
    if (!this.svcKey) throw new BadRequestException('PORTAL_SERVICE_KEY ausente na API.');
    const body: any = {};
    if (patch.email) { body.email = patch.email; body.email_confirm = true; }
    if (patch.full_name != null) body.user_metadata = { full_name: patch.full_name };
    if (!Object.keys(body).length) return;
    const r = await fetch(`${this.gotrue}/admin/users/${id}`, {
      method: 'PUT',
      headers: { apikey: this.svcKey, Authorization: 'Bearer ' + this.svcKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      this.log.warn(`admin update user ${r.status}: ${j?.msg || j?.message || ''}`);
      throw new BadRequestException(j?.msg || j?.message || `Falha ao atualizar a identidade (${r.status}). O e-mail pode já estar em uso.`);
    }
  }

  /**
   * Define uma SENHA diretamente para o usuário (ato de admin/dono) via GoTrue admin — NÃO envia
   * e-mail. Usado no reset manual e na criação com senha (a pessoa recebe a senha por outro canal).
   *
   * CONFIRMA o e-mail junto (`email_confirm: true`): é um ato de admin/provisionamento, igual ao
   * updateUser. Sem isso o GoTrue recusa o login de e-mail não confirmado com "credenciais
   * inválidas" — mesmo com a senha certa (bug histórico: senha definida, mas login negado).
   */
  async setPassword(id: string, password: string): Promise<void> {
    if (!this.svcKey) throw new BadRequestException('PORTAL_SERVICE_KEY ausente na API.');
    const r = await fetch(`${this.gotrue}/admin/users/${id}`, {
      method: 'PUT',
      headers: { apikey: this.svcKey, Authorization: 'Bearer ' + this.svcKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, email_confirm: true }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      this.log.warn(`admin set password ${id} ${r.status}: ${j?.msg || j?.message || ''}`);
      throw new BadRequestException(j?.msg || j?.message || `Falha ao redefinir a senha (${r.status}).`);
    }
  }

  async deleteUser(id: string): Promise<void> {
    if (!this.svcKey) throw new BadRequestException('PORTAL_SERVICE_KEY ausente na API.');
    const r = await fetch(`${this.gotrue}/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: this.svcKey, Authorization: 'Bearer ' + this.svcKey },
    });
    if (!r.ok && r.status !== 404) {
      const j: any = await r.json().catch(() => ({}));
      this.log.warn(`admin delete user ${r.status}: ${j?.msg || j?.message || ''}`);
      throw new BadRequestException(j?.msg || j?.message || `Falha ao excluir a identidade (${r.status}).`);
    }
  }

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
