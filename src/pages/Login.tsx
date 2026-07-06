import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import logoWhite from "../assets/logo-branca.svg";

export default function Login() {
  const { signIn } = useAuth();
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
    if (error) setErr("E-mail ou senha inválidos. Verifique e tente novamente.");
    else nav("/", { replace: true });
  }

  return (
    <div className="login-wrap">
      <aside className="login-aside crasto-noise">
        <div className="brand-mark">
          <img src={logoWhite} alt="Crasto.AI" style={{ height: 40, display: "block", marginBottom: 16 }} />
          CRASTO.AI
        </div>
        <div>
          <h2>O seu hub de Inteligência Artificial, num só lugar.</h2>
          <p>Acompanhe seus módulos, resultados e a implantação da sua IA — em tempo real, com total transparência.</p>
        </div>
        <div className="foot">Portal do Cliente · acesso seguro</div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <h1>Entrar</h1>
          <p className="sub">Use as credenciais que a Crasto.AI enviou para você.</p>
          <form className="login-form" onSubmit={submit}>
            {err && <div className="login-err">{err}</div>}
            <div>
              <label>E-mail</label>
              <div className="crasto-field">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required autoComplete="username" />
              </div>
            </div>
            <div>
              <label>Senha</label>
              <div className="crasto-field pw-field">
                <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
                <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} tabIndex={-1}>
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <button type="submit" className="crasto-btn crasto-btn--primary crasto-btn--md crasto-btn--full" disabled={busy}>
              <span className="crasto-btn__label">{busy ? "Entrando…" : "Entrar"}</span>
            </button>
            <div style={{ textAlign: "center", marginTop: 2 }}><Link to="/redefinir" className="login-link">Esqueci minha senha</Link></div>
          </form>
        </div>
      </main>
    </div>
  );
}
