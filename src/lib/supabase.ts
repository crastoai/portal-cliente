import { createClient } from "@supabase/supabase-js";

// Auth explícita e robusta: persiste a sessão e RENOVA o access token sozinho
// (o access token expira em 1h; o refresh token mantém a sessão viva sem re-login).
// São os defaults do SDK, mas deixamos explícito para não depender de mudança de default.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Reforço: ao voltar o foco na aba ou reconectar a rede, checa/renova a sessão.
// Cobre o caso "deixei a aba parada > 1h" — evita cair para a tela de login.
if (typeof window !== "undefined") {
  const ensure = () => { supabase.auth.getSession().catch(() => {}); };
  window.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ensure(); });
  window.addEventListener("online", ensure);
}
