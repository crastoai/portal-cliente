// Layout único dos e-mails transacionais da Crasto.AI.
// HTML de e-mail é hostil: nada de flex/grid/CSS externo — tabela + estilo inline.
// Paleta alinhada ao Design System (fundo escuro, acento âmbar da marca).

const BG = '#0b0d10', CARD = '#14181d', LINE = '#242a31', TXT = '#e8eaed', MUTED = '#9aa4b2', ACCENT = '#f0b429';

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Casca padrão: cabeçalho Crasto.AI + corpo + rodapé. `body` já vem em HTML. */
export function layout(opts: { title: string; body: string; cta?: { label: string; url: string }; footnote?: string }) {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="border-radius:8px;background:${ACCENT}">
         <a href="${esc(opts.cta.url)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1206;text-decoration:none">${esc(opts.cta.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 4px;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED}">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
       <p style="margin:0;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};word-break:break-all">${esc(opts.cta.url)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BG}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:14px">
        <tr><td style="padding:28px 32px 0">
          <p style="margin:0;font:700 17px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TXT};letter-spacing:-.2px">Crasto<span style="color:${ACCENT}">.AI</span></p>
        </td></tr>
        <tr><td style="padding:20px 32px 32px">
          <h1 style="margin:0 0 14px;font:600 21px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TXT}">${esc(opts.title)}</h1>
          ${opts.body}
          ${cta}
          ${opts.footnote ? `<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${LINE};font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED}">${opts.footnote}</p>` : ''}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font:400 11px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED}">Crasto.AI · mensagem automática, não responda este e-mail.</p>
    </td></tr>
  </table></body></html>`;
}

const P = `margin:0 0 12px;font:400 15px/1.65 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TXT}`;

/** Convite ao WhatsApp CRM para quem AINDA NÃO tem senha: leva à página de definir senha. */
export function crmInviteNewUser(p: { name?: string | null; org: string; url: string; hours: number }) {
  return {
    subject: `Seu acesso ao WhatsApp CRM — ${p.org}`,
    html: layout({
      title: 'Seu acesso ao WhatsApp CRM está pronto',
      body: `<p style="${P}">Olá${p.name ? ' ' + esc(p.name.split(' ')[0]) : ''}, você foi liberado para usar o <strong>WhatsApp CRM</strong> de <strong>${esc(p.org)}</strong>.</p>
             <p style="${P}">Para começar, defina a sua senha de acesso. Ela é pessoal — só você a conhece.</p>`,
      cta: { label: 'Definir minha senha', url: p.url },
      footnote: `Este link vale por ${p.hours}h e só pode ser usado uma vez. Se ele expirar, peça um novo convite ao time da Crasto.AI. Se você não esperava este e-mail, ignore-o: nada será criado sem você definir a senha.`,
    }),
  };
}

/** Quem JÁ tem conta Crasto.AI: não mandamos link de senha — a senha dele continua a mesma. */
export function crmInviteExistingUser(p: { name?: string | null; org: string; url: string }) {
  return {
    subject: `Você agora tem acesso ao WhatsApp CRM — ${p.org}`,
    html: layout({
      title: 'Seu acesso ao WhatsApp CRM foi liberado',
      body: `<p style="${P}">Olá${p.name ? ' ' + esc(p.name.split(' ')[0]) : ''}, você já pode usar o <strong>WhatsApp CRM</strong> de <strong>${esc(p.org)}</strong>.</p>
             <p style="${P}">Use o <strong>mesmo e-mail e senha</strong> que você já usa na Crasto.AI — sua conta é a mesma, não é preciso criar outra.</p>`,
      cta: { label: 'Acessar o WhatsApp CRM', url: p.url },
      footnote: 'Esqueceu a senha? Use a opção "Esqueci minha senha" na tela de entrada.',
    }),
  };
}
