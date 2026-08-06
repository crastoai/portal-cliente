import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

// "Amplie sua operação" — recomendador de IA (DeepSeek). Sem preço; termina em reunião.
// Componente reutilizável (Catálogo + Cockpit/Meus Resultados). Auto-contido: estado + ações + UI.
export default function AmpliarOperacao() {
  const t = useT();
  const { profile } = useAuth();
  const [recoTexto, setRecoTexto] = useState("");
  const [recoBusy, setRecoBusy] = useState(false);
  const [recoRes, setRecoRes] = useState<{ recomendacao: string | null; solucoes: string[] } | null>(null);
  const [recoErr, setRecoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const err = (e: any) => e?.message || t("Ocorreu um erro.");

  async function recomendar() {
    if (recoTexto.trim().length < 5) { setRecoErr(t("Conte um pouco mais sobre o que você precisa.")); return; }
    setRecoBusy(true); setRecoErr(""); setRecoRes(null);
    try {
      const r = await services.psique.recomendar(recoTexto);
      if ((r as any)?.error) setRecoErr((r as any).error);
      else setRecoRes({ recomendacao: r.recomendacao, solucoes: r.solucoes || [] });
    } catch (e) { setRecoErr(err(e)); } finally { setRecoBusy(false); }
  }
  async function agendarReuniao() {
    setBusy(true);
    const who = profile?.full_name || profile?.email || t("Cliente");
    try {
      const r = await services.support.tickets.open({
        subject: t("Agendar reunião — Amplie sua operação"),
        description: `${t("O cliente quer agendar uma reunião para desenhar uma solução.")}\n\n${t("Solicitante")}: ${who}${profile?.email ? ` (${profile.email})` : ""}\n\n${t("Necessidade descrita")}: ${recoTexto || "—"}\n${recoRes?.solucoes?.length ? `${t("IA sugeriu")}: ${recoRes.solucoes.join(", ")}` : ""}`,
        kind: "meeting_request",
      });
      setToast(r.ok ? t("Reunião solicitada ✓ Nosso consultor vai te chamar.") : t("Não foi possível enviar. Tente de novo."));
    } catch (e) { setToast(err(e)); }
    setBusy(false); setTimeout(() => setToast(""), 8000);
  }

  return (
    <div style={{ background: "linear-gradient(150deg,var(--crasto-navy,#010E26),#000714)", color: "#fff", borderRadius: "var(--crasto-radius-lg,20px)", padding: "22px", marginTop: 20 }}>
      <div style={{ fontSize: 19, fontWeight: 600 }}>{t("Amplie sua operação")}</div>
      <p style={{ color: "rgba(255,255,255,.72)", fontSize: 14, marginTop: 5, maxWidth: 660 }}>{t("Conte o que você precisa — nossa IA recomenda a solução ideal para a sua empresa. O valor é sob medida, apresentado numa reunião.")}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <input value={recoTexto} onChange={(e) => setRecoTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") recomendar(); }} placeholder={t("Ex.: um agente que imprime boletos do meu PC conectando no sistema de seguros da empresa X")} style={{ flex: "1 1 320px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", borderRadius: "var(--crasto-radius-sm,8px)", padding: "11px 13px", color: "#fff", fontSize: 13.5, fontFamily: "inherit" }} />
        <button className="crasto-btn crasto-btn--sm" style={{ background: "#fff", color: "var(--crasto-navy,#010E26)" }} disabled={recoBusy} onClick={recomendar}><span className="crasto-btn__icon"><Sparkles size={14} /></span><span className="crasto-btn__label">{recoBusy ? t("Pensando…") : t("Recomendar")}</span></button>
      </div>
      {recoErr && <div style={{ color: "#ffb4b4", fontSize: 12.5, marginTop: 8 }}>{recoErr}</div>}
      {recoRes && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.12)" }}>
          <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crasto-blue,#6E9CE8)", fontWeight: 600 }}>💡 {t("Nossa IA sugere")}</div>
          {recoRes.recomendacao && <p style={{ color: "rgba(255,255,255,.9)", fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{recoRes.recomendacao}</p>}
          {recoRes.solucoes.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>{recoRes.solucoes.map((s, i) => <span key={i} style={{ background: "rgba(110,156,232,.18)", color: "#fff", padding: "4px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600 }}>{s}</span>)}</div>}
          <button className="crasto-btn crasto-btn--sm" style={{ background: "#fff", color: "var(--crasto-navy,#010E26)", marginTop: 14 }} disabled={busy} onClick={agendarReuniao}><span className="crasto-btn__label">{t("Agende a reunião de definição de preço")} <ArrowRight size={13} style={{ verticalAlign: -2 }} /></span></button>
        </div>
      )}
      {toast && <div style={{ marginTop: 12, fontSize: 13, color: "var(--crasto-blue,#6E9CE8)" }}>{toast}</div>}
    </div>
  );
}
