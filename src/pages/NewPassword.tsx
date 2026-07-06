import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { services, errorMessage } from "../services";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import LangSwitcher from "../ui/LangSwitcher";

export default function NewPassword() {
  const { session } = useAuth();
  const t = useT();
  const nav = useNavigate();
  const forced = (session?.user?.user_metadata as any)?.must_change_password === true;
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
      await services.identity.auth.updatePassword(pw);
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
          <img src="/crasto-wordmark-white.png" alt="Crasto.AI" style={{ height: 30, display: "block" }} />
        </div>
        <div>
          <h2>{t("O seu hub de Inteligência Artificial, num só lugar.")}</h2>
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
