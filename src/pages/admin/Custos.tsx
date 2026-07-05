import { supabase } from "../../lib/supabase";
import { PageHead, Pill, useAsync, money } from "../../ui/ui";

type Pnl = { organization_name: string; total_cost: number; total_sale: number; tax: number; profit: number };
type Prov = { provider: string; cost: number };
type Hours = { org: string; plan_hours: number; used_hours: number; balance: number; status: string };

export default function Custos() {
  const { data } = useAsync(async () => {
    const [p, c, h] = await Promise.all([
      supabase.rpc("admin_client_pnl"), supabase.rpc("admin_costs_by_provider"), supabase.rpc("admin_support_hours"),
    ]);
    return { pnl: (p.data as Pnl[]) ?? [], prov: (c.data as Prov[]) ?? [], hours: (h.data as Hours[]) ?? [] };
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
  const hoursLabel = (s: string) => (({ no_plano: "No plano", esgotado: "Esgotado", extra: "Extra a cobrar", antecipado: "Antecipado" } as any)[s] || s);

  return (
    <div>
      <PageHead eyebrow="Painel Admin · Interno 🔒" title="Custos & Despesas" sub="Custo real por cliente — IA, servidor e suporte — e o plano de contas com lucro." />
      <div className="note"><span>Tela <b>interna</b> — o cliente nunca vê custo, imposto nem margem.</span></div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <div className="filt"><span>Cliente</span><select><option>Todos os clientes</option>{pnl.map((p) => <option key={p.organization_name}>{p.organization_name}</option>)}</select></div>
        <div className="filt"><span>Plataforma</span><select><option>Todas</option>{prov.map((p) => <option key={p.provider}>{p.provider}</option>)}<option>Servidor / VPS</option></select></div>
        <div className="filt"><span>Período</span><select><option>Últimos 30 dias</option><option>Este mês</option><option>Trimestre</option></select></div>
      </div>

      <div className="kpis">
        <div className="kpi navy"><div className="lab">Custo total (30d)</div><div className="val tnum">{money(provTotal)}</div><div className="delta">IA + infra + suporte</div></div>
        <div className="kpi"><div className="lab">Custo médio / cliente</div><div className="val tnum">{money(pnl.length ? totalCost / pnl.length : 0)}</div><div className="delta">sobre {pnl.length} clientes</div></div>
        <div className="kpi g"><div className="lab">Lucro líquido (30d)</div><div className="val tnum">{money(totalProfit)}</div><div className="delta">após impostos</div></div>
        <div className="kpi"><div className="lab">Margem líquida</div><div className="val tnum">{margin}<small>%</small></div><div className="delta">saudável</div></div>
      </div>

      <div className="sec-h"><h2>Gasto por plataforma</h2><Pill tone="mute">ambiente todo</Pill></div>
      <div className="assign" style={{ marginBottom: 26 }}>
        {prov.length === 0 ? <div className="arow"><span className="s">Sem consumo registrado.</span></div> : prov.map((p) => (
          <div className="arow" key={p.provider}>
            <span className="t" style={{ textTransform: "capitalize", minWidth: 90 }}>{p.provider}</span>
            <span style={{ flex: 1, height: 8, background: "var(--crasto-bg-3)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(Number(p.cost) / provMax) * 100}%`, background: "linear-gradient(90deg,#6E9CE8,#3E6FB8)" }} /></span>
            <span className="tnum" style={{ fontWeight: 700, color: "var(--crasto-navy)" }}>{money(p.cost)}</span>
          </div>
        ))}
      </div>

      <div className="sec-h"><h2>Plano de contas por cliente</h2><Pill tone="info">impostos NF 8,64%</Pill></div>
      <div className="tbl-wrap" style={{ marginBottom: 26 }}>
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Custo (IA+infra+sup.)</th><th>Valor de venda</th><th>Impostos 8,64%</th><th>Lucro</th></tr></thead>
          <tbody>
            {pnl.length === 0 ? <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)" }}>Sem dados ainda.</td></tr> : pnl.map((r) => (
              <tr key={r.organization_name}>
                <td><div className="cust"><div className="nm">{r.organization_name}</div></div></td>
                <td className="tnum" style={{ color: "var(--crasto-danger)", fontWeight: 600 }}>{money(r.total_cost)}</td>
                <td className="tnum" style={{ color: "var(--crasto-success)", fontWeight: 600 }}>{money(r.total_sale)}</td>
                <td className="tnum">{money(r.tax)}</td>
                <td className="tnum" style={{ color: "var(--crasto-navy)", fontWeight: 700 }}>{money(r.profit)}</td>
              </tr>
            ))}
          </tbody>
          {pnl.length > 0 && <tfoot><tr><td>Total</td><td className="tnum">{money(totalCost)}</td><td className="tnum">{money(totalSale)}</td><td className="tnum">{money(totalTax)}</td><td className="tnum">{money(totalProfit)}</td></tr></tfoot>}
        </table>
      </div>

      <div className="sec-h"><h2>Horas de suporte</h2><Pill tone="mute">consumo × plano</Pill></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Plano</th><th>Consumidas</th><th>Saldo</th><th>Situação</th></tr></thead>
          <tbody>
            {hours.length === 0 ? <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)" }}>Sem contratos de suporte ainda.</td></tr> : hours.map((h, i) => (
              <tr key={i}>
                <td><div className="cust"><div className="nm">{h.org}</div></div></td>
                <td style={{ color: "var(--crasto-text-body)" }}>{h.plan_hours}h/mês</td>
                <td className="tnum">{h.used_hours}h</td>
                <td className="tnum" style={{ fontWeight: 700, color: Number(h.balance) < 0 ? "var(--crasto-danger)" : "var(--crasto-navy)" }}>{h.balance}h</td>
                <td><Pill tone={hoursTone(h.status)}>{hoursLabel(h.status)}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
