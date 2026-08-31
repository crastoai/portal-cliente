// "Acessar como" (impersonação para AUDITORIA). O admin (crasto_admin) assume a sessão de um
// usuário SEM saber a senha dele — senha é hash irreversível, não existe "copiar senha". O
// backend cunha os tokens do alvo (magiclink de uso único, consumido no servidor) e devolve a
// sessão; aqui guardamos a sessão do ADMIN, aplicamos a do ALVO e recarregamos como ele. Um
// clique em "Sair" (banner) restaura o admin. Início é registrado na trilha de auditoria.
import { supabase } from "./supabase";
import { api } from "./api";

const KEY = "crasto_impersonation";

export type ImpersonationState = {
  admin: { access_token: string; refresh_token: string; name?: string | null; email?: string | null };
  target: { id: string; name: string; email: string; org?: string | null };
  startedAt: number;
};

type ImpersonateResp = {
  ok: boolean;
  access_token: string;
  refresh_token: string;
  target: { id: string; name: string; email: string; org?: string | null };
};

/** Estado atual (ou null). Vive no localStorage p/ o banner e o "Sair" sobreviverem ao reload. */
export function impersonationState(): ImpersonationState | null {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as ImpersonationState) : null; }
  catch { return null; }
}
export function isImpersonating(): boolean { return !!impersonationState(); }

/**
 * Inicia a impersonação. A chamada ao backend usa o token do ADMIN (AdminGuard) — por isso é
 * feita ANTES de trocar a sessão. Guarda a sessão do admin, aplica a do alvo e recarrega.
 */
export async function startImpersonation(target: { id: string; name?: string | null; email?: string | null }): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const adminS = data.session;
  if (!adminS) throw new Error("Sessão do administrador não encontrada — faça login novamente.");

  const r = await api.post<ImpersonateResp>(`/api/identity/users/${target.id}/impersonate`);
  if (!r?.access_token || !r?.refresh_token) throw new Error("Não foi possível gerar a sessão de acesso.");

  const state: ImpersonationState = {
    admin: {
      access_token: adminS.access_token,
      refresh_token: adminS.refresh_token,
      name: (adminS.user?.user_metadata as any)?.full_name ?? null,
      email: adminS.user?.email ?? null,
    },
    target: r.target,
    startedAt: Date.now(),
  };
  localStorage.setItem(KEY, JSON.stringify(state));
  limparEscopoCrm(); // resquício de /admin/crm venceria o JWT novo e prenderia o CRM na org errada

  await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
  window.location.assign("/app");
}

/**
 * Descarta o estado de impersonação SEM restaurar o admin — usado no LOGOUT. Um logout é FULL:
 * sai do usuário atual E joga fora a sessão do admin guardada aqui, senão o banner de auditoria
 * ("acessando como") sobreviveria ao logout (a faixa lê o localStorage, não o estado de auth).
 */
export function clearImpersonation(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage indisponível */ }
  limparEscopoCrm();
}

/**
 * O WhatsApp CRM mora na MESMA origem do Portal, então divide o localStorage com ele. A tela
 * /admin/crm grava ali o escopo que o CRM deve abrir (`wacrm.active_org` = interno da Crasto.AI,
 * `wacrm.impersonate` = ver um cliente). Essas chaves sobreviviam a sair/deslogar e PRENDIAM o CRM
 * embarcado no escopo antigo — sintoma: entrar como cliente e ainda ver o WhatsApp da Crasto.AI.
 * Quem troca de identidade tem de zerar o escopo antigo, senão o resquício vence o JWT novo.
 */
export function limparEscopoCrm(): void {
  try {
    localStorage.removeItem("wacrm.active_org");
    localStorage.removeItem("wacrm.impersonate");
  } catch { /* storage indisponível */ }
}

/** Encerra a impersonação: restaura a sessão do admin e volta ao console de permissões. */
export async function stopImpersonation(): Promise<void> {
  const st = impersonationState();
  localStorage.removeItem(KEY);
  limparEscopoCrm();
  if (st?.admin?.refresh_token) {
    // O access_token do admin pode ter expirado durante a auditoria; o refresh_token renova.
    try { await supabase.auth.setSession({ access_token: st.admin.access_token, refresh_token: st.admin.refresh_token }); }
    catch { /* se falhar, o boot cai no login — sessão do admin é recuperável por login */ }
  }
  window.location.assign("/admin/console/permissoes");
}
