import { useState } from "react";
import { Eye, Settings, KeyRound, ShieldCheck, Lock } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// Auditoria & Logs (SPEC 3.6) — visão central da trilha append-only (audit.events).
const ACTION_LABEL: Record<string, string> = {
  impersonate_attempt: "Entrou no CRM (impersonação)",
  impersonate: "Impersonação",
  config_change: "Alterou configuração",
  secret_reveal: "Revelou segredo",
  role_change: "Mudou papel",
};
const ACTION_TONE = (a: string) => (a.startsWith("impersonate") ? "info" : a === "secret_reveal" ? "crit" : a === "role_change" ? "warn" : "mute");
const fmtDT = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ConsoleAuditoria() {
  const t = useT();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [org, setOrg] = useState("");
  const { data, loading } = useAsync(async () => {
    const [events, orgs] = await Promise.all([
      services.analytics.admin.auditLog(from || undefined, to || undefined, org || undefined),
      services.identity.organizations.listBrief().catch(() => [] as any[]),
    ]);
    return { events: (events as any[]) ?? [], orgs: (orgs as any[]) ?? [] };
  }, [from, to, org]);
  const events = data?.events ?? [];
  const orgs = data?.orgs ?? [];
  const orgName = (id?: string | null) => (id ? (orgs.find((o: any) => o.id === id)?.name ?? "—") : "—");

  const now = Date.now();
  const k7d = events.filter((e) => now - new Date(e.at).getTime() < 7 * 86400000).length;
  const kImp = events.filter((e) => (e.action || "").startsWith("impersonate")).length;
  const kCfg = events.filter((e) => ["config_change", "secret_reveal", "role_change"].includes(e.action)).length;

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Segurança" title="Auditoria & Logs"
        sub="Quem fez o quê, quando e por quê. Trilha append-only imutável — visão central para compliance." />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab"><Eye size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Eventos (7 dias)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : k7d}</div><div className="delta">{t("ações registradas")}</div></div>
        <div className="kpi"><div className="lab"><Lock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Impersonações")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : kImp}</div><div className="delta">{t("acessos a clientes")}</div></div>
        <div className="kpi"><div className="lab"><Settings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Mudanças sensíveis")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : kCfg}</div><div className="delta">{t("config · segredo · papel")}</div></div>
        <div className="kpi g"><div className="lab"><ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Imutável")}</div><div className="val" style={{ fontSize: 20 }}>{t("append-only")}</div><div className="delta">{t("não editável")}</div></div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}><div className="pixlab">{t("De")}</div><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}><div className="pixlab">{t("Até")}</div><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}><div className="pixlab">{t("Cliente")}</div>
          <select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">{t("Todos")}</option>{orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Quando")}</th><th>{t("Ator")}</th><th>{t("Ação")}</th><th>{t("Alvo")}</th><th>{t("Cliente")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr>
              : events.length === 0 ? <tr><td colSpan={5}><Empty><p><strong>{t("Sem eventos no período.")}</strong> {t("Ações sensíveis (impersonação, mudança de config, revelação de segredo) aparecem aqui automaticamente.")}</p></Empty></td></tr>
                : events.map((e) => (
                  <tr key={e.id}>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>{fmtDT(e.at)}</td>
                    <td>{e.actor_email || (e.actor_id ? e.actor_id.slice(0, 8) : t("sistema"))}</td>
                    <td><Pill tone={ACTION_TONE(e.action) as any}>{t(ACTION_LABEL[e.action] || e.action)}</Pill></td>
                    <td className="mt">{[e.target_type, e.target_type === "org" ? orgName(e.target_id) : e.target_id].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{orgName(e.organization_id)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <Lock size={15} />
        <div>{t("Como funciona: cada linha é gravada por trigger em toda ação sensível e é append-only — nada é editável nem apagável. Também aparece no contexto do objeto afetado (ficha do cliente, preço, permissão).")}</div>
      </div>
    </div>
  );
}
