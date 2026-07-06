import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, initials, money, Field } from "../../ui/ui";
import { useSettings } from "../../lib/settings";
import Modal from "../../ui/Modal";

type C = {
  id: string; name: string; agent_type: string; commission_default: number; active: boolean;
  email: string | null; phone_country_code: string | null; phone: string | null;
  payment_method: string; payment_details: string | null; issues_invoice: boolean;
  payment_handling: string; contract_months: number; notes: string | null;
};
type Comm = { org: string; connector: string; sale_amount: number; commission_amount: number; nf_status: string };
const EMPTY = {
  id: "", name: "", agent_type: "indicador", commission_default: "20", active: true,
  email: "", phone_country_code: "+55", phone: "", payment_method: "pix", payment_details: "",
  issues_invoice: false, payment_handling: "nota_fiscal", contract_months: "12", notes: "",
};

const PAYM = { pix: "Pix", bank: "Conta bancária", bitcoin: "Bitcoin", other: "Outro" } as const;
const HANDL = { nota_fiscal: "Com Nota Fiscal", por_fora: "Por fora", reembolso: "Reembolso de despesas" } as const;

export default function Conectores() {
  const { commissionIndicador, commissionConector } = useSettings();
  const { data, reload } = useAsync(async () => {
    const [c, m] = await Promise.all([api.identity.connectors.list(), api.analytics.admin.commissions<Comm[]>()]);
    return { conns: (c as unknown as C[]) ?? [], comms: m ?? [] };
  }, []);
  const conns = data?.conns ?? []; const comms = data?.comms ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");
  const editing = !!f.id;

  function openNew() { setF({ ...EMPTY, commission_default: String(commissionIndicador) }); setErr(""); setOpen(true); }
  function openEdit(c: C) {
    setF({
      id: c.id, name: c.name, agent_type: c.agent_type ?? "indicador", commission_default: String(c.commission_default),
      active: c.active, email: c.email ?? "", phone_country_code: c.phone_country_code ?? "+55", phone: c.phone ?? "",
      payment_method: c.payment_method ?? "pix", payment_details: c.payment_details ?? "", issues_invoice: !!c.issues_invoice,
      payment_handling: c.payment_handling ?? "nota_fiscal", contract_months: String(c.contract_months ?? 12), notes: c.notes ?? "",
    });
    setErr(""); setOpen(true);
  }
  // trocar o tipo ajusta a comissão padrão (indicador 20% / conector 5%)
  function setType(t: string) { setF((p: any) => ({ ...p, agent_type: t, commission_default: String(t === "indicador" ? commissionIndicador : commissionConector) })); }

  async function submit() {
    if (!f.name.trim()) { setErr("Informe o nome do agente."); return; }
    setBusy(true); setErr("");
    const payload = {
      name: f.name.trim(), agent_type: f.agent_type, commission_default: Number(f.commission_default) || 0, active: f.active,
      email: f.email || null, phone_country_code: f.phone_country_code || "+55", phone: f.phone || null,
      payment_method: f.payment_method, payment_details: f.payment_details || null, issues_invoice: !!f.issues_invoice,
      payment_handling: f.payment_handling, contract_months: Number(f.contract_months) || 12, notes: f.notes || null,
    };
    try {
      if (editing) await api.identity.connectors.update(f.id, payload);
      else await api.identity.connectors.create(payload);
      setOpen(false); reload();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function del(c: C) {
    if (!confirm(`Excluir o agente "${c.name}"?`)) return;
    try { await api.identity.connectors.remove(c.id); reload(); }
    catch { setToast("Não foi possível excluir (agente com clientes indicados?)."); setTimeout(() => setToast(""), 6000); }
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Agentes indicadores" sub={`Quem indica clientes. Indicador (participa) = ${commissionIndicador}% · Conector (só apresentou) = ${commissionConector}% no contrato de 1 ano.`}
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo agente</span></button>} />
      <div className="tbl-wrap" style={{ marginBottom: 24 }}>
        <table className="tbl">
          <thead><tr><th>Agente</th><th>Tipo</th><th>Comissão</th><th>Recebimento</th><th>NF</th><th>Contrato</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {conns.length === 0 ? <tr><td colSpan={8} style={{ color: "var(--crasto-text-muted)" }}>Nenhum agente cadastrado.</td></tr> : conns.map((c) => (
              <tr key={c.id}>
                <td><div className="cust"><div className="logo">{initials(c.name)}</div><div><div className="nm">{c.name}</div><div className="em">{c.email || (c.phone ? `${c.phone_country_code} ${c.phone}` : "—")}</div></div></div></td>
                <td><Pill tone={c.agent_type === "indicador" ? "ok" : "info"}>{c.agent_type === "indicador" ? "Indicador" : "Conector"}</Pill></td>
                <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{c.commission_default}%</td>
                <td>{(PAYM as any)[c.payment_method] || c.payment_method}<div style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}>{(HANDL as any)[c.payment_handling] || c.payment_handling}</div></td>
                <td><Pill tone={c.issues_invoice ? "ok" : "mute"}>{c.issues_invoice ? "Emite" : "Não"}</Pill></td>
                <td className="tnum">{c.contract_months}m</td>
                <td><Pill tone={c.active ? "ok" : "mute"}>{c.active ? "Ativo" : "Inativo"}</Pill></td>
                <td><div style={{ display: "flex", gap: 6 }}><button className="icobtn" title="Editar" onClick={() => openEdit(c)}><Pencil size={14} /></button><button className="icobtn" title="Excluir" onClick={() => del(c)}><Trash2 size={14} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sec-h"><h2>Comissões a pagar</h2></div>
      {comms.length === 0 ? <Empty>Nenhuma comissão registrada.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Agente</th><th>Venda</th><th>Comissão</th><th>Nota Fiscal</th></tr></thead>
            <tbody>
              {comms.map((c, i) => (
                <tr key={i}><td>{c.org}</td><td>{c.connector}</td><td className="tnum">{money(c.sale_amount)}</td><td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{money(c.commission_amount)}</td><td><Pill tone={c.nf_status === "paid" ? "ok" : "warn"}>{c.nf_status === "paid" ? "NF emitida · paga" : "Aguardando NF"}</Pill></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal title={editing ? "Editar agente indicador" : "Novo agente indicador"} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: João da Silva / Viver de IA" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Tipo de agente"><select value={f.agent_type} onChange={(e) => setType(e.target.value)}><option value="indicador">Indicador (participa) — {commissionIndicador}%</option><option value="conector">Conector (só apresentou) — {commissionConector}%</option></select></Field>
          <Field label="Comissão (%)"><input type="number" value={f.commission_default} onChange={(e) => setF({ ...f, commission_default: e.target.value })} placeholder="20" /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="E-mail"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nome@email.com" /></Field>
          <Field label="Telefone"><div style={{ display: "flex", gap: 6 }}><input value={f.phone_country_code} onChange={(e) => setF({ ...f, phone_country_code: e.target.value })} style={{ width: 64 }} placeholder="+55" /><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(11) 90000-0000" /></div></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Forma de recebimento"><select value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}><option value="pix">Pix</option><option value="bank">Conta bancária</option><option value="bitcoin">Bitcoin</option><option value="other">Outro</option></select></Field>
          <Field label="Como a Crasto paga"><select value={f.payment_handling} onChange={(e) => setF({ ...f, payment_handling: e.target.value })}><option value="nota_fiscal">Com Nota Fiscal</option><option value="por_fora">Por fora</option><option value="reembolso">Reembolso de despesas</option></select></Field>
        </div>
        <Field label="Dados de recebimento (chave Pix / conta / carteira)"><input value={f.payment_details} onChange={(e) => setF({ ...f, payment_details: e.target.value })} placeholder="Ex.: chave Pix, banco/agência/conta, endereço da carteira…" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Emite Nota Fiscal para receber?"><select value={f.issues_invoice ? "1" : "0"} onChange={(e) => setF({ ...f, issues_invoice: e.target.value === "1" })}><option value="0">Não</option><option value="1">Sim</option></select></Field>
          <Field label="Validade do contrato (meses)"><input type="number" value={f.contract_months} onChange={(e) => setF({ ...f, contract_months: e.target.value })} placeholder="12" /></Field>
        </div>
        <div className="note"><span>A comissão é paga <b>proporcionalmente ao recebimento</b> de cada parcela no sistema, dentro da validade do contrato. Após o período, novas indicações ficam em aberto para renegociar.</span></div>
        <Field label="Notas (opcional)"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Observações sobre o acordo com o agente." /></Field>
        <Field label="Status"><select value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
