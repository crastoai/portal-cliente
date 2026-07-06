import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { services, errorMessage } from "../services";

export default function ResetRequest() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await services.identity.auth.requestReset(email);
      setSent(true);
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
          <h2>O seu hub de Inteligência Artificial, num só lugar.</h2>
          <p>Acompanhe seus módulos, resultados e a implantação da sua IA — em tempo real, com total transparência.</p>
        </div>
        <div className="foot">Portal do Cliente · acesso seguro</div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <h1>Redefinir senha</h1>
          <p className="sub">Informe o e-mail cadastrado. Enviaremos um link seguro para você criar uma nova senha.</p>
          {sent ? (
            <>
              <div className="login-note">Se houver uma conta com esse e-mail, o link de redefinição foi enviado. Verifique sua <b>caixa de entrada</b> (e o spam). O link expira em 1 hora.</div>
              <div style={{ marginTop: 18 }}><Link to="/login" className="login-link">← Voltar ao login</Link></div>
            </>
          ) : (
            <form className="login-form" onSubmit={submit}>
              {err && <div className="login-err">{err}</div>}
              <div>
                <label>E-mail</label>
                <div className="crasto-field">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required autoComplete="username" />
                </div>
              </div>
              <button type="submit" className="crasto-btn crasto-btn--primary crasto-btn--md crasto-btn--full" disabled={busy}>
                <span className="crasto-btn__label">{busy ? "Enviando…" : "Enviar link de redefinição"}</span>
              </button>
              <div style={{ marginTop: 4 }}><Link to="/login" className="login-link">← Voltar ao login</Link></div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
