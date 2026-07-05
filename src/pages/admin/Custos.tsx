import { supabase } from "../../lib/supabase";
import { PageHead, useAsync, money } from "../../ui/ui";

type Pnl = { organization_name: string; total_cost: number; total_sale: number; tax: number; profit: number };
type Prov = { provider: string; cost: number };

export default function Custos() {
  const { data } = useAsync(async () => {
    const [p, c] = await Promise.all([supabase.rpc("admin_client_pnl"), supabase.rpc("admin_costs_by_provider")]);
    return { pnl: (p.data as Pnl[]) ?? [], prov: (c.data as Prov[]) ?? [] };
  }, []);
  const pnl = data?.pnl ?? [];
  const prov = data?.prov ?? [];
  const totalSale = pnl.reduce((s, r) => s + Number(r.total_sale), 0);
  const totalCost = pnl.reduce((s, r) => s + Number(r.total_cost), 0);
  const totalTax = pnl.reduce((s, r) => s + Number(r.tax), 0);
  const totalProfit = pnl.reduce((s, r) => s + Number(r.profit), 0);
  const provMax = Math.max(1, ...prov.map((p) => Number(p.cost)));

  return (
    <div>
      <PageHead eyebrow="Painel Admin · Interno 🔒" title="Custos & Despesas" sub="Custo real por cliente e o plano de contas com lucro." />
      <div className="note"><span>Tela <b>interna</b> — o cliente nunca vê custo, imposto nem margem.</span></div>

      <div className="sec-h"><h2>Gasto por plataforma</h2></div>
      <div className="assign" style={{ marginBottom: 26 }}>
        {prov.map((p) => (
          <div className="arow" key={p.provider}>
            <span className="t" style={{ textTransform: "capitalize", minWidth: 90 }}>{p.provider}</span>
            <span style={{ flex: 1, height: 8, background: "var(--crasto-bg-3)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(Number(p.cost) / provMax) * 100}%`, background: "linear-gradient(90deg,#6E9CE8,#3E6FB8)" }} /></span>
            <span className="tnum" style={{ fontWeight: 700, color: "var(--crasto-navy)" }}>{money(p.cost)}</span>
          </div>
        ))}
      </div>

      <div className="sec-h"><h2>Plano de contas por cliente</h2><span className="pill info"><span className="d" />impostos NF 8,64%</span></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Custo</th><th>Venda</th><th>Impostos 8,64%</th><th>Lucro</th></tr></thead>
          <tbody>
            {pnl.map((r) => (
              <tr key={r.organization_name}>
                <td><div className="cust"><div className="nm">{r.organization_name}</div></div></td>
                <td className="tnum" style={{ color: "var(--crasto-danger)", fontWeight: 600 }}>{money(r.total_cost)}</td>
                <td className="tnum" style={{ color: "var(--crasto-success)", fontWeight: 600 }}>{money(r.total_sale)}</td>
                <td className="tnum">{money(r.tax)}</td>
                <td className="tnum" style={{ color: "var(--crasto-navy)", fontWeight: 700 }}>{money(r.profit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="tnum">{money(totalCost)}</td><td className="tnum">{money(totalSale)}</td><td className="tnum">{money(totalTax)}</td><td className="tnum">{money(totalProfit)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
