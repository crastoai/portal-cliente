import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { RlsDbService } from '../common/rls-db.service';
import { EmailService } from '../common/email.service';
import { ticketInternalAlert } from '../common/email-templates';
import { UsersService } from './users.service';

/**
 * Porta de serviço para o SUPORTE AUTÔNOMO do Jorge (subagente técnico interno, no WhatsApp CRM).
 *
 * O Jorge resolve muita coisa sozinho pelo banco do CRM (service-role), mas duas ações moram no
 * Portal e por isso passam por aqui: (1) REENVIAR ACESSO ao usuário (a identidade/IdP e o e-mail
 * vivem no Portal — SSOT) e (2) ESCALAR pro John por e-mail. Autenticação = mesmo segredo de
 * serviço (`PORTAL_SERVICE_KEY`) que o CRM já usa, comparado com `timingSafeEqual`.
 */
@Controller('internal/support')
export class SupportInternalController {
  constructor(private readonly users: UsersService, private readonly db: RlsDbService, private readonly email: EmailService) {}

  private autorizar(chave?: string) {
    const esperado = process.env.PORTAL_SERVICE_KEY || '';
    if (!esperado) throw new ForbiddenException('PORTAL_SERVICE_KEY ausente na API.');
    const a = Buffer.from(String(chave || '')); const b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('chave de serviço inválida');
  }

  /**
   * IDENTIFICAÇÃO AUTORITATIVA de cliente/funcionário (fonte de verdade = base do Portal).
   * Cobre quem o CRM não enxerga: usuários só-Portal, contatos (crm.people), sócios e os
   * arrays de e-mail/telefone da própria empresa. Busca por e-mail, telefone (sufixo) ou nome.
   */
  @Post('lookup')
  async lookup(@Headers('x-service-key') chave: string, @Body() b: any) {
    this.autorizar(chave);
    const email = String(b?.email || '').trim();
    const suf = String(b?.phone || '').replace(/\D/g, '').slice(-9); // sufixo do telefone (ignora DDI/DDD)
    const nome = String(b?.name || '').trim();
    if (!email && suf.length < 8 && nome.length < 3) return { ok: true, achados: [] };
    const fone = suf.length >= 8 ? suf : '';

    const rows = await this.db.asService(async (c) => (await c.query(
      `with hits as (
         select p.organization_id org, p.full_name nome, p.email, p.role::text papel, 'usuario' tipo, 'email' por
           from public.profiles p where $1<>'' and lower(p.email)=lower($1)
         union all
         select pe.organization_id, pe.full_name, pe.email, pe.funcao, 'contato', 'email'
           from crm.people pe where $1<>'' and (lower(pe.email)=lower($1) or exists(select 1 from unnest(pe.emails) e where lower(e)=lower($1)))
         union all
         select cp.organization_id, cp.full_name, cp.email, cp.role_title, 'socio', 'email'
           from crm.company_partners cp where $1<>'' and lower(cp.email)=lower($1)
         union all
         select o.id, o.name, null, 'empresa', 'empresa', 'email'
           from public.organizations o where $1<>'' and exists(select 1 from unnest(o.emails) e where lower(e)=lower($1))
         union all
         select ph.organization_id, pe.full_name, pe.email, pe.funcao, 'contato', 'telefone'
           from crm.phones ph left join crm.people pe on pe.id=ph.person_id
          where $2<>'' and regexp_replace(coalesce(ph.country_code,'')||ph.number,'\\D','','g') like '%'||$2
         union all
         select cp.organization_id, cp.full_name, cp.email, cp.role_title, 'socio', 'telefone'
           from crm.company_partners cp where $2<>'' and regexp_replace(coalesce(cp.mobile_phone,''),'\\D','','g') like '%'||$2
         union all
         select o.id, o.name, null, 'empresa', 'empresa', 'telefone'
           from public.organizations o where $2<>'' and exists(select 1 from unnest(o.phones) e where regexp_replace(e,'\\D','','g') like '%'||$2)
         union all
         select p.organization_id, p.full_name, p.email, p.role::text, 'usuario', 'nome'
           from public.profiles p where $3<>'' and p.full_name ilike '%'||$3||'%'
         union all
         select pe.organization_id, pe.full_name, pe.email, pe.funcao, 'contato', 'nome'
           from crm.people pe where $3<>'' and pe.full_name ilike '%'||$3||'%'
         union all
         select cp.organization_id, cp.full_name, cp.email, cp.role_title, 'socio', 'nome'
           from crm.company_partners cp where $3<>'' and cp.full_name ilike '%'||$3||'%'
         union all
         select o.id, o.name, null, 'empresa', 'empresa', 'nome'
           from public.organizations o where $3<>'' and (o.name ilike '%'||$3||'%' or o.owner_name ilike '%'||$3||'%')
       )
       select distinct h.org, h.nome, h.email, h.papel, h.tipo, h.por,
              o.name org_nome, o.status org_status, o.stage, o.plan
         from hits h left join public.organizations o on o.id=h.org
        limit 40`, [email, fone, nome])).rows);

    const achados = rows.map((r: any) => ({ org_id: r.org, empresa: r.org_nome, status: r.org_status, stage: r.stage, plan: r.plan, tipo: r.tipo, nome: r.nome, email: r.email, papel: r.papel, por: r.por }));
    return { ok: true, achados };
  }

  /** Reenvia o link de acesso (define/nova senha) para o e-mail. Reaproveita o fluxo `forgot`. */
  @Post('resend-access')
  async resendAccess(@Headers('x-service-key') chave: string, @Body() b: any) {
    this.autorizar(chave);
    const email = String(b?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: 'email_invalido' };
    // `forgot` é privacy-preserving: envia só se a conta existir e sempre devolve ok. Ator = interno.
    await this.users.forgot({ ip: 'internal:jorge', headers: {} }, email).catch(() => {});
    return { ok: true };
  }

  /** Escala um caso para o John (e demais crasto_admin) por e-mail, com o contexto da conversa. */
  @Post('escalate')
  async escalate(@Headers('x-service-key') chave: string, @Body() b: any) {
    this.autorizar(chave);
    const motivo = String(b?.motivo || '').trim() || 'Escalonamento de suporte';
    const resumo = String(b?.resumo || '').trim();
    const falas: any[] = Array.isArray(b?.falas) ? b.falas.slice(0, 8) : [];

    // Destinatários: override por env (John), senão a caixa dos crasto_admin (o John é um deles).
    let para = String(process.env.SUPPORT_ESCALATION_EMAILS || '').split(',').map((s) => s.trim()).filter((s) => s.includes('@'));
    if (!para.length) {
      para = await this.db.asService(async (c) =>
        (await c.query(`select email from public.profiles where role='crasto_admin' and coalesce(email,'')<>''`)).rows.map((r: any) => r.email));
    }
    if (!para.length) return { ok: false, erro: 'sem_destinatario' };

    const empresa = b?.org_id
      ? await this.db.asService(async (c) => (await c.query(`select name from public.organizations where id=$1`, [b.org_id])).rows[0]?.name)
      : null;
    const descricao = [
      resumo,
      falas.length ? '\n\nÚltimas mensagens:\n' + falas.map((m: any) => `• ${m.de || '?'}: ${String(m.texto || '').slice(0, 300)}`).join('\n') : '',
      b?.url ? `\n\nAbrir a conversa: ${b.url}` : '',
    ].join('');
    const mail = ticketInternalAlert({ code: 'SUPORTE', org: empresa || (b?.org_id ? String(b.org_id) : '—'), subject: motivo, description: descricao, kind: 'escalation', who: 'Jorge (suporte automático)' });

    const r = await Promise.all(para.map(async (to) => ({ to, ...(await this.email.send(to, `[Jorge → John] ${mail.subject}`, mail.html)) })));
    return { ok: r.some((x) => x.ok), enviados: r.filter((x) => x.ok).length, total: r.length };
  }

  /**
   * ALERTA PROATIVO de QUEDA DE CANAL. O watchdog do CRM (channel-health-monitor) detecta quando um
   * número WhatsApp cai (open→desconectado) e chama aqui para AVISAR O TIME por e-mail na hora — em
   * vez de ficar dias mudo sem ninguém saber (caso SR Brasil). Mesmos destinatários do escalate.
   */
  @Post('channel-down')
  async channelDown(@Headers('x-service-key') chave: string, @Body() b: any) {
    this.autorizar(chave);
    const agente = String(b?.agente || '').trim() || '?';
    const cliente = String(b?.cliente || '').trim() || '—';
    const motivo = String(b?.motivo || '').trim() || 'desconectado';
    let para = String(process.env.SUPPORT_ESCALATION_EMAILS || '').split(',').map((s) => s.trim()).filter((s) => s.includes('@'));
    if (!para.length) {
      para = await this.db.asService(async (c) =>
        (await c.query(`select email from public.profiles where role='crasto_admin' and coalesce(email,'')<>''`)).rows.map((r: any) => r.email));
    }
    if (!para.length) return { ok: false, erro: 'sem_destinatario' };
    const descricao = `O canal WhatsApp do agente "${agente}" (cliente: ${cliente}) CAIU — o CRM parou de enviar e receber por ele.`
      + `\n\nMotivo detectado: ${motivo}`
      + `\n\nAção: reconectar o número (gerar novo QR) ou verificar a instância no Console. Quanto antes, menos mensagens de clientes ficam sem resposta.`;
    const mail = ticketInternalAlert({ code: 'CANAL', org: cliente, subject: `Canal WhatsApp caiu — ${agente}`, description: descricao, kind: 'escalation', who: 'Watchdog de canais (CRM)' });
    const r = await Promise.all(para.map(async (to) => ({ to, ...(await this.email.send(to, `[Alerta] ${mail.subject}`, mail.html)) })));
    return { ok: r.some((x) => x.ok), enviados: r.filter((x) => x.ok).length, total: r.length };
  }
}
