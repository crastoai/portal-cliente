/* ============================================================
   Crasto.AI · Design System — tokens e casca de e-mail.
   ------------------------------------------------------------
   PORTE FIEL de `DesignSystem/emails/theme.ts` + `components/Layout.tsx`
   (a peça oficial). Aqui é HTML string porque a Portal API é NestJS e o DS é
   React Email — os VALORES e a ANATOMIA são os mesmos, não uma releitura:
   lockup (monograma + wordmark) → card com hero navy glassy → corpo branco → rodapé.

   Regras da marca que este arquivo existe para respeitar:
   - Trava em CLARO (`color-scheme: light only`). Nada de fundo escuro.
   - Paleta: navy + branco/cinza. Coral SÓ para destrutivo. ZERO dourado/neon.
   - Todo degradê vem PAREADO com background-color sólido: Outlook mostra o sólido,
     Apple Mail/Gmail mostram o brilho ("liquid glass" simulado com segurança).
   ============================================================ */

// Assets: o DS aponta pro Vercel dele, mas aqueles caminhos estão 404 e o nome dos
// arquivos difere. O Portal serve as MESMAS logos do DS no nosso domínio (verificado 200).
const ASSETS = (process.env.PORTAL_WEB_URL || 'https://portal.crasto.ai').replace(/\/$/, '');

export const color = {
  pageBg: '#EDF0F4',
  card: '#FFFFFF',
  cardAlt: '#F7F9FB',
  navy: '#010E26',
  navyDeep: '#000714',
  navyDarker: '#00030A',
  navyLift: '#6E9CE8',
  ink: '#010E26',
  body: '#344054',
  muted: '#667085',
  faint: '#98A2B3',
  onNavy: '#FFFFFF',
  onNavySoft: 'rgba(255,255,255,0.70)',
  line: '#E6E9EF',
  lineSoft: '#EFF1F5',
  glassEdge: 'rgba(255,255,255,0.16)',
  coral: '#B85C5C',
  coralBg: '#FBF3F3',
  coralLine: '#EBD3D3',
  white: '#FFFFFF',
} as const;

export const FONT =
  "'Geist','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function esc(s: unknown) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- peças (espelham emails/components/ui.tsx) ------------------------------

export const lede = (html: string) =>
  `<p style="margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:1.6;color:${color.body}">${html}</p>`;

export const para = (html: string, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.66;color:${color.body};${extra}">${html}</p>`;

export const strong = (html: string) => `<strong style="color:${color.ink};font-weight:600">${html}</strong>`;

/** CTA primária · navy glossy com fallback sólido (o Outlook come o degradê). */
export const cta = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px"><tr><td
    style="background-color:${color.navy};background-image:linear-gradient(180deg, ${color.navyLift} 0%, ${color.navy} 58%);border-radius:999px;border:1px solid ${color.navyDeep}">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:500;letter-spacing:-0.01em;color:${color.onNavy};text-decoration:none">${esc(label)}</a>
  </td></tr></table>`;

/** Painel frosted (detalhes/resumo). tone 'coral' só para urgência real. */
export const callout = (html: string, tone: 'default' | 'coral' = 'default') => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr><td
    style="background-color:${tone === 'coral' ? color.coralBg : color.cardAlt};background-image:linear-gradient(180deg, ${tone === 'coral' ? color.coralBg : color.white} 0%, ${tone === 'coral' ? color.coralBg : '#F2F5F9'} 100%);border:1px solid ${tone === 'coral' ? color.coralLine : color.line};border-top:1px solid ${tone === 'coral' ? color.coralLine : '#FFFFFF'};border-radius:12px;padding:20px 22px">${html}</td></tr></table>`;

export const divider = () => `<hr style="border:none;border-top:1px solid ${color.line};margin:26px 0" />`;

/** Link "cole no navegador" — o botão pode não funcionar em alguns clientes. */
export const rawLink = (url: string) => `
  ${para(`<span style="font-size:13px;color:${color.muted}">Se o botão não funcionar, copie e cole este endereço no navegador:</span>`, 'margin:14px 0 4px')}
  <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;line-height:1.6;word-break:break-all"><a href="${esc(url)}" style="color:${color.navy};text-decoration:underline">${esc(url)}</a></p>`;

// ---- casca (espelha emails/components/Layout.tsx) ---------------------------

export type Mail = { subject: string; html: string };

/**
 * Casca oficial. `reason` = por que a pessoa recebeu (transparência no rodapé).
 * Nota: os e-mails do DS são de marketing e trazem "Gerenciar preferências ·
 * Descadastrar". Os nossos são TRANSACIONAIS (senha, chamado) — ninguém se
 * descadastra de um e-mail de senha —, então o rodapé traz só a transparência.
 */
export function layout(p: { preview: string; eyebrow: string; title: string; body: string; reason: string }) {
  return `<!doctype html>
<html lang="pt-BR" dir="ltr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:${color.pageBg};font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(p.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.pageBg}"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;padding:0 16px">

    <!-- marca · lockup (letterhead discreto).
         O Layout do DS põe monograma + wordmark lado a lado porque o wordmark DELE é
         só o texto. O nosso asset (crasto-wordmark-navy.png) JÁ é o lockup completo
         — usar os dois duplicaria o símbolo. Tamanhos seguem a proporção REAL do
         arquivo (2678x456 → 5.87); as medidas do DS (168x14) esmagariam a logo. -->
    <tr><td style="padding:24px 4px 14px">
      <img src="${ASSETS}/crasto-wordmark-navy.png" width="164" height="28" alt="Crasto.AI" style="border:0;display:block" />
    </td></tr>

    <!-- card · hero navy glassy + corpo branco -->
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.card};border:1px solid ${color.line};border-radius:16px;overflow:hidden">
        <tr><td style="background-color:${color.navy};background-image:radial-gradient(130% 130% at 100% 0%, rgba(255,255,255,0.12), rgba(255,255,255,0) 55%), linear-gradient(140deg, ${color.navy} 0%, ${color.navyDeep} 70%, ${color.navyDarker} 100%);border-top:1px solid ${color.glassEdge};border-radius:16px 16px 0 0;padding:32px 36px 28px">
          <p style="margin:0 0 11px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${color.onNavySoft}">${esc(p.eyebrow)}</p>
          <h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.24;font-weight:600;letter-spacing:-0.021em;color:${color.onNavy}">${esc(p.title)}</h1>
        </td></tr>
        <tr><td style="background-color:${color.card};padding:30px 36px 34px">${p.body}</td></tr>
      </table>
    </td></tr>

    <!-- rodapé · ícone + transparência -->
    <tr><td style="padding:22px 6px 36px">
      <img src="${ASSETS}/crasto-monogram-navy.png" width="20" height="22" alt="Crasto.AI" style="border:0;display:block;margin-bottom:12px" />
      <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:1.6;color:${color.muted}">${esc(p.reason)}</p>
      <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.6;color:${color.faint}">Mensagem automática — não responda este e-mail.</p>
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${color.faint}">© Crasto.AI. Todos os direitos reservados.</p>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}
