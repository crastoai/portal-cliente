import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync, initials, money, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

type C = { id: string; name: string; commission_default: number; payout_method: string; active: boolean };
type Comm = { org: string; connector: string; sale_amount: number; commission_amount: number; nf_status: string };

export default function Conectores() {
  const { data, reload } = useAsync(async () => {
    const [c, m] = await Promise.all([supabase.from("connectors").select("*").order("name"), supabase.rpc("admin_commissions")]);
    return { conns: (c.data as C[]) ?? [], comms: (m.data as Comm[]) ?? [] };
  }, []);
  const conns = data?.conns ?? []; const comms = data?.comms ?? [];
  const payLabel = (p: string) => (({ nota_fiscal: "Nota Fiscal", permuta: "Permuta", parceria: "Parceria" } as any)[p] || p);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", commission_default: "", payout_method: "nota_fiscal" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function submit() {
    if (!f.name.trim()) { setErr("Informe o nome do conector."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("connectors").insert({ name: f.name.trim(), commission_default: Number(f.commission_default) || 0, payout_method: f.payout_method });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOpen(false); setF({ name: "", commission_default: "", payout_method: "nota_fiscal" }); reload();
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Agentes conectores" sub="Quem indica clientes. Comissão por Nota Fiscal, permuta ou parceria."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setOpen(true)}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo conector</span></button>} />
      <div className="tbl-wrap" style={{ marginBottom: 24 }}>
        <table className="tbl">
          <thead><tr><th>Conector</th><th>Comissão padrão</th><th>Pagamento</th><th>Status</th></tr></thead>
          <tbody>
            {conns.length === 0 ? <tr><td colSpan={4} style={{ color: "var(--crasto-text-muted)" }}>Nenhum conector.</td></tr> : conns.map((c) => (
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
              {comms.map((c, i) => (
                <tr key={i}><td>{c.org}</td><td>{c.connector}</td><td className="tnum">{money(c.sale_amount)}</td><td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-navy)" }}>{money(c.commission_amount)}</td><td><Pill tone={c.nf_status === "paid" ? "ok" : "warn"}>{c.nf_status === "paid" ? "NF emitida · paga" : "Aguardando NF"}</Pill></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal title="Novo agente conector" open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Viver de IA" /></Field>
        <Field label="Comissão padrão (%)"><input type="number" value={f.commission_default} onChange={(e) => setF({ ...f, commission_default: e.target.value })} placeholder="20" /></Field>
        <Field label="Forma de pagamento"><select value={f.payout_method} onChange={(e) => setF({ ...f, payout_method: e.target.value })}><option value="nota_fiscal">Nota Fiscal</option><option value="permuta">Permuta</option><option value="parceria">Parceria</option></select></Field>
      </Modal>
    </div>
  );
}
