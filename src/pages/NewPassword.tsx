import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { services, errorMessage } from "../services";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import LangSwitcher from "../ui/LangSwitcher";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function NewPassword() {
  const { session } = useAuth();
  const t = useT();
  const nav = useNavigate();
  const forced = (session?.user?.user_metadata as any)?.must_change_password === true;
  // Convite/reset da Crasto.AI: o e-mail traz ?token=… (uso único). O link é do NOSSO domínio
  // (não dependemos da allow-list de redirect do Supabase). Sem token, segue o fluxo normal
  // (usuário já logado querendo trocar senha).
  //
  // Por que capturar o token no MOMENTO DO CLICK EM SALVAR (não em useEffect):
  // o padrão anterior chamava `supabase.auth.verifyOtp` no mount, o SDK criava uma sessão
  // internamente, e depois `updateUser` dependia dessa sessão estar persistida. O SDK v2
  // tem race condition conhecida onde a sessão retornada por verifyOtp em type='recovery'
  // NÃO fica no localStorage antes do próximo tick — e o updateUser cai em "Auth session
  // missing". Foi o que aconteceu com a Fabiana (SR Brasil, 2026-08-04): link válido, token
  // válido, mas erro na hora de salvar. Igualmos ao fluxo do wacrm/DefinirSenha (que sempre
  // funcionou): REST direto no GoTrue com o access_token na mão — zero dependência do state
  // interno do SDK.
  const urlToken = new URL(window.location.href).searchParams.get("token") || "";
  const tokenType = new URL(window.location.href).searchParams.get("type") === "invite" ? "invite" : "recovery";
  const hasToken = !!urlToken;

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 6) { setErr(t("A senha deve ter ao menos 6 caracteres.")); return; }
    if (pw !== pw2) { setErr(t("As senhas não conferem.")); return; }
    setBusy(true); setErr("");
    try {
      if (hasToken) {
        // Fluxo do LINK (convite/recovery). REST direto no GoTrue — não dependemos do SDK.
        // 1) verify: troca o token do e-mail por access_token + refresh_token.
        const v = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
          body: JSON.stringify({ type: tokenType, token_hash: urlToken }),
        });
        const vb: any = await v.json().catch(() => ({}));
        if (!vb?.access_token) {
          throw new Error(t("Este link expirou ou já foi usado. Peça um novo ao time da Crasto.AI."));
        }
        // 2) grava a nova senha usando o access_token direto — o GoTrue aceita.
        const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: "PUT",
          headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + vb.access_token, "Content-Type": "application/json" },
          body: JSON.stringify({ password: pw, data: { must_change_password: false } }),
        });
        const ub: any = await u.json().catch(() => ({}));
        if (!u.ok) {
          throw new Error(ub?.msg || ub?.error_description || ub?.message || t("Não foi possível salvar a senha."));
        }
        // 3) persiste a sessão no SDK pra ela já entrar logada.
        await supabase.auth.setSession({ access_token: vb.access_token, refresh_token: vb.refresh_token });
      } else {
        // Fluxo SEM token — usuário já está logado (ex.: `must_change_password=true`). Usa o SDK.
        await services.identity.auth.updatePassword(pw);
      }
      // Trilha: quem definiu senha, quando, e se foi o primeiro acesso (veio de convite).
      api.post("/api/audit/event", {
        action: "password_set", system: "portal",
        first_access: hasToken && tokenType === "invite",
        via: hasToken ? "link" : "sessao",
      }).catch(() => {});
      // Tira o token da URL antes de navegar (não fica no histórico do navegador).
      if (hasToken) window.history.replaceState({}, "", "/nova-senha");
      setOk(true);
      setTimeout(() => nav("/", { replace: true }), 1400);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <aside className="login-aside crasto-noise">
        <div className="brand-mark">
          <img src="/crasto-lockup-white.png" alt="crasto.ai" style={{ height: 30, display: "block" }} />
        </div>
        <div>
          <h2>{t("O seu Portal de Inteligência Artificial, num só lugar.")}</h2>
          <p>{t("Crie uma nova senha para acessar o portal com segurança.")}</p>
        </div>
        <div className="foot">{t("Portal do Cliente · acesso seguro")}</div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><LangSwitcher /></div>
          <h1>{forced ? t("Defina sua senha") : t("Nova senha")}</h1>
          <p className="sub">{forced ? t("Por segurança, crie uma senha própria para continuar.") : t("Escolha uma nova senha para o seu acesso.")}</p>
          {ok ? (
            <div className="login-note">{t("Senha definida com sucesso ✓ Entrando no portal…")}</div>
          ) : (
            <form className="login-form" onSubmit={submit}>
              {err && <div className="login-err">{err}</div>}
              <div>
                <label>{t("Nova senha")}</label>
                <div className="crasto-field pw-field">
                  <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("mín. 6 caracteres")} required autoComplete="new-password" />
                  <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? t("Ocultar senha") : t("Mostrar senha")} tabIndex={-1}>
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <div>
                <label>{t("Confirmar nova senha")}</label>
                <div className="crasto-field">
                  <input type={showPw ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t("repita a senha")} required autoComplete="new-password" />
                </div>
              </div>
              <button type="submit" className="crasto-btn crasto-btn--primary crasto-btn--md crasto-btn--full" disabled={busy}>
                <span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar nova senha")}</span>
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
