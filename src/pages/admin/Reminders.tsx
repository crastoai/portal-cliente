// ============================================================================
// Reminders — agendamentos/lembretes por empresa (B3). Lista os agendamentos, permite
// criar um novo (data, título, mensagem, canais) e cancelar. O motor (cron diário) dispara
// quando vence, nos canais escolhidos: sininho / e-mail / WhatsApp.
// Usado na ficha do lead e na ficha do cliente.
// ============================================================================
import { useState } from "react";
import { CalendarClock, Plus, X, Bell, Mail, Smartphone } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, useToast, Pill, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { fmtDateTime } from "../../lib/adminData";

const CHANNELS = [["sininho", "Sininho", Bell], ["email", "E-mail", Mail], ["whatsapp", "WhatsApp", Smartphone]] as const;
const statusTone = (s: string) => (s === "sent" ? "ok" : s === "cancelled" ? "mute" : "warn");
const statusLabel = (s: string, t: (k: string) => string) => (s === "sent" ? t("Enviado") : s === "cancelled" ? t("Cancelado") : t("Agendado"));

export default function Reminders({ orgId }: { orgId: string }) {
  const t = useT();
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => ((await api.automation.reminders.byOrg(orgId).catch(() => [])) as any[]) ?? [], [orgId]);
  const list = data ?? [];

  const [open, setOpen] = useState(false);
  const [due, setDue] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [chs, setChs] = useState<string[]>(["sininho", "email"]);
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setChs((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));

  async function criar() {
    if (!due || !title.trim()) { toast.err(t("Informe a data e o título.")); return; }
    setBusy(true);
    try {
      const r = await api.automation.reminders.create({ organization_id: orgId, due_at: new Date(due).toISOString(), title: title.trim(), message: msg.trim() || null, channels: chs });
      if (r?.ok === false) throw new Error();
      toast.ok(t("Agendamento criado ✓")); setOpen(false); setDue(""); setTitle(""); setMsg(""); setChs(["sininho", "email"]); reload();
    } catch { toast.err(t("Erro ao criar o agendamento.")); }
    finally { setBusy(false); }
  }
  async function cancelar(id: string) {
    if (!confirm(t("Cancelar este agendamento?"))) return;
    try { await api.automation.reminders.cancel(id); toast.ok(t("Cancelado ✓")); reload(); }
    catch { toast.err(t("Erro ao cancelar.")); }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      {toast.node}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <CalendarClock size={16} style={{ color: "var(--crasto-text-primary)" }} />
        <h3 style={{ margin: 0 }}>{t("Agendamentos & lembretes")}</h3>
        <span className="mt" style={{ fontSize: 11.5 }}>{t("dispara no sininho / e-mail / WhatsApp quando vencer")}</span>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginLeft: "auto" }} onClick={() => setOpen((o) => !o)}>
          <span className="crasto-btn__icon">{open ? <X size={14} /> : <Plus size={14} />}</span><span className="crasto-btn__label">{open ? t("Fechar") : t("Novo agendamento")}</span>
        </button>
      </div>

      {open && (
        <div className="card" style={{ margin: "10px 0", padding: 14, background: "var(--crasto-bg-2)" }}>
          <div className="grid2">
            <Field label={t("Quando")}><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            <Field label={t("Título")}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ex.: Ligar para follow-up")} /></Field>
          </div>
          <Field label={t("Mensagem")}><input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t("o que lembrar / o que dizer")} /></Field>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {CHANNELS.map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => toggle(k)} className="chip"
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid " + (chs.includes(k) ? "transparent" : "var(--crasto-border-soft)"), background: chs.includes(k) ? "var(--crasto-navy-05, #EEF2FB)" : "transparent", color: "var(--crasto-text-body)" }}>
                <Icon size={13} />{t(label)}
              </button>
            ))}
            <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginLeft: "auto" }} disabled={busy} onClick={criar}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Agendar")}</span></button>
          </div>
        </div>
      )}

      {loading ? <div className="mt" style={{ padding: "6px 2px" }}>{t("Carregando…")}</div> : list.length === 0 ? (
        <div className="mt" style={{ padding: "6px 2px" }}>{t("Nenhum agendamento. Crie um para ser lembrado (ex.: follow-up em 60 dias).")}</div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {list.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)", flexWrap: "wrap" }}>
              <CalendarClock size={15} style={{ color: "var(--crasto-text-muted)", flex: "none" }} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600, color: "var(--crasto-text-primary)", fontSize: 13.5 }}>{r.title}</div>
                <div className="mt" style={{ fontSize: 12 }}>{fmtDateTime(r.due_at)}{Array.isArray(r.channels) && r.channels.length ? ` · ${r.channels.join(", ")}` : ""}</div>
                {r.message && <div className="mt" style={{ fontSize: 12 }}>{r.message}</div>}
              </div>
              <Pill tone={statusTone(r.status)}>{statusLabel(r.status, t)}</Pill>
              {r.status === "pending" && <button className="iconbtn" title={t("Cancelar")} onClick={() => cancelar(r.id)}><X size={15} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
