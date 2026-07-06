import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync, money } from "../../ui/ui";

type Comm = { org: string; sale_amount: number; commission_amount: number; nf_status: string };

export default function Comissoes() {
  const { data, loading } = useAsync(async () => await services.analytics.client.connectorCommissions<Comm[]>(), []);
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.commission_amount), 0);
  const paid = rows.filter((r) => r.nf_status === "paid").reduce((s, r) => s + Number(r.commission_amount), 0);
  const pending = total - paid;

  return (
    <div>
      <PageHead eyebrow="Viver de IA · Financeiro" title="Comissões (20%)" sub="20% sobre cada venda da Crasto.AI aos clientes que você indicou." />
      <div className="kpis">
        <div className="kpi navy"><div className="lab">Comissão acumulada</div><div className="val tnum">{money(total)}</div><div className="delta">total</div></div>
        <div className="kpi g"><div className="lab">Já paga</div><div className="val tnum">{money(paid)}</div><div className="delta">NF emitida</div></div>
        <div className="kpi"><div className="lab">A receber</div><div className="val tnum">{money(pending)}</div><div className="delta">aguardando NF</div></div>
        <div className="kpi"><div className="lab">Vendas geradas</div><div className="val tnum">{money(rows.reduce((s, r) => s + Number(r.sale_amount), 0))}</div><div className="delta">base da comissão</div></div>
      </div>
      <div className="note"><span>Para receber, emita a <b>Nota Fiscal</b> contra a Crasto.AI no valor da comissão. Após emitida, a Crasto realiza o pagamento.</span></div>
      <div className="sec-h"><h2>Vendas & comissões por cliente</h2></div>
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty>Nenhuma comissão ainda.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Valor da venda</th><th>Comissão 20%</th><th>Nota Fiscal</th></tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={i}>
                  <td>{c.org}</td>
                  <td className="tnum">{money(c.sale_amount)}</td>
                  <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{money(c.commission_amount)}</td>
                  <td><Pill tone={c.nf_status === "paid" ? "ok" : "warn"}>{c.nf_status === "paid" ? "NF emitida · paga" : "Aguardando NF"}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
