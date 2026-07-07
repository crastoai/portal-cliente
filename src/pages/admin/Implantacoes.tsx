import { useState } from "react";
import { Rocket } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// Fluxo próprio de solicitação de implantação (reusa o status do ticket com rótulos de entrega).
const STATUSES = ["open", "in_progress", "resolved", "closed"];

export default function Implantacoes() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [tk, orgs] = await Promise.all([
      services.support.tickets.listAll("implementation_request"),
      services.identity.organizations.listForProposals(),
    ]);
    return { reqs: (tk as any[]) ?? [], orgs: (orgs as any[]) ?? [] };
  }, []);
  const reqs = data?.reqs ?? [];
  const orgs = data?.orgs ?? [];
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || "—";
  const [busy, setBusy] = useState("");

  // rótulos voltados à ENTREGA (não a "suporte")
  const stLabel = (s: string) => (({ open: t("Nova"), in_progress: t("Em atendimento"), resolved: t("Atendida"), closed: t("Cancelada") } as any)[s] || s);
  const stTone = (s: string) => (s === "resolved" ? "ok" : s === "in_progress" ? "warn" : s === "closed" ? "mute" : "info");
  async function setStatus(id: string, status: string) { setBusy(id); await services.support.tickets.setStatus(id, status); await reload(); setBusy(""); }
  const novas = reqs.filter((x) => x.status === "open").length;

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Solicitações de implantação" sub="Módulos que os clientes pediram para a Crasto.AI implementar."
        right={novas > 0 ? <Pill tone="warn">{t("{n} novas", { n: novas })}</Pill> : undefined} />
      {loading ? <Empty>Carregando…</Empty> : reqs.length === 0 ? <Empty>{t("Nenhuma solicitação de implantação ainda.")}</Empty> : (
        reqs.map((r) => (
          <div className="card" style={{ marginBottom: 12 }} key={r.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="logo" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--crasto-text-primary)", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Rocket size={16} /></span>
              <Pill tone={stTone(r.status)}>{stLabel(r.status)}</Pill>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div className="nm" style={{ fontWeight: 700 }}>{orgName(r.organization_id)}</div>
                <div className="mt">{new Date(r.created_at).toLocaleString("pt-BR")}</div>
              </div>
              <select value={r.status} disabled={busy === r.id} onChange={(e) => setStatus(r.id, e.target.value)} className="selorg" style={{ width: 180 }}>
                {STATUSES.map((s) => <option key={s} value={s}>{stLabel(s)}</option>)}
              </select>
            </div>
            {r.description && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 13, color: "var(--crasto-text-body)", whiteSpace: "pre-wrap" }}>{r.description}</div>}
          </div>
        ))
      )}
    </div>
  );
}
