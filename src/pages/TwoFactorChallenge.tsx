import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { errorMessage } from "../services";

// Cobrança do 2FA NO LOGIN — mostrada pelo gate do App quando a sessão está em aal1 e o usuário tem
// um fator TOTP verificado. Ao acertar o código, a sessão sobe para aal2 e o gate solta o app.
export default function TwoFactorChallenge() {
  const t = useT();
  const { recheckMfa, signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; started.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const f = (data?.totp || []).find((x) => x.status === "verified");
        if (!f) { await recheckMfa(); return; } // não há fator → destrava o gate
        setFactorId(f.id);
        const ch = await supabase.auth.mfa.challenge({ factorId: f.id });
        if (ch.error) throw ch.error;
        setChallengeId(ch.data.id);
      } catch (e) { setErr(errorMessage(e)); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function verificar() {
    if (!factorId || !challengeId || code.length !== 6) return;
    setBusy(true); setErr("");
    try {
      const vf = await supabase.auth.mfa.verify({ factorId, challengeId, code: code.trim() });
      if (vf.error) throw vf.error;
      await recheckMfa(); // aal2 → o gate do App solta
    } catch { setErr(t("Código inválido ou expirado. Digite o código atual do seu app.")); setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20, background: "var(--crasto-page-bg)" }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <div style={{ display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: 14, background: "var(--crasto-navy-08)", color: "var(--crasto-text-primary)", margin: "0 auto 14px" }}>
          <ShieldCheck size={26} />
        </div>
        <h3 style={{ textAlign: "center", margin: 0 }}>{t("Verificação em duas etapas")}</h3>
        <p className="mt" style={{ textAlign: "center", margin: "8px 0 20px" }}>{t("Digite o código de 6 dígitos do seu app autenticador para entrar.")}</p>

        {err && <div className="formerr" style={{ marginBottom: 12 }}>{err}</div>}

        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus
          placeholder="000000" onKeyDown={(e) => e.key === "Enter" && verificar()}
          style={{ width: "100%", textAlign: "center", letterSpacing: 8, fontSize: 24, fontWeight: 700, padding: "12px 0" }} />

        <button className="crasto-btn crasto-btn--primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} disabled={busy || code.length !== 6} onClick={verificar}>
          <span className="crasto-btn__label">{busy ? t("Verificando…") : t("Verificar e entrar")}</span>
        </button>
        <button type="button" onClick={() => void signOut("2fa")} style={{ display: "block", margin: "14px auto 0", border: 0, background: "transparent", color: "var(--crasto-text-muted)", fontSize: 13, cursor: "pointer" }}>{t("Entrar com outra conta")}</button>
      </div>
    </div>
  );
}
