import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { services, errorMessage } from "../services";
import { useAuth } from "../lib/auth";
import logoWhite from "../assets/logo-branca.svg";

export default function NewPassword() {
  const { session } = useAuth();
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
    if (pw.length < 6) { setErr("A senha deve ter ao menos 6 caracteres."); return; }
    if (pw !== pw2) { setErr("As senhas não conferem."); return; }
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
          <img src={logoWhite} alt="Crasto.AI" style={{ height: 40, display: "block", marginBottom: 16 }} />
          CRASTO.AI
        </div>
        <div>
          <h2>O seu hub de Inteligência Artificial, num só lugar.</h2>
          <p>Crie uma nova senha para acessar o portal com segurança.</p>
        </div>
        <div className="foot">Portal do Cliente · acesso seguro</div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <h1>{forced ? "Defina sua senha" : "Nova senha"}</h1>
          <p className="sub">{forced ? "Por segurança, crie uma senha própria para continuar." : "Escolha uma nova senha para o seu acesso."}</p>
          {ok ? (
            <div className="login-note">Senha definida com sucesso ✓ Entrando no portal…</div>
          ) : (
            <form className="login-form" onSubmit={submit}>
              {err && <div className="login-err">{err}</div>}
              <div>
                <label>Nova senha</label>
                <div className="crasto-field pw-field">
                  <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="mín. 6 caracteres" required autoComplete="new-password" />
                  <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} tabIndex={-1}>
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <div>
                <label>Confirmar nova senha</label>
                <div className="crasto-field">
                  <input type={showPw ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="repita a senha" required autoComplete="new-password" />
                </div>
              </div>
              <button type="submit" className="crasto-btn crasto-btn--primary crasto-btn--md crasto-btn--full" disabled={busy}>
                <span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar nova senha"}</span>
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
