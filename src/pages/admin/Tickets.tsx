import { useState } from "react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

export default function Tickets() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [tk, orgs] = await Promise.all([
      services.support.tickets.listAll(),
      services.identity.organizations.listForProposals(),
    ]);
    return { tickets: (tk as any[]) ?? [], orgs: (orgs as any[]) ?? [] };
  }, []);
  const tickets = data?.tickets ?? [];
  const orgs = data?.orgs ?? [];
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || "—";
  const [busy, setBusy] = useState("");

  const stLabel = (s: string) => (({ open: t("Aberto"), in_progress: t("Em andamento"), resolved: t("Resolvido"), closed: t("Fechado") } as any)[s] || s);
  const stTone = (s: string) => (s === "resolved" || s === "closed" ? "ok" : s === "in_progress" ? "warn" : "info");
  async function setStatus(id: string, status: string) { setBusy(id); await services.support.tickets.setStatus(id, status); await reload(); setBusy(""); }
  const openCount = tickets.filter((x) => x.status === "open").length;

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Chamados & Suporte" sub="Fila de tickets dos clientes."
        right={openCount > 0 ? <Pill tone="warn">{t("{n} abertos", { n: openCount })}</Pill> : undefined} />
      {loading ? <Empty>Carregando…</Empty> : tickets.length === 0 ? <Empty>Nenhum chamado ainda.</Empty> : (
        tickets.map((tk) => (
          <div className="card" style={{ marginBottom: 12 }} key={tk.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Pill tone={stTone(tk.status)}>{stLabel(tk.status)}</Pill>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div className="nm" style={{ fontWeight: 700 }}>{tk.subject}</div>
                <div className="mt">{orgName(tk.organization_id)} · {new Date(tk.created_at).toLocaleString("pt-BR")}</div>
              </div>
              <select value={tk.status} disabled={busy === tk.id} onChange={(e) => setStatus(tk.id, e.target.value)} className="selorg" style={{ width: 180 }}>
                {STATUSES.map((s) => <option key={s} value={s}>{stLabel(s)}</option>)}
              </select>
            </div>
            {tk.description && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 13, color: "var(--crasto-text-body)", whiteSpace: "pre-wrap" }}>{tk.description}</div>}
          </div>
        ))
      )}
    </div>
  );
}
