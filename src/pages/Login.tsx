import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await signIn(email.trim(), pw);
    setBusy(false);
    if (error) setErr("E-mail ou senha inválidos. Verifique e tente novamente.");
    else nav("/", { replace: true }); // App redireciona pelo papel (admin → /admin, parceiro → /parceiro, cliente → /app)
  }

  return (
    <div className="login-wrap">
      <aside className="login-aside crasto-noise">
        <div className="brand-mark">CRASTO.AI</div>
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
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required />
              </div>
            </div>
            <div>
              <label>Senha</label>
              <div className="crasto-field">
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required />
              </div>
            </div>
            <button type="submit" className="crasto-btn crasto-btn--primary crasto-btn--md crasto-btn--full" disabled={busy}>
              <span className="crasto-btn__label">{busy ? "Entrando…" : "Entrar"}</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
