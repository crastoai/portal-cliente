import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import LangSwitcher from "../ui/LangSwitcher";

export default function Login() {
  const { signIn } = useAuth();
  const t = useT();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await signIn(email.trim(), pw);
    setBusy(false);
    if (error) setErr(t("E-mail ou senha inválidos. Verifique e tente novamente."));
    else nav("/", { replace: true });
  }

  return (
    <div className="login-wrap">
      <aside className="login-aside crasto-noise">
        <div className="brand-mark">
          <img src="/crasto-wordmark-white.png" alt="Crasto.AI" style={{ height: 30, display: "block" }} />
        </div>
        <div>
          <h2>{t("O seu Portal de Inteligência Artificial, num só lugar.")}</h2>
          <p>{t("Acompanhe seus módulos, resultados e a implantação da sua IA — em tempo real, com total transparência.")}</p>
        </div>
        <div className="foot">{t("Portal do Cliente · acesso seguro")}</div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><LangSwitcher /></div>
          <h1>{t("Entrar")}</h1>
          <p className="sub">{t("Use as credenciais que a Crasto.AI enviou para você.")}</p>
          <form className="login-form" onSubmit={submit}>
            {err && <div className="login-err">{err}</div>}
            <div>
              <label>{t("E-mail")}</label>
              <div className="crasto-field">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("voce@empresa.com")} required autoComplete="username" />
              </div>
            </div>
            <div>
              <label>{t("Senha")}</label>
              <div className="crasto-field pw-field">
                <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
                <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? t("Ocultar senha") : t("Mostrar senha")} tabIndex={-1}>
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <button type="submit" className="crasto-btn crasto-btn--primary crasto-btn--md crasto-btn--full" disabled={busy}>
              <span className="crasto-btn__label">{busy ? t("Entrando…") : t("Entrar")}</span>
            </button>
            <div style={{ textAlign: "center", marginTop: 2 }}><Link to="/redefinir" className="login-link">{t("Esqueci minha senha")}</Link></div>
          </form>
        </div>
      </main>
    </div>
  );
}
