import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { services, errorMessage } from "../services";
import { useT } from "../lib/i18n";
import LangSwitcher from "../ui/LangSwitcher";

export default function ResetRequest() {
  const t = useT();
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
          <h2>{t("O seu hub de Inteligência Artificial, num só lugar.")}</h2>
          <p>{t("Acompanhe seus módulos, resultados e a implantação da sua IA — em tempo real, com total transparência.")}</p>
        </div>
        <div className="foot">{t("Portal do Cliente · acesso seguro")}</div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><LangSwitcher /></div>
          <h1>{t("Redefinir senha")}</h1>
          <p className="sub">{t("Informe o e-mail cadastrado. Enviaremos um link seguro para você criar uma nova senha.")}</p>
          {sent ? (
            <>
              <div className="login-note">{t("Se houver uma conta com esse e-mail, o link de redefinição foi enviado. Verifique sua caixa de entrada (e o spam). O link expira em 1 hora.")}</div>
              <div style={{ marginTop: 18 }}><Link to="/login" className="login-link">{t("← Voltar ao login")}</Link></div>
            </>
          ) : (
            <form className="login-form" onSubmit={submit}>
              {err && <div className="login-err">{err}</div>}
              <div>
                <label>{t("E-mail")}</label>
                <div className="crasto-field">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("voce@empresa.com")} required autoComplete="username" />
                </div>
              </div>
              <button type="submit" className="crasto-btn crasto-btn--primary crasto-btn--md crasto-btn--full" disabled={busy}>
                <span className="crasto-btn__label">{busy ? t("Enviando…") : t("Enviar link de redefinição")}</span>
              </button>
              <div style={{ marginTop: 4 }}><Link to="/login" className="login-link">{t("← Voltar ao login")}</Link></div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
