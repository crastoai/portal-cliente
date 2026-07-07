import { useState } from "react";
import { Rocket, MessageCircle, Send } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

export default function Implantacoes() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [tk, orgs] = await Promise.all([
      services.support.tickets.listAll("implementation_request"),
      services.identity.organizations.listForProposals(),
    ]);
    const ids = Array.from(new Set((tk as any[]).map((x) => x.organization_id).filter(Boolean)));
    const phones = await services.crm.phones.listByOrgs(ids as string[]).catch(() => [] as any[]);
    return { reqs: (tk as any[]) ?? [], orgs: (orgs as any[]) ?? [], phones: (phones as any[]) ?? [] };
  }, []);
  const reqs = data?.reqs ?? [];
  const orgs = data?.orgs ?? [];
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || "—";
  const waMap: Record<string, string> = {};
  for (const p of (data?.phones ?? []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) {
    if (!waMap[p.organization_id]) waMap[p.organization_id] = `${p.country_code || ""}${p.number || ""}`.replace(/\D/g, "");
  }
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 7000); };

  const stLabel = (s: string) => (({ open: t("Nova"), in_progress: t("Em atendimento"), resolved: t("Atendida"), closed: t("Cancelada") } as any)[s] || s);
  const stTone = (s: string) => (s === "resolved" ? "ok" : s === "in_progress" ? "warn" : s === "closed" ? "mute" : "info");
  async function setStatus(id: string, status: string) { setBusy(id); await services.support.tickets.setStatus(id, status); await reload(); setBusy(""); }
  async function receber(id: string) {
    setBusy(id);
    const r = await services.support.tickets.notify(id, "received");
    await reload(); setBusy("");
    flash(r.ok ? (r.email_sent ? t("Cliente avisado por e-mail ✓ Solicitação em atendimento.") : t("Marcada em atendimento, mas e-mail não enviado: {e}", { e: r.email_error || "—" })) : t("Erro:") + " " + (r.error || "—"));
  }
  const novas = reqs.filter((x) => x.status === "open").length;

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Solicitações de implantação" sub="Módulos que os clientes pediram para a Crasto.AI implementar."
        right={novas > 0 ? <Pill tone="warn">{t("{n} novas", { n: novas })}</Pill> : undefined} />
      {loading ? <Empty>Carregando…</Empty> : reqs.length === 0 ? <Empty>{t("Nenhuma solicitação de implantação ainda.")}</Empty> : (
        reqs.map((r) => {
          const wa = waMap[r.organization_id];
          return (
            <div className="card" style={{ marginBottom: 12 }} key={r.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="logo" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--crasto-text-primary)", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Rocket size={16} /></span>
                <Pill tone={stTone(r.status)}>{stLabel(r.status)}</Pill>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="nm" style={{ fontWeight: 700 }}>{orgName(r.organization_id)}</div>
                  <div className="mt">{new Date(r.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <select value={r.status} disabled={busy === r.id} onChange={(e) => setStatus(r.id, e.target.value)} className="selorg" style={{ width: 160 }}>
                  {STATUSES.map((s) => <option key={s} value={s}>{stLabel(s)}</option>)}
                </select>
              </div>
              {r.description && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 13, color: "var(--crasto-text-body)", whiteSpace: "pre-wrap" }}>{r.description}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {wa && <a className="crasto-btn crasto-btn--ghost crasto-btn--sm" href={`https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Aqui é da Crasto.AI 👋 Sobre sua solicitação de implantação.`)}`} target="_blank" rel="noopener"><span className="crasto-btn__icon"><MessageCircle size={14} /></span><span className="crasto-btn__label">{t("Falar no WhatsApp")}</span></a>}
                {r.status === "open" && <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy === r.id} onClick={() => receber(r.id)}><span className="crasto-btn__icon"><Send size={14} /></span><span className="crasto-btn__label">{t("Avisar que recebemos")}</span></button>}
              </div>
            </div>
          );
        })
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
