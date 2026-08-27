// ============================================================================
// GoogleMeetConnect — botão "Conectar Google" (D5). Abre o popup OAuth; ao conectar,
// o Portal passa a puxar as transcrições das reuniões do Meet (poll a cada 5 min) e
// registra em cada cliente (casando por e-mail/nome). INTERNAL: só a conta da Crasto.
// ============================================================================
import { useEffect, useState } from "react";
import { Video, RefreshCw, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, useToast } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { fmtDateTime } from "../../lib/adminData";

export default function GoogleMeetConnect() {
  const t = useT();
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => (await api.automation.googleMeet.status().catch(() => null)) as any, []);
  const st = data || {};
  const [busy, setBusy] = useState(false);

  // ouve o postMessage do popup de callback
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e?.data?.type === "google-meet-connected") { if (e.data.ok) toast.ok(t("Google conectado ✓")); reload(); }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar() {
    setBusy(true);
    try {
      const r = await api.automation.googleMeet.start();
      if (r?.ok === false || !r?.url) { toast.err(r?.error || t("OAuth ainda não configurado no servidor.")); return; }
      window.open(r.url, "google-oauth", "width=520,height=680");
    } catch { toast.err(t("Erro ao iniciar a conexão.")); }
    finally { setBusy(false); }
  }
  async function desconectar() { if (!confirm(t("Desconectar o Google?"))) return; try { await api.automation.googleMeet.disconnect(); toast.ok(t("Desconectado ✓")); reload(); } catch { toast.err(t("Erro.")); } }
  async function puxar() { setBusy(true); try { const r = await api.automation.googleMeet.pollNow(); toast.ok(t("Verificado ✓ ({n} novas)", { n: r?.ingested ?? 0 } as any)); reload(); } catch { toast.err(t("Erro ao puxar.")); } finally { setBusy(false); } }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      {toast.node}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <Video size={16} style={{ color: "var(--crasto-text-primary)" }} />
        <h3 style={{ margin: 0 }}>{t("Google Meet — transcrições automáticas")}</h3>
        <span className="mt" style={{ fontSize: 11.5 }}>{t("puxa a transcrição de cada reunião e registra no cliente (casa por e-mail/nome)")}</span>
      </div>

      {loading ? <div className="mt" style={{ padding: "6px 2px" }}>{t("Carregando…")}</div> : st.connected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#1D9E75", fontWeight: 600 }}><CheckCircle2 size={16} /> {t("Conectado")}{st.email ? ` · ${st.email}` : ""}</span>
          {st.last_poll_at && <span className="mt" style={{ fontSize: 12 }}>{t("última verificação")}: {fmtDateTime(st.last_poll_at)}</span>}
          {st.last_error && <span className="chip" style={{ background: "#FCEBEB", color: "#791F1F" }} title={st.last_error}><AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> {t("erro na última")}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={puxar}><span className="crasto-btn__icon"><RefreshCw size={14} /></span><span className="crasto-btn__label">{t("Puxar agora")}</span></button>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={desconectar}><span className="crasto-btn__icon"><LogOut size={14} /></span><span className="crasto-btn__label">{t("Desconectar")}</span></button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <span className="mt" style={{ flex: 1, minWidth: 200 }}>{t("Conecte a conta Google da Crasto (organizadora das reuniões). Só a Crasto conecta — as transcrições das reuniões do Meet entram automaticamente por cliente.")}</span>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={conectar}><span className="crasto-btn__icon"><Video size={14} /></span><span className="crasto-btn__label">{t("Conectar Google")}</span></button>
        </div>
      )}
    </div>
  );
}
