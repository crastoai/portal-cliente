import { useState } from "react";
import { Plus, Upload, Pencil, Trash2, Lock } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, money, Field } from "../../ui/ui";
import { TAX_RATE, taxOf } from "../../lib/config";
import Modal from "../../ui/Modal";

type S = { id: string; name: string; category: string | null; unit: string; price_table: number; price_min: number | null; price_max: number | null; base_commission: number; internal: boolean; notes: string | null };
const EMPTY = { id: "", name: "", category: "", unit: "mensal", price_table: "", price_min: "", price_max: "", base_commission: "", internal: false, notes: "" };

export default function Servicos() {
  const { data, loading, reload } = useAsync(async () => (await api.catalog.services.list()) as unknown as S[], []);
  const rows = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");
  const editing = !!f.id;

  function openNew() { setF({ ...EMPTY }); setErr(""); setOpen(true); }
  function openEdit(s: S) { setF({ id: s.id, name: s.name, category: s.category ?? "", unit: s.unit, price_table: String(s.price_table), price_min: s.price_min != null ? String(s.price_min) : "", price_max: s.price_max != null ? String(s.price_max) : "", base_commission: String(s.base_commission), internal: !!s.internal, notes: s.notes ?? "" }); setErr(""); setOpen(true); }

  async function submit() {
    if (!f.name.trim()) { setErr("Informe o nome do serviço."); return; }
    setBusy(true); setErr("");
    const price = Number(f.price_table) || 0;
    const payload = {
      name: f.name.trim(), category: f.category || null, unit: f.unit,
      price_table: price,
      price_min: f.price_min !== "" ? Number(f.price_min) : price,
      price_max: f.price_max !== "" ? Number(f.price_max) : price,
      base_commission: Number(f.base_commission) || 0,
      internal: !!f.internal, notes: f.notes || null,
    };
    try {
      if (editing) await api.catalog.services.update(f.id, payload);
      else await api.catalog.services.create(payload);
      setOpen(false); reload();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function del(s: S) {
    if (!confirm(`Excluir o serviço "${s.name}"?`)) return;
    try { await api.catalog.services.remove(s.id); reload(); }
    catch { setToast("Não foi possível excluir."); setTimeout(() => setToast(""), 5000); }
  }

  const range = (r: S) => (r.price_min != null && r.price_max != null && r.price_min !== r.price_max) ? `${money(r.price_min)}–${money(r.price_max)}` : null;

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Serviços & preços" sub="Base oficial de preços da Crasto.AI. Preço-âncora + faixa (mín–máx); imposto padrão exibido à parte."
        right={<><button className="crasto-btn crasto-btn--secondary crasto-btn--sm"><span className="crasto-btn__icon"><Upload size={15} /></span><span className="crasto-btn__label">Importar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo serviço</span></button></>} />
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>Nenhum serviço.</strong> Clique em "Novo serviço".</p></Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Serviço</th><th>Categoria</th><th>Unidade</th><th>Preço-âncora</th><th>Faixa</th><th>Imposto ({String(TAX_RATE).replace(".", ",")}%)</th><th>Líquido</th><th>Comissão</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const imp = taxOf(r.price_table);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: "var(--crasto-navy)" }}>{r.name}{r.internal && <Lock size={12} title="Interno (remix VdI)" style={{ verticalAlign: -1, marginLeft: 6, color: "var(--crasto-text-muted)" }} />}</td>
                    <td><span className="chip">{r.category}</span></td>
                    <td>{r.unit.replace("_", " ")}</td>
                    <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-navy)" }}>{money(r.price_table)}</td>
                    <td className="tnum" style={{ color: "var(--crasto-text-muted)", fontSize: 12 }}>{range(r) || "—"}</td>
                    <td className="tnum" style={{ color: "var(--crasto-danger)" }}>{money(imp)}</td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-success)" }}>{money(r.price_table - imp)}</td>
                    <td className="tnum">{r.base_commission}%</td>
                    <td><div style={{ display: "flex", gap: 6 }}><button className="icobtn" title="Editar" onClick={() => openEdit(r)}><Pencil size={14} /></button><button className="icobtn" title="Excluir" onClick={() => del(r)}><Trash2 size={14} /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal title={editing ? "Editar serviço" : "Novo serviço"} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Implantação WhatsApp CRM" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Categoria"><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Recorrente, Avulso, Suporte…" /></Field>
          <Field label="Unidade"><select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option value="mensal">Mensal</option><option value="hora">Hora</option><option value="projeto">Projeto</option><option value="setup_unico">Setup único</option></select></Field>
        </div>
        <Field label="Preço-âncora (R$) — valor mais comum"><input type="number" value={f.price_table} onChange={(e) => setF({ ...f, price_table: e.target.value })} placeholder="0" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Preço mínimo (R$)"><input type="number" value={f.price_min} onChange={(e) => setF({ ...f, price_min: e.target.value })} placeholder="= âncora se vazio" /></Field>
          <Field label="Preço máximo (R$)"><input type="number" value={f.price_max} onChange={(e) => setF({ ...f, price_max: e.target.value })} placeholder="= âncora se vazio" /></Field>
        </div>
        <Field label="Comissão-base (%)"><input type="number" value={f.base_commission} onChange={(e) => setF({ ...f, base_commission: e.target.value })} placeholder="0" /></Field>
        {f.price_table !== "" && <div className="note" style={{ marginTop: 4 }}><span>Imposto ({String(TAX_RATE).replace(".", ",")}%): <b>{money(taxOf(Number(f.price_table)))}</b> · Líquido: <b>{money((Number(f.price_table) || 0) - taxOf(Number(f.price_table)))}</b></span></div>}
        <Field label="Notas (opcional)"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Observações internas do serviço." /></Field>
        <label className="frow" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={f.internal} onChange={(e) => setF({ ...f, internal: e.target.checked })} style={{ width: "auto" }} />
          <span style={{ margin: 0 }}>🔒 Interno (remix do Viver de IA — o cliente nunca vê a origem)</span>
        </label>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
