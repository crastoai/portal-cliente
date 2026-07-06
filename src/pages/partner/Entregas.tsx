import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync, initials } from "../../ui/ui";
import { useT } from "../../lib/i18n";

type Row = { id: string; name: string; progress: number | null; status: string | null; health: string | null; mods: number };

export default function Entregas() {
  const t = useT();
  const { data, loading } = useAsync(async () => {
    const [o, i, h, cm] = await Promise.all([
      services.identity.organizations.listBrief(),
      services.delivery.implementations.listBrief(),
      services.delivery.systemHealth.listBrief(),
      services.delivery.clientModules.listAll(),
    ]);
    const im = Object.fromEntries((i as any[]).map((r) => [r.organization_id, r]));
    const hm = Object.fromEntries((h as any[]).map((r) => [r.organization_id, r.status]));
    const counts: Record<string, number> = {};
    (cm as any[]).forEach((r) => (counts[r.organization_id] = (counts[r.organization_id] || 0) + 1));
    return (o as any[]).map((r) => ({ id: r.id, name: r.name, progress: im[r.id]?.overall_progress ?? null, status: im[r.id]?.status ?? null, health: hm[r.id] ?? null, mods: counts[r.id] || 0 }));
  }, []);
  const rows = data ?? [];
  const delivered = rows.filter((r) => r.status === "delivered").length;

  return (
    <div>
      <PageHead eyebrow="Viver de IA · Compliance" title="Entregas dos seus indicados" sub="Acompanhe o andamento e o prazo de cada cliente que você indicou à Crasto.AI." />
      <div className="kpis">
        <div className="kpi navy"><div className="lab">{t("Clientes indicados")}</div><div className="val tnum">{rows.length}</div><div className="delta">{t("no portal")}</div></div>
        <div className="kpi g"><div className="lab">{t("Entregues")}</div><div className="val tnum">{delivered}</div><div className="delta">{t("100% no contrato")}</div></div>
        <div className="kpi"><div className="lab">{t("Em andamento")}</div><div className="val tnum">{rows.length - delivered}</div><div className="delta">{t("implantação")}</div></div>
        <div className="kpi"><div className="lab">{t("Módulos entregues")}</div><div className="val tnum">{rows.reduce((s, r) => s + r.mods, 0)}</div><div className="delta">{t("total")}</div></div>
      </div>
      <div className="sec-h"><h2>{t("Andamento por cliente")}</h2><Pill tone="mute">{t("Somente leitura")}</Pill></div>
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty>Você ainda não indicou clientes.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Cliente indicado")}</th><th>{t("Módulos")}</th><th>{t("Progresso")}</th><th>{t("Status")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><div className="cust"><div className="logo">{initials(r.name)}</div><div className="nm">{r.name}</div></div></td>
                  <td className="tnum">{t("{n} módulos", { n: r.mods })}</td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="barmini"><span style={{ width: `${r.progress ?? 0}%`, background: (r.progress ?? 0) >= 100 ? "#1F8A5B" : "#3E6FB8" }} /></div><span className="tnum" style={{ fontSize: 12, fontWeight: 600 }}>{r.progress ?? 0}%</span></div></td>
                  <td><Pill tone={r.status === "delivered" ? "ok" : "info"}>{r.status === "delivered" ? t("Concluído") : t("Em andamento")}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
