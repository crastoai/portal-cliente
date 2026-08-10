import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { errorMessage } from "../services";
import { Field } from "../ui/ui";

// Gerenciar a Autenticação em Duas Etapas (2FA) do PRÓPRIO usuário — via MFA nativo do Supabase Auth
// (TOTP, app autenticador). Ativar: enroll → QR → confirmar código. Desativar: unenroll. É por
// usuário e opcional; a COBRANÇA no login (para quem ativou) vive no gate do App (TwoFactorChallenge).
export default function TwoFactor() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null); // fator TOTP verificado (2FA ligado)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function refresh() {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = (data?.totp || []).find((f) => f.status === "verified");
      setFactorId(verified?.id || null);
    } catch (e) { setErr(errorMessage(e)); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function iniciar() {
    setBusy(true); setErr(""); setMsg("");
    try {
      // Limpa enrolls não-verificados pendentes (senão o Supabase recusa: "factor already exists").
      // `totp` só traz os verificados → os pendentes vêm de `all` (cast: nem toda versão dos tipos expõe).
      const { data: fl } = await supabase.auth.mfa.listFactors();
      const pend = (((fl as any)?.all || []) as any[]).filter((x) => x.factor_type === "totp" && x.status === "unverified");
      for (const f of pend) await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  async function confirmar() {
    if (!enroll) return;
    setBusy(true); setErr("");
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (ch.error) throw ch.error;
      const vf = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.data.id, code: code.trim() });
      if (vf.error) throw vf.error;
      setEnroll(null); setMsg(t("Autenticação em duas etapas ATIVADA ✓")); await refresh();
    } catch { setErr(t("Código inválido ou expirado. Digite o código atual do seu app.")); } finally { setBusy(false); }
  }
  async function desativar() {
    if (!factorId) return;
    if (!confirm(t("Desativar a autenticação em duas etapas? Sua conta passa a exigir só a senha."))) return;
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setFactorId(null); setMsg(t("Autenticação em duas etapas desativada."));
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="set-row">
        <div>
          <h3 style={{ margin: 0 }}><ShieldCheck size={17} style={{ verticalAlign: -3, marginRight: 6 }} />{t("Autenticação em duas etapas (2FA)")}</h3>
          <div className="mt">{t("Uma camada extra: além da senha, um código do seu app autenticador (Google Authenticator, Authy…). Opcional e por usuário.")}</div>
        </div>
        {!loading && (factorId
          ? <span className="set-badge" style={{ color: "var(--crasto-success)", background: "rgba(31,138,91,.12)" }}>{t("Ativado")}</span>
          : <span className="set-badge">{t("Desativado")}</span>)}
      </div>

      {err && <div className="formerr" style={{ marginTop: 12 }}>{err}</div>}
      {msg && <div className="note" style={{ marginTop: 12 }}><span>{msg}</span></div>}

      {loading ? <div className="mt" style={{ marginTop: 14 }}>{t("Carregando…")}</div> : enroll ? (
        // Passo do QR: escanear no app + confirmar o código de 6 dígitos.
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ background: "#fff", padding: 12, borderRadius: 12, border: "1px solid var(--crasto-border)", flex: "0 0 auto" }}>
              <img src={enroll.qr} alt="QR code" width={180} height={180} style={{ display: "block" }} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <ol style={{ margin: "0 0 12px", paddingLeft: 18, lineHeight: 1.7, color: "var(--crasto-text-body)", fontSize: 13.5 }}>
                <li>{t("Abra seu app autenticador e escaneie o QR ao lado.")}</li>
                <li>{t("Não consegue escanear? Use este código:")} <code style={{ userSelect: "all", fontWeight: 700 }}>{enroll.secret}</code></li>
                <li>{t("Digite abaixo o código de 6 dígitos que o app mostrar.")}</li>
              </ol>
              <Field label={t("Código de 6 dígitos")}>
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
                  placeholder="000000" style={{ letterSpacing: 4, fontWeight: 700, maxWidth: 160 }} onKeyDown={(e) => e.key === "Enter" && confirmar()} />
              </Field>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || code.length !== 6} onClick={confirmar}><span className="crasto-btn__label">{busy ? t("Verificando…") : t("Ativar 2FA")}</span></button>
                <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => setEnroll(null)}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
              </div>
            </div>
          </div>
        </div>
      ) : factorId ? (
        <div style={{ marginTop: 14 }}>
          <div className="note"><ShieldCheck size={15} /><div>{t("Sua conta está protegida. No próximo login vamos pedir o código do app.")}</div></div>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" style={{ marginTop: 12, color: "var(--crasto-coral)" }} disabled={busy} onClick={desativar}>
            <span className="crasto-btn__icon"><ShieldOff size={14} /></span><span className="crasto-btn__label">{t("Desativar 2FA")}</span>
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={iniciar}>
            <span className="crasto-btn__icon"><ShieldCheck size={14} /></span><span className="crasto-btn__label">{busy ? t("Preparando…") : t("Ativar 2FA")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
