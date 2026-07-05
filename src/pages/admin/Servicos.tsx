import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Empty, useAsync, money, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

type S = { id: string; name: string; category: string | null; unit: string; price_table: number; base_commission: number };

export default function Servicos() {
  const { data, loading, reload } = useAsync(async () => (await supabase.schema("catalog").from("services").select("*").order("category")).data as S[], []);
  const rows = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", category: "", unit: "mensal", price_table: "", base_commission: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function submit() {
    if (!f.name.trim()) { setErr("Informe o nome do serviço."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.schema("catalog").from("services").insert({ name: f.name.trim(), category: f.category || null, unit: f.unit, price_table: Number(f.price_table) || 0, base_commission: Number(f.base_commission) || 0 });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOpen(false); setF({ name: "", category: "", unit: "mensal", price_table: "", base_commission: "" }); reload();
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Serviços & preços" sub="Catálogo de serviços da Crasto.AI. Preço de tabela = base, ajustável por cliente."
        right={<><button className="crasto-btn crasto-btn--secondary crasto-btn--sm"><span className="crasto-btn__icon"><Upload size={15} /></span><span className="crasto-btn__label">Importar documento</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setOpen(true)}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo serviço</span></button></>} />
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>Nenhum serviço.</strong> Clique em "Novo serviço" ou importe seu catálogo.</p></Empty> : (
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
      <Modal title="Novo serviço" open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Implantação WhatsApp CRM" /></Field>
        <Field label="Categoria"><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Implantação, Suporte, Marketing…" /></Field>
        <Field label="Unidade"><select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option value="mensal">Mensal</option><option value="hora">Hora</option><option value="projeto">Projeto</option><option value="setup_unico">Setup único</option></select></Field>
        <Field label="Preço de tabela (R$)"><input type="number" value={f.price_table} onChange={(e) => setF({ ...f, price_table: e.target.value })} placeholder="0" /></Field>
        <Field label="Comissão-base (%)"><input type="number" value={f.base_commission} onChange={(e) => setF({ ...f, base_commission: e.target.value })} placeholder="0" /></Field>
      </Modal>
    </div>
  );
}
