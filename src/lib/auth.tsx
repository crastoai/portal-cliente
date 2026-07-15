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
};

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
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

  async function loadProfile(uid: string) {
    try {
      const p = await services.identity.profiles.getById(uid);
      setProfile((p as Profile) ?? null);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s) await loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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
    await supabase.auth.signOut();
  }
  async function refreshProfile() {
    const uid = session?.user?.id;
    if (uid) await loadProfile(uid);
  }

  return (
    <Ctx.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}
