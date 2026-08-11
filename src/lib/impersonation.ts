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

  await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
  window.location.assign("/app");
}

/** Encerra a impersonação: restaura a sessão do admin e volta ao console de permissões. */
export async function stopImpersonation(): Promise<void> {
  const st = impersonationState();
  localStorage.removeItem(KEY);
  if (st?.admin?.refresh_token) {
    // O access_token do admin pode ter expirado durante a auditoria; o refresh_token renova.
    try { await supabase.auth.setSession({ access_token: st.admin.access_token, refresh_token: st.admin.refresh_token }); }
    catch { /* se falhar, o boot cai no login — sessão do admin é recuperável por login */ }
  }
  window.location.assign("/admin/console/permissoes");
}
