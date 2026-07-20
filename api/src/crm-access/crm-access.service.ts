import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { EmailService } from '../common/email.service';
import { IdpService } from '../common/idp.service';
import { AuditService } from '../common/audit.service';
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
  constructor(private readonly db: RlsDbService, private readonly email: EmailService, private readonly idp: IdpService, private readonly audit: AuditService) {}

  // ---- infra ---------------------------------------------------------------

  /** Chama a API do CRM repassando o Bearer do admin. Nunca manda nossa service key pra lá. */
  private async crm(path: string, auth: string, init: RequestInit = {}): Promise<any> {
    if (!this.crmApi) throw new BadRequestException('CRM_API_URL não configurada na API do Portal.');
    // A API do CRM tem prefixo global /api (main.ts setGlobalPrefix).
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`${this.crmApi.replace(/\/$/, '')}/api${path}`, {
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

  // ---- entrada do admin no CRM --------------------------------------------

  /**
   * "Entrar no CRM" (admin do Portal → CRM do cliente). O problema: o CRM é OUTRA origem,
   * e a sessão vive no localStorage POR ORIGEM — o admin está logado no Portal, não no CRM,
   * então cai na tela de login. A ponte não pode levar o access_token na URL (decisão de
   * 15/07: bearer vaza em log/histórico/Referer).
   *
   * Solução: geramos para o PRÓPRIO admin (e-mail do JWT) um `magiclink` — o mesmo primitivo
   * já usado no convite. O que atravessa a URL é o `hashed_token`: OTP de USO ÚNICO e curto,
   * NÃO um bearer. O CRM troca por sessão no /auth/v1/verify (igual ao /definir-senha) e
   * estabelece a sessão do admin na origem dele. O escopo de impersonação (org/agente) vai
   * à parte na URL — não é segredo, e quem autoriza continua sendo o is_admin do JWT.
   * Respeita "nunca senha de terceiro": é a conta do próprio admin e magiclink não toca senha.
   */
  async enterLink(req: any): Promise<{ token: string; type: 'magiclink' }> {
    const email = String(req?.user?.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Sessão sem e-mail — não é possível gerar a entrada no CRM.');
    const { token } = await this.idp.token(email, 'magiclink');
    await this.audit.log(req, 'crm_enter_link', { targetType: 'user', targetId: req?.user?.id, system: 'crm', ctx: { email } });
    return { token, type: 'magiclink' };
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
  async linkAgent(req: any, orgId: string, auth: string, agentId: string | null) {
    const mod = await this.requireModule(orgId);
    if (agentId) {
      const detail = await this.crm(`/admin/client/${orgId}`, auth);
      if (!(detail.agents || []).some((a: any) => a.id === agentId))
        throw new BadRequestException('Este agente não pertence a este cliente.');
    }
    await this.db.asService((c) => c.query(`update delivery.client_modules set crm_agent_id=$2, updated_at=now() where id=$1`, [mod.id, agentId]));
    await this.audit.log(req, 'crm_agent_linked', { targetType: 'agent', targetId: agentId, org: orgId, system: 'crm', ctx: { modulo: mod.name } });
    return { ok: true, agent_id: agentId };
  }

  // ---- convite / revogação -------------------------------------------------

  /**
   * Concede acesso ao CRM e avisa a pessoa. Ordem importa:
   * 1) identidade no Portal → 2) acesso no CRM → 3) e-mail.
   * Se o e-mail falhar o acesso continua válido (o admin reenvia) — nunca o contrário.
   */
  async invite(req: any, orgId: string, auth: string, b: { email?: string; full_name?: string; role?: string }) {
    await this.requireModule(orgId);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('E-mail inválido.');
    const role = b.role === 'client_owner' ? 'client_owner' : 'client_member';

    // 1) identidade (conta única Crasto.AI). Sem senha ainda → link p/ ela definir;
    //    com senha → NENHUM link (não se manda troca de senha a quem não pediu), só o aviso.
    const found = await this.idp.lookup(email);
    let link: string | null = null;
    let uid: string;
    if (found?.hasPassword) {
      uid = found.id;
    } else {
      const acc = await this.idp.accessLink(email, `${this.crmWeb}/definir-senha`, b.full_name);
      uid = acc.id; link = acc.url;
    }

    // 2) acesso no CRM (fonte da verdade da autorização de lá)
    const { user } = await this.crm(`/admin/client/${orgId}/users`, auth, {
      method: 'POST',
      body: JSON.stringify({ id: uid, email, full_name: b.full_name || null, role }),
    });

    // 3) aviso
    const sent = await this.notify(email, b.full_name || user?.full_name, await this.orgName(orgId), link);
    await this.audit.log(req, 'crm_access_granted', {
      targetType: 'user', targetId: uid, org: orgId, system: 'crm',
      ctx: { email, papel: role, link_de_senha: !!link, email_enviado: sent.ok },
    });
    return { user, email_sent: sent.ok, email_error: sent.error, password_link_sent: !!link };
  }

  /**
   * Edita NOME, E-MAIL e/ou PAPEL (Dono ↔ Membro) de um usuário do CRM. Nome e e-mail de
   * LOGIN vivem no Auth do Portal (identidade única) — atualizamos lá; depois espelhamos a
   * cópia + o papel no CRM (profiles) pela mesma porta de grant (idempotente). Trocar o
   * e-mail muda o LOGIN; se a pessoa ainda não definiu senha, reenvie o acesso ao novo e-mail.
   */
  async updateUser(req: any, orgId: string, auth: string, userId: string, b: { full_name?: string; email?: string; role?: string }) {
    await this.requireModule(orgId);
    const { users } = await this.crm(`/admin/client/${orgId}/users`, auth);
    const u = (users || []).find((x: any) => x.id === userId);
    if (!u) throw new BadRequestException('Usuário não tem acesso ao CRM deste cliente.');
    const novoNome = b.full_name != null ? String(b.full_name).trim() : undefined;
    const novoEmail = b.email != null ? String(b.email).trim().toLowerCase() : undefined;
    // Papel: só os de cliente (nunca crasto_admin por esta porta).
    const novoPapel = b.role === 'client_owner' || b.role === 'client_member' ? b.role : undefined;
    if (novoEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novoEmail)) throw new BadRequestException('E-mail inválido.');
    const emailMudou = !!novoEmail && novoEmail !== String(u.email || '').toLowerCase();
    const papelMudou = !!novoPapel && novoPapel !== u.role;
    if (!novoNome && !emailMudou && !papelMudou) return { ok: true, email_changed: false };

    // 1) identidade no Portal (nome sempre que veio; e-mail só se mudou de fato)
    await this.idp.updateUser(userId, { full_name: novoNome, email: emailMudou ? novoEmail : undefined });
    // 2) espelha no CRM (profiles): nome, e-mail e PAPEL (o grant upsert cuida do papel).
    await this.crm(`/admin/client/${orgId}/users`, auth, {
      method: 'POST',
      body: JSON.stringify({ id: userId, email: emailMudou ? novoEmail : u.email, full_name: novoNome ?? u.full_name, role: novoPapel ?? u.role }),
    });
    await this.audit.log(req, 'crm_access_updated', {
      targetType: 'user', targetId: userId, org: orgId, system: 'crm',
      ctx: { nome: novoNome ?? null, email_novo: emailMudou ? novoEmail : null, papel_novo: papelMudou ? novoPapel : null },
    });
    return { ok: true, email_changed: emailMudou };
  }

  /** Reenvia o convite (link novo — o anterior morre). Não mexe no acesso já concedido. */
  async resend(req: any, orgId: string, auth: string, userId: string) {
    await this.requireModule(orgId);
    const { users } = await this.crm(`/admin/client/${orgId}/users`, auth);
    const u = (users || []).find((x: any) => x.id === userId);
    if (!u) throw new BadRequestException('Usuário não tem acesso ao CRM deste cliente.');
    // Reenviar = novo link para a pessoa definir a senha. NUNCA redefine a senha atual
    // (recovery só permite definir uma nova; a antiga vale até ela usar o link).
    const link = (await this.idp.accessLink(u.email, `${this.crmWeb}/definir-senha`, u.full_name)).url;
    const sent = await this.notify(u.email, u.full_name, await this.orgName(orgId), link);
    if (!sent.ok) throw new BadRequestException(sent.error || 'Falha ao enviar o e-mail.');
    await this.audit.log(req, 'crm_access_resent', { targetType: 'user', targetId: userId, org: orgId, system: 'crm', ctx: { email: u.email } });
    return { ok: true, password_link_sent: !!link };
  }

  private notify(email: string, name: string | null | undefined, org: string, link: string | null) {
    const tpl = link
      ? crmInviteNewUser({ name, org, url: link, hours: this.idp.linkHours })
      : crmInviteExistingUser({ name, org, url: `${this.crmWeb}/?para=${encodeURIComponent(email)}` });
    return this.email.send(email, tpl.subject, tpl.html);
  }

  /** Tira o acesso ao CRM. A conta no Portal continua — só some o CRM para essa pessoa. */
  getCrmScreens(orgId: string, id: string, auth: string) {
    return this.crm(`/admin/client/${orgId}/users/${id}/crm-screens`, auth).catch((e: any) => ({ error: e?.message || 'falha ao ler as telas do CRM' }));
  }
  setCrmScreens(orgId: string, id: string, auth: string, screens: string[]) {
    return this.crm(`/admin/client/${orgId}/users/${id}/crm-screens`, auth, { method: 'POST', body: JSON.stringify({ screens }) });
  }

  async revoke(req: any, orgId: string, auth: string, userId: string) {
    await this.requireModule(orgId);
    const r = await this.crm(`/admin/client/${orgId}/users/${userId}`, auth, { method: 'DELETE' });
    await this.audit.log(req, 'crm_access_revoked', { targetType: 'user', targetId: userId, org: orgId, system: 'crm' });
    return r;
  }
}
