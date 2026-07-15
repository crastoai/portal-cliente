import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { EmailService } from '../common/email.service';
import { crmInviteNewUser, crmInviteExistingUser } from '../common/email-templates';

// Acesso do cliente ao WhatsApp CRM.
//
// ARQUITETURA (por que é assim):
// - IDENTIDADE (quem é a pessoa + senha) vive SÓ aqui, no Auth do Portal. O CRM usa
//   este Supabase como IdP (JWKS), então CRM e Portal são a MESMA conta e a MESMA senha.
//   Consequência: nunca criamos "usuário do CRM" separado — criamos identidade no Portal
//   e concedemos acesso no CRM.
// - AUTORIZAÇÃO no CRM (de qual cliente a pessoa é) vive no banco do CRM (public.profiles).
//   Quem manda nisso é a API do CRM; falamos com ela por HTTP repassando o Bearer do admin
//   (mesmo IdP → o AdminGuard de lá revalida). NUNCA escrevemos no banco do CRM daqui.
// - O convite é NOSSO (Resend), não o e-mail do Supabase: geramos o token com o
//   admin/generate_link e montamos o link para uma página do próprio CRM. Assim o
//   e-mail tem a cara da Crasto.AI e não dependemos da allow-list de redirect do GoTrue.
@Injectable()
export class CrmAccessService {
  private log = new Logger('CrmAccess');
  private readonly crmApi = process.env.CRM_API_URL || '';
  private readonly crmWeb = process.env.CRM_WEB_URL || '';
  private readonly gotrue = (process.env.SUPABASE_URL || '') + '/auth/v1';
  private readonly svcKey = process.env.PORTAL_SERVICE_KEY || '';
  /** Validade do link de convite — espelha o GoTrue (MAILER_OTP_EXP padrão = 24h). */
  private readonly linkHours = 24;

  constructor(private readonly db: RlsDbService, private readonly email: EmailService) {}

  // ---- infra ---------------------------------------------------------------

  /** Chama a API do CRM repassando o Bearer do admin. Nunca manda nossa service key pra lá. */
  private async crm(path: string, auth: string, init: RequestInit = {}): Promise<any> {
    if (!this.crmApi) throw new BadRequestException('CRM_API_URL não configurada na API do Portal.');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(this.crmApi + path, {
        ...init,
        signal: ctrl.signal,
        headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new BadRequestException(j?.message || j?.error || `CRM respondeu ${r.status}`);
      if (j?.error) throw new BadRequestException(j.error);
      return j;
    } catch (e: any) {
      if (e?.status) throw e;
      this.log.warn(`CRM ${path}: ${e.message}`);
      throw new BadRequestException(e.name === 'AbortError' ? 'CRM não respondeu (timeout).' : `CRM indisponível: ${e.message}`);
    } finally { clearTimeout(t); }
  }

  /** O módulo do WhatsApp CRM está ATIVO para esta org? É o que destrava a aba de acesso. */
  private async activeModule(orgId: string) {
    return this.db.asService(async (c) => (await c.query(
      `select cm.id, cm.crm_agent_id, m.name
         from delivery.client_modules cm join catalog.vdi_modules m on m.id = cm.vdi_module_id
        where cm.organization_id = $1 and m.crm_solution and cm.status = 'active'
        order by cm.created_at limit 1`, [orgId])).rows[0] || null);
  }

  private async requireModule(orgId: string) {
    const mod = await this.activeModule(orgId);
    if (!mod) throw new ForbiddenException('O módulo do WhatsApp CRM não está ativo para este cliente.');
    return mod;
  }

  private async orgName(orgId: string): Promise<string> {
    return this.db.asService(async (c) =>
      (await c.query(`select name from public.organizations where id=$1`, [orgId])).rows[0]?.name || 'sua empresa');
  }

  // ---- leitura -------------------------------------------------------------

  /** Estado da aba: módulo ativo, agentes do CRM, agente vinculado e usuários com acesso. */
  async overview(orgId: string, auth: string) {
    const mod = await this.activeModule(orgId);
    if (!mod) return { enabled: false, module: null, agents: [], users: [], agent_id: null, crm_url: this.crmWeb };
    const [detail, users] = await Promise.all([
      this.crm(`/admin/client/${orgId}`, auth).catch((e) => ({ agents: [], _error: e.message })),
      this.crm(`/admin/client/${orgId}/users`, auth).catch(() => ({ users: [] })),
    ]);
    return {
      enabled: true,
      module: { id: mod.id, name: mod.name },
      agent_id: mod.crm_agent_id,
      agents: detail.agents || [],
      users: users.users || [],
      crm_url: this.crmWeb,
      crm_error: detail._error ?? null,
    };
  }

  /** Vincula o agente do CRM que atende este módulo. Valida que o agente é DESTA org. */
  async linkAgent(orgId: string, auth: string, agentId: string | null) {
    const mod = await this.requireModule(orgId);
    if (agentId) {
      const detail = await this.crm(`/admin/client/${orgId}`, auth);
      if (!(detail.agents || []).some((a: any) => a.id === agentId))
        throw new BadRequestException('Este agente não pertence a este cliente.');
    }
    await this.db.asService((c) => c.query(`update delivery.client_modules set crm_agent_id=$2, updated_at=now() where id=$1`, [mod.id, agentId]));
    return { ok: true, agent_id: agentId };
  }

  // ---- identidade ----------------------------------------------------------

  /** Identidade no IdP: existe? já tem senha? (a senha é a mesma do Portal — conta única) */
  private async identity(email: string): Promise<{ id: string; hasPassword: boolean } | null> {
    return this.db.asService(async (c) => {
      const u = (await c.query(
        `select id, coalesce(encrypted_password,'') <> '' as has_password from auth.users where lower(email)=lower($1) limit 1`,
        [email])).rows[0];
      return u ? { id: u.id, hasPassword: u.has_password } : null;
    });
  }

  /**
   * Gera o token de convite/recuperação no GoTrue e devolve a URL da página do CRM.
   * Usamos `hashed_token` + a nossa própria página (verifyOtp) em vez do action_link:
   * o link é do domínio do CRM e não depende da allow-list de redirect do Supabase.
   */
  private async passwordLink(email: string, type: 'invite' | 'recovery'): Promise<{ url: string; userId?: string }> {
    if (!this.svcKey) throw new BadRequestException('PORTAL_SERVICE_KEY ausente na API — não é possível gerar o convite.');
    const r = await fetch(`${this.gotrue}/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: this.svcKey, Authorization: 'Bearer ' + this.svcKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, email }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new BadRequestException(j?.msg || j?.message || `Falha ao gerar o link (${r.status})`);
    const token = j.hashed_token || j.properties?.hashed_token;
    if (!token) throw new BadRequestException('GoTrue não devolveu o token do convite.');
    const userId = j.id || j.user?.id;
    return { url: `${this.crmWeb}/definir-senha?token=${encodeURIComponent(token)}&type=${type}`, userId };
  }

  // ---- convite / revogação -------------------------------------------------

  /**
   * Concede acesso ao CRM e avisa a pessoa. Ordem importa:
   * 1) identidade no Portal → 2) acesso no CRM → 3) e-mail.
   * Se o e-mail falhar o acesso continua válido (o admin reenvia) — nunca o contrário.
   */
  async invite(orgId: string, auth: string, b: { email?: string; full_name?: string; role?: string }) {
    await this.requireModule(orgId);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('E-mail inválido.');
    const role = b.role === 'client_owner' ? 'client_owner' : 'client_member';

    // 1) identidade (conta única Crasto.AI). Sem senha ainda → convite; com senha → só aviso.
    let ident = await this.identity(email);
    let link: string | null = null;
    if (!ident) {
      const gen = await this.passwordLink(email, 'invite'); // cria o usuário no Auth
      link = gen.url;
      ident = (await this.identity(email)) || (gen.userId ? { id: gen.userId, hasPassword: false } : null);
      if (!ident) throw new BadRequestException('Não foi possível criar a identidade deste usuário.');
    } else if (!ident.hasPassword) {
      link = (await this.passwordLink(email, 'recovery')).url;
    }

    // 2) acesso no CRM (fonte da verdade da autorização de lá)
    const { user } = await this.crm(`/admin/client/${orgId}/users`, auth, {
      method: 'POST',
      body: JSON.stringify({ id: ident.id, email, full_name: b.full_name || null, role }),
    });

    // 3) aviso
    const sent = await this.notify(email, b.full_name || user?.full_name, await this.orgName(orgId), link);
    return { user, email_sent: sent.ok, email_error: sent.error, password_link_sent: !!link };
  }

  /** Reenvia o convite (link novo — o anterior morre). Não mexe no acesso já concedido. */
  async resend(orgId: string, auth: string, userId: string) {
    await this.requireModule(orgId);
    const { users } = await this.crm(`/admin/client/${orgId}/users`, auth);
    const u = (users || []).find((x: any) => x.id === userId);
    if (!u) throw new BadRequestException('Usuário não tem acesso ao CRM deste cliente.');
    const ident = await this.identity(u.email);
    const link = ident && !ident.hasPassword ? (await this.passwordLink(u.email, 'recovery')).url : null;
    const sent = await this.notify(u.email, u.full_name, await this.orgName(orgId), link);
    if (!sent.ok) throw new BadRequestException(sent.error || 'Falha ao enviar o e-mail.');
    return { ok: true, password_link_sent: !!link };
  }

  private notify(email: string, name: string | null | undefined, org: string, link: string | null) {
    const tpl = link
      ? crmInviteNewUser({ name, org, url: link, hours: this.linkHours })
      : crmInviteExistingUser({ name, org, url: this.crmWeb });
    return this.email.send(email, tpl.subject, tpl.html);
  }

  /** Tira o acesso ao CRM. A conta no Portal continua — só some o CRM para essa pessoa. */
  async revoke(orgId: string, auth: string, userId: string) {
    await this.requireModule(orgId);
    return this.crm(`/admin/client/${orgId}/users/${userId}`, auth, { method: 'DELETE' });
  }
}
