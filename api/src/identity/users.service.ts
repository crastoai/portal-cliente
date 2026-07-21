import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { EmailService } from '../common/email.service';
import { IdpService } from '../common/idp.service';
import { AuditService } from '../common/audit.service';
import { portalInvite, passwordReset } from '../common/email-templates';

/**
 * Acesso de pessoas ao Portal do Cliente.
 *
 * SUBSTITUI as Edge Functions `admin-create-user` / `client-invite-user` /
 * `admin-resend-access` (2026-07-14). Duas mudanças de segurança, de propósito:
 *
 *  1) NENHUMA senha é gerada, enviada por e-mail ou mostrada ao admin. O legado criava
 *     uma senha temporária, mandava em texto claro e exibia num toast ("Login: x · senha: y").
 *     Agora vai um link de uso único e a senha nasce no navegador da própria pessoa.
 *  2) "Reenviar acesso" NÃO redefine mais a senha de ninguém. Manda um link de recuperação
 *     (permite definir uma nova); a senha atual continua valendo até ela usar o link.
 *     Redefinir a senha do outro é justamente o que já derrubou acesso aqui.
 *
 * A chave do Resend vive no COFRE (EmailService) — nunca em env/coluna.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: RlsDbService,
    private readonly email: EmailService,
    private readonly idp: IdpService,
    private readonly audit: AuditService,
  ) {}

  private readonly portalWeb = (process.env.PORTAL_WEB_URL || 'https://portal.crasto.ai').replace(/\/$/, '');

  private async orgName(orgId: string): Promise<string> {
    return this.db.asService(async (c) =>
      (await c.query(`select name from public.organizations where id=$1`, [orgId])).rows[0]?.name || 'sua empresa');
  }

  /** Concede acesso ao Portal: identidade + perfil na org + e-mail com link de senha. */
  private async grant(req: any, orgId: string, b: { email?: string; full_name?: string; role?: string }) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('E-mail inválido.');
    const role = b.role === 'client_owner' ? 'client_owner' : 'client_member';

    // Trava anti-vazamento: um mesmo login nunca pertence a duas empresas.
    const existing = await this.idp.lookup(email);
    if (existing) {
      const cur = await this.db.asService(async (c) =>
        (await c.query(`select organization_id, role from public.profiles where id=$1`, [existing.id])).rows[0]);
      if (cur?.role === 'crasto_admin') throw new BadRequestException('Este e-mail é de um administrador da Crasto.AI.');
      if (cur?.organization_id && cur.organization_id !== orgId)
        throw new BadRequestException('Este e-mail já tem acesso ao portal de outro cliente.');
    }

    // Identidade + link (invite se novo; recovery se já existe e ainda não tem senha própria).
    const acc = await this.idp.accessLink(email, `${this.portalWeb}/nova-senha`, b.full_name);

    // Perfil na org (o trigger handle_new_user já criou a linha; aqui damos org e papel).
    await this.db.asService((c) => c.query(
      `insert into public.profiles (id, email, full_name, role, organization_id) values ($1,$2,$3,$4::public.app_role,$5)
       on conflict (id) do update set email=excluded.email,
            full_name=coalesce(nullif(excluded.full_name,''), public.profiles.full_name),
            role=excluded.role, organization_id=excluded.organization_id`,
      [acc.id, email, b.full_name || '', role, orgId]));

    const tpl = portalInvite({ name: b.full_name, org: await this.orgName(orgId), url: acc.url, hours: this.idp.linkHours, isNew: acc.isNew });
    const sent = await this.email.send(email, tpl.subject, tpl.html);
    await this.audit.log(req, 'portal_access_granted', {
      targetType: 'user', targetId: acc.id, org: orgId,
      ctx: { email, papel: role, conta_nova: acc.isNew, email_enviado: sent.ok },
    });
    return { ok: true, email, invited: true, email_sent: sent.ok, email_error: sent.error };
  }

  /** Admin cria o login de um cliente qualquer (tela ClienteDetalhe). */
  async createByAdmin(req: any, b: { email?: string; full_name?: string; organization_id?: string; role?: string }) {
    if (!b.organization_id) throw new BadRequestException('organization_id obrigatório.');
    const exists = await this.db.asService(async (c) =>
      (await c.query(`select 1 from public.organizations where id=$1`, [b.organization_id])).rowCount);
    if (!exists) throw new BadRequestException('Cliente não encontrado.');
    return this.grant(req, b.organization_id, b);
  }

  /** Admin edita nome / e-mail / papel de um usuário do Portal (tela ClienteDetalhe).
   *  E-mail muda no Auth (GoTrue) E no perfil — nunca só num lado (dessincroniza o login). */
  async updateByAdmin(req: any, userId: string, b: { email?: string; full_name?: string; role?: string }) {
    const cur = await this.db.asService(async (c) =>
      (await c.query(`select email, full_name, role, organization_id from public.profiles where id=$1`, [userId])).rows[0]);
    if (!cur) throw new BadRequestException('Usuário não encontrado.');
    if (cur.role === 'crasto_admin') throw new BadRequestException('Não se edita um administrador da Crasto.AI por aqui.');

    const authPatch: { email?: string; full_name?: string } = {};
    const email = b.email != null ? String(b.email).trim().toLowerCase() : undefined;
    if (email && email !== cur.email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('E-mail inválido.');
      const other = await this.idp.lookup(email); // trava anti-vazamento: não roubar login de outro
      if (other && other.id !== userId) throw new BadRequestException('Este e-mail já está em uso.');
      authPatch.email = email;
    }
    const fullName = b.full_name != null ? String(b.full_name).trim() : undefined;
    if (fullName != null && fullName !== (cur.full_name || '')) authPatch.full_name = fullName;
    const role = b.role === 'client_owner' ? 'client_owner' : b.role === 'client_member' ? 'client_member' : undefined;

    // 1) Auth primeiro (pode falhar por e-mail em uso) → só então mexe no perfil.
    if (authPatch.email || authPatch.full_name != null) await this.idp.updateUser(userId, authPatch);

    // 2) Perfil — e-mail (espelho), nome, papel.
    const sets: string[] = []; const vals: any[] = [userId];
    const add = (col: string, v: any, cast = '') => { vals.push(v); sets.push(`${col}=$${vals.length}${cast}`); };
    if (authPatch.email) add('email', authPatch.email);
    if (authPatch.full_name != null) add('full_name', authPatch.full_name);
    if (role && role !== cur.role) add('role', role, '::public.app_role');
    if (sets.length) await this.db.asService((c) => c.query(`update public.profiles set ${sets.join(', ')} where id=$1`, vals));

    await this.audit.log(req, 'portal_access_updated', {
      targetType: 'user', targetId: userId, org: cur.organization_id,
      ctx: { email: authPatch.email, nome: authPatch.full_name, papel: role },
    });
    return { ok: true };
  }

  /** Cliente-dono convida alguém da PRÓPRIA empresa (tela Usuários do cliente). */
  async inviteByOwner(req: any, uid: string, b: { email?: string; full_name?: string; role?: string }) {
    const me = await this.db.asService(async (c) =>
      (await c.query(`select role, organization_id from public.profiles where id=$1`, [uid])).rows[0]);
    if (!me?.organization_id) throw new ForbiddenException('Seu usuário não está ligado a uma empresa.');
    // Só o dono convida. O papel de plataforma nunca sai daqui.
    if (me.role !== 'client_owner' && me.role !== 'crasto_admin')
      throw new ForbiddenException('Só o dono da conta pode convidar usuários.');
    return this.grant(req, me.organization_id, b);
  }

  /**
   * "Esqueci minha senha" (público). Só sai e-mail se a conta existir — mas a RESPOSTA
   * é sempre a mesma: responder "não existe" entregaria quem é cliente da Crasto.AI.
   * `target` escolhe onde a pessoa define a senha (é a mesma conta nos dois).
   *
   * Trava anti-abuso: 1 e-mail por endereço a cada 90s. Sem isso, um endpoint público
   * de envio vira ferramenta de flood na caixa de entrada de terceiros.
   */
  private lastSent = new Map<string, number>();
  async forgot(req: any, rawEmail?: string, target?: string) {
    const email = String(rawEmail || '').trim().toLowerCase();
    const resposta = { ok: true as const }; // idêntica em todos os caminhos
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta;

    const agora = Date.now();
    const ultimo = this.lastSent.get(email) ?? 0;
    if (agora - ultimo < 90_000) return resposta;
    this.lastSent.set(email, agora);
    if (this.lastSent.size > 5000) this.lastSent.clear(); // teto de memória

    const ident = await this.idp.lookup(email);
    if (!ident) return resposta; // conta não existe → nada é enviado

    const isCrm = target === 'crm';
    const base = isCrm
      ? `${(process.env.CRM_WEB_URL || '').replace(/\/$/, '')}/definir-senha`
      : `${this.portalWeb}/nova-senha`;
    const acc = await this.idp.accessLink(email, base);
    const u = await this.db.asService(async (c) => (await c.query(
      `select p.full_name, o.name org from public.profiles p
         left join public.organizations o on o.id = p.organization_id where p.id=$1`, [ident.id])).rows[0]);
    const tpl = passwordReset({ name: u?.full_name, org: u?.org || 'Crasto.AI', url: acc.url, hours: this.idp.linkHours, isCrm });
    const sent = await this.email.send(email, tpl.subject, tpl.html);
    // Ator é a própria pessoa (rota pública, sem JWT) — registramos por e-mail.
    await this.audit.log({ ...req, user: { id: ident.id, email } }, 'password_reset_requested', {
      targetType: 'user', targetId: ident.id, system: isCrm ? 'crm' : 'portal',
      ctx: { email, email_enviado: sent.ok },
    });
    return resposta;
  }

  /**
   * Admin reenvia o acesso. Manda um link para a pessoa DEFINIR a senha — não redefine
   * a atual. Enquanto ela não usar o link, a senha antiga continua funcionando.
   */
  async resend(req: any, userId: string) {
    const u = await this.db.asService(async (c) =>
      (await c.query(`select email, full_name, organization_id, role from public.profiles where id=$1`, [userId])).rows[0]);
    if (!u?.email) throw new BadRequestException('Usuário não encontrado.');
    if (u.role === 'crasto_admin') throw new BadRequestException('Não se reenvia acesso de administrador por aqui.');
    const acc = await this.idp.accessLink(u.email, `${this.portalWeb}/nova-senha`, u.full_name);
    const tpl = portalInvite({
      name: u.full_name, org: u.organization_id ? await this.orgName(u.organization_id) : 'Crasto.AI',
      url: acc.url, hours: this.idp.linkHours, isNew: acc.isNew,
    });
    const sent = await this.email.send(u.email, tpl.subject, tpl.html);
    await this.audit.log(req, 'access_link_resent', {
      targetType: 'user', targetId: userId, org: u.organization_id,
      ctx: { email: u.email, email_enviado: sent.ok },
    });
    return { ok: true, email: u.email, email_sent: sent.ok, email_error: sent.error };
  }
}
