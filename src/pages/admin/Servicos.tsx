import { Plus, Upload } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Empty, useAsync, money } from "../../ui/ui";

type S = { id: string; name: string; category: string | null; unit: string; price_table: number; base_commission: number };

export default function Servicos() {
  const { data, loading } = useAsync(async () => (await supabase.schema("catalog").from("services").select("*").order("category")).data as S[], []);
  const rows = data ?? [];
  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Serviços & preços" sub="Catálogo de serviços da Crasto.AI. Preço de tabela = base, ajustável por cliente."
        right={<><button className="crasto-btn crasto-btn--secondary crasto-btn--sm"><span className="crasto-btn__icon"><Upload size={15} /></span><span className="crasto-btn__label">Importar documento</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo serviço</span></button></>} />
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty>Faça upload do catálogo de serviços.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Serviço</th><th>Categoria</th><th>Unidade</th><th>Preço de tabela</th><th>Comissão-base</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: "var(--crasto-navy)" }}>{r.name}</td>
                  <td><span className="chip">{r.category}</span></td>
                  <td>{r.unit.replace("_", " ")}</td>
                  <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-navy)" }}>{money(r.price_table)}</td>
                  <td className="tnum">{r.base_commission}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
