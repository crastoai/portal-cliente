import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync, initials, money } from "../../ui/ui";

type C = { id: string; name: string; commission_default: number; payout_method: string; active: boolean };
type Comm = { org: string; connector: string; sale_amount: number; commission_amount: number; nf_status: string };

export default function Conectores() {
  const { data } = useAsync(async () => {
    const [c, m] = await Promise.all([
      supabase.from("connectors").select("*").order("name"),
      supabase.rpc("admin_commissions"),
    ]);
    return { conns: (c.data as C[]) ?? [], comms: (m.data as Comm[]) ?? [] };
  }, []);
  const conns = data?.conns ?? [];
  const comms = data?.comms ?? [];
  const payLabel = (p: string) => (({ nota_fiscal: "Nota Fiscal", permuta: "Permuta", parceria: "Parceria" } as any)[p] || p);

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Agentes conectores" sub="Quem indica clientes. Comissão por Nota Fiscal, permuta ou parceria."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo conector</span></button>} />
      <div className="tbl-wrap" style={{ marginBottom: 24 }}>
        <table className="tbl">
          <thead><tr><th>Conector</th><th>Comissão padrão</th><th>Pagamento</th><th>Status</th></tr></thead>
          <tbody>
            {conns.map((c) => (
              <tr key={c.id}>
                <td><div className="cust"><div className="logo">{initials(c.name)}</div><div className="nm">{c.name}</div></div></td>
                <td className="tnum">{c.commission_default}%</td>
                <td><Pill tone="info">{payLabel(c.payout_method)}</Pill></td>
                <td><Pill tone={c.active ? "ok" : "mute"}>{c.active ? "Ativo" : "Inativo"}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sec-h"><h2>Comissões a pagar</h2></div>
      {comms.length === 0 ? <Empty>Nenhuma comissão registrada.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Conector</th><th>Venda</th><th>Comissão</th><th>Nota Fiscal</th></tr></thead>
            <tbody>
              {comms.map((c, idx) => (
                <tr key={idx}>
                  <td>{c.org}</td><td>{c.connector}</td>
                  <td className="tnum">{money(c.sale_amount)}</td>
                  <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-navy)" }}>{money(c.commission_amount)}</td>
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
