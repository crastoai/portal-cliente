import { supabase } from "../../lib/supabase";
import { PageHead, useAsync, money } from "../../ui/ui";

type Over = { mrr: number; profit: number; clients: number; commissions_pending: number };

export default function Receita() {
  const { data } = useAsync(async () => (await supabase.rpc("admin_overview")).data as Over, []);
  const o = data;
  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Receita & churn" sub="Evolução do MRR e rentabilidade." />
      <div className="kpis">
        <div className="kpi navy"><div className="lab">MRR total</div><div className="val tnum">{money(o?.mrr ?? 0)}</div><div className="delta">recorrente</div></div>
        <div className="kpi g"><div className="lab">Lucro estimado</div><div className="val tnum">{money(o?.profit ?? 0)}</div><div className="delta">após impostos 8,64%</div></div>
        <div className="kpi"><div className="lab">Ticket médio</div><div className="val tnum">{money((o?.clients ?? 0) ? (o!.mrr / o!.clients) : 0)}</div><div className="delta">por cliente</div></div>
        <div className="kpi"><div className="lab">Comissões a pagar</div><div className="val tnum">{money(o?.commissions_pending ?? 0)}</div><div className="delta">conectores</div></div>
      </div>
      <div className="card"><h3>Evolução do MRR</h3><div className="csub">O gráfico de evolução aparece conforme os meses acumulam dados reais.</div>
        <div className="empty" style={{ border: "none", padding: "30px 0" }}>Histórico em construção — os dados começam a acumular agora.</div>
      </div>
    </div>
  );
}
