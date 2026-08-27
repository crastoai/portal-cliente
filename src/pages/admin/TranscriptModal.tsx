// ============================================================================
// TranscriptModal — leitura estilizada da transcrição de uma reunião + resumo por IA.
// Abas Resumo / Transcrição; botão "Resumir com IA" (Gemini) que gera resumo acionável
// (pontos-chave, decisões, próximos passos p/ Crasto e cliente) e salva na reunião. Copiar.
// ============================================================================
import { useEffect, useState } from "react";
import { Sparkles, Copy, FileText, ScrollText, Users, CalendarDays } from "lucide-react";
import { services as api } from "../../services";
import Modal from "../../ui/Modal";
import { useToast } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { fmtDateTime } from "../../lib/adminData";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inlineMd = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

function Md({ text }: { text: string }) {
  const lines = String(text || "").split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  let k = 0;
  const flush = () => { if (bullets.length) { out.push(<ul key={k++} style={{ margin: "2px 0 10px 18px", display: "grid", gap: 4 }}>{bullets.map((b, i) => <li key={i} style={{ lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: inlineMd(b) }} />)}</ul>); bullets = []; } };
  for (const ln of lines) {
    const tt = ln.trim();
    if (/^##\s+/.test(tt)) { flush(); out.push(<div key={k++} style={{ fontWeight: 700, color: "var(--crasto-text-primary)", fontSize: 13.5, margin: "14px 0 5px", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 4, height: 14, borderRadius: 2, background: "var(--crasto-blue)" }} />{tt.replace(/^##\s+/, "")}</div>); }
    else if (/^#\s+/.test(tt)) { flush(); out.push(<div key={k++} style={{ fontWeight: 800, fontSize: 15, margin: "12px 0 5px" }}>{tt.replace(/^#\s+/, "")}</div>); }
    else if (/^[-*]\s+/.test(tt)) bullets.push(tt.replace(/^[-*]\s+/, ""));
    else if (tt) { flush(); out.push(<p key={k++} style={{ margin: "0 0 9px", lineHeight: 1.55, color: "var(--crasto-text-body)" }} dangerouslySetInnerHTML={{ __html: inlineMd(tt) }} />); }
    else flush();
  }
  flush();
  return <div>{out}</div>;
}

export default function TranscriptModal({ meeting, open, onClose, onUpdated }: { meeting: any; open: boolean; onClose: () => void; onUpdated?: (summary: string) => void }) {
  const t = useT();
  const toast = useToast();
  const [summary, setSummary] = useState<string>(meeting?.summary || "");
  const [tab, setTab] = useState<"resumo" | "transcricao">(meeting?.summary ? "resumo" : "transcricao");
  const [busy, setBusy] = useState(false);

  // ao abrir outra reunião, recarrega o resumo/aba
  useEffect(() => { if (meeting) { setSummary(meeting.summary || ""); setTab(meeting.summary ? "resumo" : "transcricao"); } }, [meeting?.id]);

  async function resumir() {
    setBusy(true);
    try {
      const r = await api.automation.meetings.summarize(meeting.id);
      if (r?.ok === false) { toast.err(r.error || t("Erro ao resumir.")); return; }
      setSummary(r.summary); setTab("resumo"); onUpdated?.(r.summary); toast.ok(t("Resumo gerado ✓"));
    } catch { toast.err(t("Erro ao resumir.")); }
    finally { setBusy(false); }
  }
  function copiar(txt: string) { try { navigator.clipboard?.writeText(txt); toast.ok(t("Copiado ✓")); } catch { /* noop */ } }

  const transcript = meeting?.transcript || "";
  const paras = String(transcript).split(/\n{2,}|\r?\n/).map((s) => s.trim()).filter(Boolean);

  return (
    <Modal title={meeting?.title || t("Reunião")} open={open} onClose={onClose} wide
      footer={<>
        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={onClose}><span className="crasto-btn__label">{t("Fechar")}</span></button>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || !transcript} onClick={resumir}>
          <span className="crasto-btn__icon"><Sparkles size={14} /></span><span className="crasto-btn__label">{busy ? t("Resumindo…") : summary ? t("Atualizar resumo com IA") : t("Resumir com IA")}</span>
        </button>
      </>}>
      {toast.node}
      {meeting && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: "var(--crasto-text-muted)", marginBottom: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarDays size={14} /> {fmtDateTime(meeting.meeting_at)}</span>
            {meeting.attendees && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Users size={14} /> {meeting.attendees}</span>}
          </div>

          {/* abas */}
          <div style={{ display: "inline-flex", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-pill)", overflow: "hidden", marginBottom: 12 }}>
            {([["resumo", "Resumo", FileText], ["transcricao", "Transcrição", ScrollText]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setTab(v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", background: tab === v ? "var(--crasto-bg-2)" : "transparent", color: tab === v ? "var(--crasto-text-primary)" : "var(--crasto-text-muted)" }}>
                <Icon size={13} />{t(label)}
              </button>
            ))}
          </div>

          {tab === "resumo" ? (
            summary ? (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => copiar(summary)}><span className="crasto-btn__icon"><Copy size={13} /></span><span className="crasto-btn__label">{t("Copiar")}</span></button>
                </div>
                <div style={{ background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)", padding: "14px 16px" }}><Md text={summary} /></div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--crasto-text-muted)" }}>
                <Sparkles size={26} style={{ color: "var(--crasto-blue)", marginBottom: 8 }} />
                <div style={{ fontWeight: 600, color: "var(--crasto-text-primary)", marginBottom: 4 }}>{t("Sem resumo ainda")}</div>
                <div style={{ fontSize: 12.5 }}>{t("Clique em \"Resumir com IA\" para gerar um resumo acionável (pontos-chave, decisões e próximos passos para os dois lados).")}</div>
              </div>
            )
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => copiar(transcript)}><span className="crasto-btn__icon"><Copy size={13} /></span><span className="crasto-btn__label">{t("Copiar")}</span></button>
              </div>
              {transcript ? (
                <div style={{ maxHeight: "48vh", overflow: "auto", background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)", padding: "14px 16px", fontSize: 13.5, lineHeight: 1.6, color: "var(--crasto-text-body)" }}>
                  {paras.map((p, i) => <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>)}
                </div>
              ) : <div className="mt" style={{ padding: 12 }}>{t("Esta reunião não tem transcrição.")}</div>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
