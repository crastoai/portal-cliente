import { services } from "../../services";
import { PageHead, Pill, useAsync, money } from "../../ui/ui";
import { useSettings } from "../../lib/settings";
import { fmtRate } from "../../lib/config";
import { useT } from "../../lib/i18n";

type Pnl = { organization_name: string; total_cost: number; total_sale: number; tax: number; profit: number };
type Prov = { provider: string; cost: number };
type Hours = { org: string; plan_hours: number; used_hours: number; balance: number; status: string };

export default function Custos() {
  const { taxRate } = useSettings();
  const t = useT();
  const { data } = useAsync(async () => {
    const [p, c, h] = await Promise.all([
      services.analytics.admin.clientPnl<Pnl[]>(), services.analytics.admin.costsByProvider<Prov[]>(), services.analytics.admin.supportHours<Hours[]>(),
    ]);
    return { pnl: p ?? [], prov: c ?? [], hours: h ?? [] };
  }, []);
  const pnl = data?.pnl ?? []; const prov = data?.prov ?? []; const hours = data?.hours ?? [];

  const totalCost = pnl.reduce((s, r) => s + Number(r.total_cost), 0);
  const totalSale = pnl.reduce((s, r) => s + Number(r.total_sale), 0);
  const totalTax = pnl.reduce((s, r) => s + Number(r.tax), 0);
  const totalProfit = pnl.reduce((s, r) => s + Number(r.profit), 0);
  const provTotal = prov.reduce((s, p) => s + Number(p.cost), 0);
  const provMax = Math.max(1, ...prov.map((p) => Number(p.cost)));
  const margin = totalSale ? Math.round((totalProfit / totalSale) * 100) : 0;
  const hoursTone = (s: string) => (s === "no_plano" ? "ok" : s === "esgotado" ? "warn" : s === "extra" ? "crit" : "info");
  const hoursLabel = (s: string) => (({ no_plano: t("No plano"), esgotado: t("Esgotado"), extra: t("Extra a cobrar"), antecipado: t("Antecipado") } as any)[s] || s);

  return (
    <div className="custospage">
      <PageHead eyebrow="Painel Admin · Interno 🔒" title="Custos & Despesas" sub="Custo real por cliente — IA, servidor e suporte — e o plano de contas com lucro." />
      <div className="note"><span>{t("Tela interna — o cliente nunca vê custo, imposto nem margem.")}</span></div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <div className="filt"><span>{t("Cliente")}</span><select><option>{t("Todos os clientes")}</option>{pnl.map((p) => <option key={p.organization_name}>{p.organization_name}</option>)}</select></div>
        <div className="filt"><span>{t("Plataforma")}</span><select><option>{t("Todas")}</option>{prov.map((p) => <option key={p.provider}>{p.provider}</option>)}<option>{t("Servidor / VPS")}</option></select></div>
        <div className="filt"><span>{t("Período")}</span><select><option>{t("Últimos 30 dias")}</option><option>{t("Este mês")}</option><option>{t("Trimestre")}</option></select></div>
      </div>

      <div className="kpis">
        <div className="kpi navy"><div className="lab">{t("Custo total (30d)")}</div><div className="val tnum">{money(provTotal)}</div><div className="delta">{t("IA + infra + suporte")}</div></div>
        <div className="kpi"><div className="lab">{t("Custo médio / cliente")}</div><div className="val tnum">{money(pnl.length ? totalCost / pnl.length : 0)}</div><div className="delta">{t("sobre {n} clientes", { n: pnl.length })}</div></div>
        <div className="kpi g"><div className="lab">{t("Lucro líquido (30d)")}</div><div className="val tnum">{money(totalProfit)}</div><div className="delta">{t("após impostos")}</div></div>
        <div className="kpi"><div className="lab">{t("Margem líquida")}</div><div className="val tnum">{margin}<small>%</small></div><div className="delta">{t("saudável")}</div></div>
      </div>

      <div className="sec-h"><h2>{t("Gasto por plataforma")}</h2><Pill tone="mute">{t("ambiente todo")}</Pill></div>
      <div className="assign" style={{ marginBottom: 26 }}>
        {prov.length === 0 ? <div className="arow"><span className="s">{t("Sem consumo registrado.")}</span></div> : prov.map((p) => (
          <div className="arow" key={p.provider}>
            <span className="t" style={{ textTransform: "capitalize", minWidth: 90 }}>{p.provider}</span>
            <span style={{ flex: 1, height: 8, background: "var(--crasto-bg-3)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(Number(p.cost) / provMax) * 100}%`, background: "linear-gradient(90deg,#6E9CE8,#3E6FB8)" }} /></span>
            <span className="tnum" style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{money(p.cost)}</span>
          </div>
        ))}
      </div>

      <div className="sec-h"><h2>{t("Plano de contas por cliente")}</h2><Pill tone="info">{t("impostos NF")} {fmtRate(taxRate)}%</Pill></div>
      <div className="tbl-wrap" style={{ marginBottom: 26 }}>
        <table className="tbl">
          <thead><tr><th>{t("Cliente")}</th><th>{t("Custo (IA+infra+sup.)")}</th><th>{t("Valor de venda")}</th><th>{t("Impostos")} {fmtRate(taxRate)}%</th><th>{t("Lucro")}</th></tr></thead>
          <tbody>
            {pnl.length === 0 ? <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)" }}>{t("Sem dados ainda.")}</td></tr> : pnl.map((r) => (
              <tr key={r.organization_name}>
                <td><div className="cust"><div className="nm">{r.organization_name}</div></div></td>
                <td className="tnum" style={{ color: "var(--crasto-danger)", fontWeight: 600 }}>{money(r.total_cost)}</td>
                <td className="tnum" style={{ color: "var(--crasto-success)", fontWeight: 600 }}>{money(r.total_sale)}</td>
                <td className="tnum">{money(r.tax)}</td>
                <td className="tnum" style={{ color: "var(--crasto-text-primary)", fontWeight: 700 }}>{money(r.profit)}</td>
              </tr>
            ))}
          </tbody>
          {pnl.length > 0 && <tfoot><tr><td>{t("Total")}</td><td className="tnum">{money(totalCost)}</td><td className="tnum">{money(totalSale)}</td><td className="tnum">{money(totalTax)}</td><td className="tnum">{money(totalProfit)}</td></tr></tfoot>}
        </table>
      </div>

      <div className="sec-h"><h2>{t("Horas de suporte")}</h2><Pill tone="mute">{t("consumo × plano")}</Pill></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Cliente")}</th><th>{t("Plano")}</th><th>{t("Consumidas")}</th><th>{t("Saldo")}</th><th>{t("Situação")}</th></tr></thead>
          <tbody>
            {hours.length === 0 ? <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)" }}>{t("Sem contratos de suporte ainda.")}</td></tr> : hours.map((h, i) => (
              <tr key={i}>
                <td><div className="cust"><div className="nm">{h.org}</div></div></td>
                <td style={{ color: "var(--crasto-text-body)" }}>{t("{n}h/mês", { n: h.plan_hours })}</td>
                <td className="tnum">{h.used_hours}h</td>
                <td className="tnum" style={{ fontWeight: 700, color: Number(h.balance) < 0 ? "var(--crasto-danger)" : "var(--crasto-text-primary)" }}>{h.balance}h</td>
                <td><Pill tone={hoursTone(h.status)}>{hoursLabel(h.status)}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
