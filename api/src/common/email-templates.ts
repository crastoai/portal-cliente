// Templates transacionais da Crasto.AI. A casca e os tokens vêm do Design System
// oficial (ver email-theme.ts — porte fiel de DesignSystem/emails/). Aqui só o CONTEÚDO.
// Nada de cor/fonte/estrutura inventada: se faltar peça, ela nasce no DS, não aqui.
import { Mail, layout, lede, para, strong, cta, callout, rawLink, esc, color, FONT } from './email-theme';

const first = (name?: string | null) => (name ? ' ' + esc(name.trim().split(/\s+/)[0]) : '');

// ---- acesso (senha nunca viaja: vai um link de uso único) --------------------

/** Convite ao WhatsApp CRM — quem ainda não tem senha define a dela. */
export function crmInviteNewUser(p: { name?: string | null; org: string; url: string; hours: number }): Mail {
  return {
    subject: `Seu acesso ao WhatsApp CRM — ${p.org}`,
    html: layout({
      preview: `Defina sua senha e comece a usar o WhatsApp CRM de ${p.org}.`,
      eyebrow: 'Acesso liberado',
      title: 'Seu acesso ao WhatsApp CRM está pronto',
      reason: `Você recebeu este e-mail porque foi liberado para usar o WhatsApp CRM de ${p.org}.`,
      body:
        lede(`Olá${first(p.name)}, você foi liberado para usar o ${strong('WhatsApp CRM')} de ${strong(esc(p.org))}.`) +
        para('Para começar, defina a sua senha de acesso. Ela é pessoal — só você a conhece.') +
        cta(p.url, 'Definir minha senha') +
        rawLink(p.url) +
        para(`<span style="font-size:13px;color:${color.muted}">Este link vale por ${p.hours}h e só pode ser usado uma vez. Se expirar, peça um novo convite ao time da Crasto.AI. Se você não esperava este e-mail, ignore-o: nada será criado sem você definir a senha.</span>`, 'margin:20px 0 0'),
    }),
  };
}

/** Quem JÁ tem conta Crasto.AI: a senha dele continua a mesma — nada de link. */
export function crmInviteExistingUser(p: { name?: string | null; org: string; url: string }): Mail {
  return {
    subject: `Você agora tem acesso ao WhatsApp CRM — ${p.org}`,
    html: layout({
      preview: `Use sua conta Crasto.AI para entrar no WhatsApp CRM de ${p.org}.`,
      eyebrow: 'Acesso liberado',
      title: 'Seu acesso ao WhatsApp CRM foi liberado',
      reason: `Você recebeu este e-mail porque foi liberado para usar o WhatsApp CRM de ${p.org}.`,
      body:
        lede(`Olá${first(p.name)}, você já pode usar o ${strong('WhatsApp CRM')} de ${strong(esc(p.org))}.`) +
        para(`Use o ${strong('mesmo e-mail e senha')} que você já usa na Crasto.AI — sua conta é a mesma, não é preciso criar outra.`) +
        cta(p.url, 'Acessar o WhatsApp CRM') +
        para(`<span style="font-size:13px;color:${color.muted}">Esqueceu a senha? Use a opção “Esqueci minha senha” na tela de entrada.</span>`, 'margin:20px 0 0'),
    }),
  };
}

/** Convite ao Portal do Cliente (substitui o e-mail legado com senha em texto claro). */
export function portalInvite(p: { name?: string | null; org: string; url: string; hours: number; isNew: boolean }): Mail {
  return {
    subject: p.isNew ? `Seu acesso ao Portal da Crasto.AI — ${p.org}` : `Definir a senha do seu acesso — ${p.org}`,
    html: layout({
      preview: p.isNew ? `Defina sua senha e acesse o Portal do Cliente da Crasto.AI.` : 'Defina uma nova senha para o seu acesso.',
      eyebrow: p.isNew ? 'Acesso liberado' : 'Definir senha',
      title: p.isNew ? 'Seu acesso ao Portal do Cliente está pronto' : 'Defina a sua senha de acesso',
      reason: p.isNew
        ? `Você recebeu este e-mail porque foi liberado para acessar o Portal do Cliente da Crasto.AI (${p.org}).`
        : 'Você recebeu este e-mail porque foi solicitado um link para definir a senha do seu acesso.',
      body:
        lede(`Olá${first(p.name)}, ${p.isNew
          ? `você foi liberado para acessar o ${strong('Portal do Cliente')} da Crasto.AI (${strong(esc(p.org))}), onde ficam as suas soluções, faturas e chamados.`
          : `use o botão abaixo para definir a senha do seu acesso ao Portal da Crasto.AI (${strong(esc(p.org))}).`}`) +
        para('Clique no botão e escolha a sua senha. Ela é pessoal — nem a equipe da Crasto.AI a conhece.') +
        cta(p.url, 'Definir minha senha') +
        rawLink(p.url) +
        para(`<span style="font-size:13px;color:${color.muted}">Este link vale por ${p.hours}h e só pode ser usado uma vez. Se expirar, peça um novo ao time da Crasto.AI.${p.isNew ? ' Se você não esperava este e-mail, ignore-o: nada é criado sem você definir a senha.' : ' Enquanto você não definir a nova senha, a atual continua valendo.'}</span>`, 'margin:20px 0 0'),
    }),
  };
}

/**
 * "Esqueci minha senha" — pedido pela PRÓPRIA pessoa na tela de entrada.
 * A senha atual continua valendo até ela usar o link (recovery não redefine nada).
 */
export function passwordReset(p: { name?: string | null; org: string; url: string; hours: number; isCrm: boolean }): Mail {
  const onde = p.isCrm ? 'WhatsApp CRM' : 'Portal do Cliente';
  return {
    subject: 'Redefinir a sua senha — Crasto.AI',
    html: layout({
      preview: `Link para você criar uma nova senha de acesso ao ${onde}.`,
      eyebrow: 'Redefinir senha',
      title: 'Vamos criar uma nova senha',
      reason: `Você recebeu este e-mail porque foi pedida a redefinição de senha do seu acesso ao ${onde}.`,
      body:
        lede(`Olá${first(p.name)}, recebemos um pedido para redefinir a senha do seu acesso ao ${strong(onde)}.`) +
        para('Clique no botão para escolher uma senha nova. Ela é pessoal — nem a equipe da Crasto.AI a conhece.') +
        cta(p.url, 'Criar nova senha') +
        rawLink(p.url) +
        para(`<span style="font-size:13px;color:${color.muted}">Este link vale por ${p.hours}h e só pode ser usado uma vez. ${strong('Se não foi você quem pediu, ignore este e-mail')} — a sua senha atual continua valendo e nada muda.</span>`, 'margin:20px 0 0'),
    }),
  };
}

// ---- chamados ---------------------------------------------------------------

const ticketBox = (code: string, subject: string) =>
  callout(
    `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${color.muted}">Chamado #${esc(code)}</p>
     <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.5;color:${color.ink};font-weight:600">${esc(subject)}</p>`,
  );

export function ticketReceived(p: { name?: string | null; code: string; subject: string }): Mail {
  return {
    subject: `Recebemos o seu chamado #${p.code}`,
    html: layout({
      preview: `Chamado #${p.code} registrado. Avisamos assim que houver novidade.`,
      eyebrow: 'Suporte',
      title: 'Recebemos o seu chamado',
      reason: 'Você recebeu este e-mail porque abriu um chamado no Portal da Crasto.AI.',
      body:
        lede(`Olá${first(p.name)}, o seu chamado foi registrado e já está com o nosso time.`) +
        ticketBox(p.code, p.subject) +
        para('Avisamos por e-mail assim que houver novidade. Você também acompanha pelo Portal, em Suporte.'),
    }),
  };
}

export function ticketResolved(p: { name?: string | null; code: string; subject: string }): Mail {
  return {
    subject: `Seu chamado #${p.code} foi resolvido`,
    html: layout({
      preview: `O chamado #${p.code} foi concluído pelo nosso time.`,
      eyebrow: 'Suporte',
      title: 'Seu chamado foi resolvido',
      reason: 'Você recebeu este e-mail porque abriu um chamado no Portal da Crasto.AI.',
      body:
        lede(`Olá${first(p.name)}, o seu chamado foi concluído pelo nosso time.`) +
        ticketBox(p.code, p.subject) +
        para('Se ainda não estiver resolvido para você, é só responder pelo Portal que reabrimos.'),
    }),
  };
}

export function requestReceived(p: { name?: string | null; code: string; subject: string }): Mail {
  return {
    subject: `Recebemos a sua solicitação #${p.code}`,
    html: layout({
      preview: `Solicitação #${p.code} recebida pelo time de implantação.`,
      eyebrow: 'Implantação',
      title: 'Recebemos a sua solicitação',
      reason: 'Você recebeu este e-mail porque solicitou uma implantação no Portal da Crasto.AI.',
      body:
        lede(`Olá${first(p.name)}, a sua solicitação chegou ao nosso time de implantação.`) +
        ticketBox(p.code, p.subject) +
        para('Em breve entramos em contato com os próximos passos.'),
    }),
  };
}

/** Aviso INTERNO (Crasto) — o cliente não recebe. */
export function ticketInternalAlert(p: { code: string; org: string; subject: string; description?: string | null; kind: string; who?: string | null; attachments?: string[] }): Mail {
  const tipo = p.kind === 'implementation_request' ? 'Implantação' : 'Suporte';
  const anexos = (p.attachments || []).filter(Boolean);
  return {
    subject: `[${tipo}] #${p.code} — ${p.org}`,
    html: layout({
      preview: `${p.org}: ${p.subject}`,
      eyebrow: `Novo chamado · ${tipo}`,
      title: p.org,
      reason: 'Aviso interno da operação — enviado aos administradores da Crasto.AI.',
      body:
        ticketBox(p.code, p.subject) +
        para(`${strong('Cliente:')} ${esc(p.org)}${p.who ? ` · aberto por ${esc(p.who)}` : ''}`) +
        (p.description ? para(`${strong('Detalhe:')} ${esc(p.description)}`) : '') +
        (anexos.length ? para(`${strong(`Anexos (${anexos.length}):`)} ${anexos.map((n) => esc(n)).join(', ')} — em anexo neste e-mail.`) : ''),
    }),
  };
}

/**
 * Roteamento: a agente passou um lead para uma pessoa.
 *
 * Vai o CONTEXTO, não um "apareceu um lead": quem é, como falar com ele, e as últimas
 * falas. Sem isso a pessoa tem de abrir o CRM para saber do que se trata — e o e-mail
 * vira só um alarme.
 */
export function leadRoteado(p: {
  destino: string; agente: string; lead: string; telefone?: string | null;
  empresa?: string | null; email?: string | null; motivo?: string | null;
  falas: { de: 'lead' | 'agente'; texto: string }[]; url?: string | null;
}): Mail {
  const linha = (rot: string, val?: string | null) =>
    val ? `<p style="margin:0 0 4px;font-family:${FONT};font-size:14px;line-height:1.6;color:${color.body}">
             <span style="color:${color.muted}">${esc(rot)}:</span> ${strong(esc(val))}</p>` : '';
  const conversa = p.falas.length
    ? callout(
        `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${color.muted}">A conversa até aqui</p>` +
        p.falas.map((f) =>
          `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.55;color:${color.body}">
             <span style="color:${color.muted}">${f.de === 'lead' ? '👤 Lead' : '🤖 ' + esc(p.agente)}:</span> ${esc(f.texto)}</p>`).join(''),
      )
    : '';
  return {
    subject: `${p.destino} — ${p.lead} está esperando no WhatsApp`,
    html: layout({
      preview: `${p.lead}${p.empresa ? ` (${p.empresa})` : ''} foi passado para ${p.destino} pela ${p.agente}.`,
      eyebrow: 'Atendimento',
      title: `${p.lead} está esperando`,
      reason: `Você recebeu este e-mail porque está configurado como destino de roteamento ("${esc(p.destino)}") no WhatsApp CRM.`,
      body:
        lede(`A <strong>${esc(p.agente)}</strong> passou este atendimento para <strong>${esc(p.destino)}</strong>${p.motivo ? ` (${esc(p.motivo)})` : ''}. O lead está aguardando resposta.`) +
        callout(
          linha('Quem', p.lead) + linha('WhatsApp', p.telefone) + linha('Empresa', p.empresa) + linha('E-mail', p.email),
        ) +
        conversa +
        (p.url ? cta(p.url, 'Abrir a conversa no CRM') : '') +
        para(`<span style="font-size:13px;color:${color.muted}">Responda pelo CRM para o lead ver a resposta no WhatsApp dele.</span>`),
    }),
  };
}
