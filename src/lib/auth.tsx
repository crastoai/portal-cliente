import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { api } from "./api";
import { services } from "../services";
import { marcarAtividade } from "./idle";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  organization_id: string | null;
  avatar_url?: string | null;
  access_level?: string | null;
  active?: boolean;
};

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // 2FA: mfaPending = a sessão está em aal1 mas o usuário TEM 2FA (precisa do código). mfaChecked =
  // já consultamos o AAL após esta sessão (evita piscar o app antes da tela de código).
  mfaPending: boolean;
  mfaChecked: boolean;
  recheckMfa: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: (motivo?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaChecked, setMfaChecked] = useState(false);

  // 2FA: consulta o nível de garantia (AAL). nextLevel='aal2' + currentLevel='aal1' = o usuário tem
  // 2FA e ainda não passou o código → segura o app na tela de código. Sem 2FA → aal1/aal1 → segue.
  async function checkMfa(hasSession: boolean) {
    if (!hasSession) { setMfaPending(false); setMfaChecked(true); return; }
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setMfaPending(!!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2");
    } catch { setMfaPending(false); }
    finally { setMfaChecked(true); }
  }
  async function recheckMfa() {
    const { data } = await supabase.auth.getSession();
    await checkMfa(!!data.session);
  }

  async function loadProfile(uid: string) {
    try {
      const p = await services.identity.profiles.getById(uid);
      // Colaborador SUSPENSO (active=false): perde o acesso ao Portal no boot, sem excluir a
      // conta. É a "trava no login" do toggle Ativo/Inativo — o dono/admin pode reativar depois.
      if (p && (p as Profile).active === false) {
        try { sessionStorage.setItem("conta_suspensa", "1"); } catch { /* ignora */ }
        setProfile(null);
        await signOut("suspenso");
        return;
      }
      setProfile((p as Profile) ?? null);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      await checkMfa(!!data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s) await loadProfile(s.user.id);
      else setProfile(null);
      await checkMfa(!!s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // PRESENÇA EM TEMPO REAL: enquanto logado (em qualquer tela do Portal, inclusive com o CRM
  // embarcado por cima), a pessoa "se anuncia" online via Supabase Realtime Presence. A tela de
  // Permissões (admin) lê este canal e mostra quem está online AGORA, sem recarregar.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    // Presença é um EXTRA — nunca pode derrubar o app. Tudo blindado.
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase.channel("presence:online", { config: { presence: { key: uid } } });
      ch.subscribe((status) => { if (status === "SUBSCRIBED") { try { ch!.track({ user_id: uid, at: Date.now() }); } catch { /* ignora */ } } });
    } catch { /* realtime indisponível */ }
    return () => { try { if (ch) supabase.removeChannel(ch); } catch { /* ignora */ } };
  }, [session?.user?.id]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) marcarAtividade(); // entrar É interagir — zera o relógio da inatividade
    // Auditoria: o login acontece entre o navegador e o Auth — o servidor não o vê,
    // então quem reporta é a tela. Fire-and-forget: auditar não pode travar a entrada.
    if (!error) api.post("/api/audit/event", { action: "login", system: "portal" }).catch(() => {});
    return error ? { error: error.message } : {};
  }
  /** `motivo` distingue sair no botão de cair por inatividade — a trilha precisa saber. */
  async function signOut(motivo?: string) {
    // Auditar ANTES: depois do signOut não há mais token para autenticar o registro.
    await api.post("/api/audit/event", { action: "logout", system: "portal", via: motivo || "botao" }).catch(() => {});
    // Carimba o fim da sessão do relógio de ponto (logout_reason='manual') ANTES de descartar o token.
    await api.post("/api/delivery/session-close", {}).catch(() => {});
    await supabase.auth.signOut();
  }
  async function refreshProfile() {
    const uid = session?.user?.id;
    if (uid) await loadProfile(uid);
  }

  return (
    <Ctx.Provider value={{ session, profile, loading, mfaPending, mfaChecked, recheckMfa, signIn, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}
