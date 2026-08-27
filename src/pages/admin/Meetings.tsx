// ============================================================================
// Meetings — reuniões da empresa com transcrição/resumo (D5). Disponível já no
// lead (e no cliente). Lista quantas reuniões e o que foi falado; guarda transcrição
// e resumo; expande p/ ler. Base para a captura automática (Google Meet) e p/ virar
// proposta. Fonte: delivery.client_meetings.
// ============================================================================
import { useState } from "react";
import { CalendarDays, Plus, X, Trash2, FileText, ScrollText, ChevronDown, ChevronRight } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, useToast, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { fmtDateTime } from "../../lib/adminData";

export default function Meetings({ orgId }: { orgId: string }) {
  const t = useT();
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => ((await api.delivery.meetings.listByOrg(orgId).catch(() => [])) as any[]) ?? [], [orgId]);
  const list = data ?? [];

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ meeting_at: "", title: "", attendees: "", summary: "", transcript: "" });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function criar() {
    if (!f.meeting_at || !f.title.trim()) { toast.err(t("Informe a data e o título da reunião.")); return; }
    setBusy(true);
    try {
      const r = await api.delivery.meetings.create({ organization_id: orgId, meeting_at: new Date(f.meeting_at).toISOString(), title: f.title.trim(), attendees: f.attendees.trim() || undefined, summary: f.summary.trim() || undefined, transcript: f.transcript.trim() || undefined });
      if ((r as any)?.error) throw new Error((r as any).error);
      toast.ok(t("Reunião registrada ✓")); setOpen(false); setF({ meeting_at: "", title: "", attendees: "", summary: "", transcript: "" }); reload();
    } catch { toast.err(t("Erro ao registrar a reunião.")); }
    finally { setBusy(false); }
  }
  async function del(id: string) { if (!confirm(t("Excluir esta reunião?"))) return; try { await api.delivery.meetings.remove(id); toast.ok(t("Excluída ✓")); reload(); } catch { toast.err(t("Erro ao excluir.")); } }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      {toast.node}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <CalendarDays size={16} style={{ color: "var(--crasto-text-primary)" }} />
        <h3 style={{ margin: 0 }}>{t("Reuniões & transcrições")}</h3>
        <span className="mt" style={{ fontSize: 11.5 }}>{list.length} {list.length === 1 ? t("reunião") : t("reuniões")} · {t("transcrição + resumo por reunião")}</span>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginLeft: "auto" }} onClick={() => setOpen((o) => !o)}>
          <span className="crasto-btn__icon">{open ? <X size={14} /> : <Plus size={14} />}</span><span className="crasto-btn__label">{open ? t("Fechar") : t("Nova reunião")}</span>
        </button>
      </div>

      {open && (
        <div className="card" style={{ margin: "10px 0", padding: 14, background: "var(--crasto-bg-2)" }}>
          <div className="grid2">
            <Field label={t("Data/hora")}><input type="datetime-local" value={f.meeting_at} onChange={(e) => setF({ ...f, meeting_at: e.target.value })} /></Field>
            <Field label={t("Título")}><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("ex.: Reunião de descoberta")} /></Field>
          </div>
          <Field label={t("Participantes")}><input value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} placeholder={t("nomes separados por vírgula")} /></Field>
          <Field label={t("Resumo")}><textarea className="inp" style={{ width: "100%", minHeight: 54, resize: "vertical" }} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder={t("resumo do que foi falado")} /></Field>
          <Field label={t("Transcrição")}><textarea className="inp" style={{ width: "100%", minHeight: 80, resize: "vertical" }} value={f.transcript} onChange={(e) => setF({ ...f, transcript: e.target.value })} placeholder={t("cole a transcrição (ou será puxada automaticamente do Google Meet)")} /></Field>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={criar}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Registrar reunião")}</span></button>
          </div>
        </div>
      )}

      {loading ? <div className="mt" style={{ padding: "6px 2px" }}>{t("Carregando…")}</div> : list.length === 0 ? (
        <div className="mt" style={{ padding: "6px 2px" }}>{t("Nenhuma reunião ainda. Toda reunião (do lead ao ganho) fica registrada aqui com transcrição e resumo.")}</div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {list.map((m) => {
            const ex = !!expanded[m.id];
            return (
              <div key={m.id} style={{ border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={() => setExpanded((e) => ({ ...e, [m.id]: !ex }))}>{ex ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 600, color: "var(--crasto-text-primary)", fontSize: 13.5 }}>{m.title}</div>
                    <div className="mt" style={{ fontSize: 12 }}>{fmtDateTime(m.meeting_at)}{m.attendees ? ` · ${m.attendees}` : ""}</div>
                  </div>
                  {m.summary && <span className="chip" style={{ background: "#EEF2FB", color: "#26478A" }}><FileText size={11} style={{ verticalAlign: "-1px" }} /> {t("resumo")}</span>}
                  {m.transcript && <span className="chip" style={{ background: "#E7F0FA", color: "#1F5E8F" }}><ScrollText size={11} style={{ verticalAlign: "-1px" }} /> {t("transcrição")}</span>}
                  <button className="iconbtn" title={t("Excluir")} onClick={() => del(m.id)}><Trash2 size={14} color="var(--crasto-red, #E74C3C)" /></button>
                </div>
                {ex && (m.summary || m.transcript) && (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {m.summary && <div><div className="infolab" style={{ fontSize: 11.5, color: "var(--crasto-text-muted)" }}>{t("Resumo")}</div><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{m.summary}</div></div>}
                    {m.transcript && <div><div className="infolab" style={{ fontSize: 11.5, color: "var(--crasto-text-muted)" }}>{t("Transcrição")}</div><div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto", background: "var(--crasto-bg-2)", borderRadius: 8, padding: 10 }}>{m.transcript}</div></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
