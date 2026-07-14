import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { api } from "./api";
import { services } from "../services";

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
  signOut: () => Promise<void>;
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
    // auditoria de login via a Portal API (não fala direto com o banco). Fire-and-forget.
    if (!error) api.post("/api/analytics/rpc", { name: "audit_login" }).catch(() => {});
    return error ? { error: error.message } : {};
  }
  async function signOut() {
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
