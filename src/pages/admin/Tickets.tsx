import { useState } from "react";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

export default function Tickets() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [tk, orgs] = await Promise.all([
      services.support.tickets.listAll("support"),
      services.identity.organizations.listForProposals(),
    ]);
    const ids = Array.from(new Set((tk as any[]).map((x) => x.organization_id).filter(Boolean)));
    const phones = await services.crm.phones.listByOrgs(ids as string[]).catch(() => [] as any[]);
    return { tickets: (tk as any[]) ?? [], orgs: (orgs as any[]) ?? [], phones: (phones as any[]) ?? [] };
  }, []);
  const tickets = data?.tickets ?? [];
  const orgs = data?.orgs ?? [];
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || "—";
  // mapa org → dígitos do WhatsApp (prioriza o principal)
  const waMap: Record<string, string> = {};
  for (const p of (data?.phones ?? []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) {
    if (!waMap[p.organization_id]) waMap[p.organization_id] = `${p.country_code || ""}${p.number || ""}`.replace(/\D/g, "");
  }
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 7000); };

  const stLabel = (s: string) => (({ open: t("Aberto"), in_progress: t("Em andamento"), resolved: t("Resolvido"), closed: t("Fechado") } as any)[s] || s);
  const stTone = (s: string) => (s === "resolved" || s === "closed" ? "ok" : s === "in_progress" ? "warn" : "info");
  async function setStatus(id: string, status: string) { setBusy(id); await services.support.tickets.setStatus(id, status); await reload(); setBusy(""); }
  async function resolver(id: string) {
    setBusy(id);
    const r = await services.support.tickets.notify(id, "resolved");
    await reload(); setBusy("");
    flash(r.ok ? (r.email_sent ? t("Cliente avisado por e-mail ✓ Chamado resolvido.") : t("Chamado resolvido, mas e-mail não enviado: {e}", { e: r.email_error || "—" })) : t("Erro:") + " " + (r.error || "—"));
  }
  const openCount = tickets.filter((x) => x.status === "open").length;

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Chamados & Suporte" sub="Fila de tickets dos clientes."
        right={openCount > 0 ? <Pill tone="warn">{t("{n} abertos", { n: openCount })}</Pill> : undefined} />
      {loading ? <Empty>Carregando…</Empty> : tickets.length === 0 ? <Empty>Nenhum chamado ainda.</Empty> : (
        tickets.map((tk) => {
          const wa = waMap[tk.organization_id];
          return (
            <div className="card" style={{ marginBottom: 12 }} key={tk.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Pill tone={stTone(tk.status)}>{stLabel(tk.status)}</Pill>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="nm" style={{ fontWeight: 700 }}>{tk.subject}</div>
                  <div className="mt">{orgName(tk.organization_id)} · {new Date(tk.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <select value={tk.status} disabled={busy === tk.id} onChange={(e) => setStatus(tk.id, e.target.value)} className="selorg" style={{ width: 160 }}>
                  {STATUSES.map((s) => <option key={s} value={s}>{stLabel(s)}</option>)}
                </select>
              </div>
              {tk.description && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 13, color: "var(--crasto-text-body)", whiteSpace: "pre-wrap" }}>{tk.description}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {wa && <a className="crasto-btn crasto-btn--ghost crasto-btn--sm" href={`https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Aqui é da Crasto.AI 👋 Sobre seu chamado #${String(tk.id).slice(0, 8).toUpperCase()}.`)}`} target="_blank" rel="noopener"><span className="crasto-btn__icon"><MessageCircle size={14} /></span><span className="crasto-btn__label">{t("Falar no WhatsApp")}</span></a>}
                {tk.status !== "resolved" && <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy === tk.id} onClick={() => resolver(tk.id)}><span className="crasto-btn__icon"><CheckCircle2 size={14} /></span><span className="crasto-btn__label">{t("Avisar que foi resolvido")}</span></button>}
              </div>
            </div>
          );
        })
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
