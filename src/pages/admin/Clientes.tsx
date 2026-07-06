import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { PageHead, Empty, useAsync, money, initials, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { fetchClients, healthScore, timeAgo, modShort } from "../../lib/adminData";

export default function Clientes() {
  const { data, loading, reload } = useAsync(fetchClients, []);
  const clients = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", cnpj: "", plan: "", email: "", owner: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  async function submit() {
    if (!f.name.trim()) { setErr("Informe o nome do cliente."); return; }
    setBusy(true); setErr("");
    const { data: res, error } = await supabase.functions.invoke("admin-create-client", {
      body: { name: f.name.trim(), cnpj: f.cnpj, plan: f.plan, owner_email: f.email, owner_name: f.owner || f.name },
    });
    setBusy(false);
    const r = res as any;
    if (error || !r?.ok) { setErr(r?.error || error?.message || "Erro ao criar cliente."); return; }
    let msg = `Cliente "${f.name}" criado.`;
    if (r.owner) msg += `  Login: ${r.owner.email}  ·  senha temporária: ${r.owner.password}`;
    setOpen(false); setF({ name: "", cnpj: "", plan: "", email: "", owner: "" });
    setToast(msg); setTimeout(() => setToast(""), 16000); reload();
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Clientes" sub="Cadastre, edite e acompanhe cada cliente."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setOpen(true)}><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">Cadastrar cliente</span></button>} />

      {loading ? <Empty>Carregando…</Empty> : clients.length === 0 ? <Empty><p><strong>Nenhum cliente cadastrado.</strong> Clique em "Cadastrar cliente" para começar.</p></Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Módulos</th><th>Últ. acesso</th><th>Health score</th><th>MRR</th><th></th></tr></thead>
            <tbody>
              {clients.map((c) => {
                const h = healthScore(c);
                const color = h.tone === "ok" ? "#1F8A5B" : h.tone === "warn" ? "#B8863A" : "#B83A3A";
                return (
                  <tr key={c.id}>
                    <td><div className="cust"><div className="logo">{initials(c.name)}</div><div><div className="nm">{c.name}</div><div className="em">{c.email || "—"}</div></div></div></td>
                    <td><div className="modchips">{(c.modules ?? []).map((m, i) => <span className="chip" key={i}>{modShort(m)}</span>)}</div></td>
                    <td style={{ fontWeight: 500 }}>{timeAgo(c.last_access)}</td>
                    <td><span className="health"><span className="d" style={{ background: color }} />{h.score} · {h.label}</span></td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-navy)" }}>{money(c.mrr)}</td>
                    <td><Link className="sec-h link" to={`/admin/cliente/${c.id}`}>Ver detalhe</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="Cadastrar cliente" open={open} onClose={() => setOpen(false)}
        footer={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Cadastrar"}</span></button>
        </>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome do cliente *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Connect Solar Ltda" /></Field>
        <Field label="CNPJ"><input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} placeholder="00.000.000/0001-00" /></Field>
        <Field label="Plano"><input value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} placeholder="Ex.: Crescimento" /></Field>
        <div style={{ borderTop: "1px solid var(--crasto-border-soft)", margin: "6px 0 12px" }} />
        <Field label="E-mail do responsável (cria o login)"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="responsavel@empresa.com" /></Field>
        <Field label="Nome do responsável"><input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Nome completo" /></Field>
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
