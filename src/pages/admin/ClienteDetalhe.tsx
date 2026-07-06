import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Search, Send, Grid3x3, Pencil, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync, initials, money, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

type Org = { id: string; name: string; cnpj: string | null; plan: string | null; status: string };
type Vm = { id: string; name: string; category: string | null };
type CM = { id: string; vdi_module_id: string; status: string };
type U = { id: string; full_name: string | null; email: string | null; role: string };

function icon(cat?: string | null) {
  const c = (cat || "").toLowerCase();
  if (c.includes("atend")) return <MessageCircle size={16} />;
  if (c.includes("market")) return <Send size={16} />;
  if (c.includes("vend")) return <Search size={16} />;
  return <Grid3x3 size={16} />;
}

export default function ClienteDetalhe() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, reload } = useAsync(async () => {
    if (!id) return null;
    const [org, mods, cm, users, impl, health] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", id).maybeSingle(),
      supabase.schema("catalog").from("vdi_modules").select("id,name,category").eq("active", true).order("name"),
      supabase.schema("delivery").from("client_modules").select("id,vdi_module_id,status").eq("organization_id", id),
      supabase.from("profiles").select("id,full_name,email,role").eq("organization_id", id),
      supabase.schema("delivery").from("implementations").select("overall_progress,status").eq("organization_id", id).maybeSingle(),
      supabase.schema("delivery").from("system_health").select("status").eq("organization_id", id).maybeSingle(),
    ]);
    return { org: org.data as Org | null, mods: (mods.data as Vm[]) ?? [], cm: (cm.data as CM[]) ?? [], users: (users.data as U[]) ?? [], progress: (impl.data as any)?.overall_progress ?? 0, health: (health.data as any)?.status ?? null };
  }, [id]);

  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState<Org | null>(null);
  const [invite, setInvite] = useState(false);
  const [inv, setInv] = useState({ email: "", name: "", role: "client_member" });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  if (loading) return <><PageHead eyebrow="Painel Admin" title="Detalhe do cliente" /><Empty>Carregando…</Empty></>;
  if (!data?.org) return <><PageHead eyebrow="Painel Admin" title="Detalhe do cliente" /><Empty>Cliente não encontrado.</Empty></>;

  const { org, mods, cm, users, progress, health } = data;
  const activeSet = new Set(cm.map((c) => c.vdi_module_id));
  const score = Math.max(0, Math.min(100, Math.round(progress * 0.6 + (health === "green" ? 40 : health === "amber" ? 20 : health === "red" ? 0 : 10))));
  const sTone = score >= 70 ? "ok" : score >= 45 ? "warn" : "crit";
  const sLabel = score >= 70 ? "Saudável" : score >= 45 ? "Atenção" : "Em risco";
  const color = sTone === "ok" ? "#1F8A5B" : sTone === "warn" ? "#B8863A" : "#B83A3A";

  async function toggleModule(mid: string, on: boolean) {
    if (on) await supabase.schema("delivery").from("client_modules").delete().eq("organization_id", id).eq("vdi_module_id", mid);
    else await supabase.schema("delivery").from("client_modules").insert({ organization_id: id, vdi_module_id: mid, status: "active" });
    reload();
  }
  async function saveEdit() {
    if (!ef) return;
    setBusy(true);
    await supabase.from("organizations").update({ name: ef.name, cnpj: ef.cnpj, plan: ef.plan, status: ef.status }).eq("id", id);
    setBusy(false); setEdit(false); reload();
    setToast("Dados atualizados ✓"); setTimeout(() => setToast(""), 4000);
  }
  async function del() {
    if (!confirm(`Apagar o cliente "${org.name}"? Isso remove os logins e TODOS os dados dele. Não dá pra desfazer.`)) return;
    setBusy(true);
    const { data: res } = await supabase.functions.invoke("admin-delete-client", { body: { organization_id: id } });
    setBusy(false);
    if ((res as any)?.ok) nav("/admin/clientes", { replace: true });
    else { setToast("Erro ao apagar: " + ((res as any)?.error || "")); setTimeout(() => setToast(""), 6000); }
  }
  async function doInvite() {
    if (!inv.email.trim()) { setErr("Informe o e-mail."); return; }
    setBusy(true); setErr("");
    const { data: res, error } = await supabase.functions.invoke("admin-create-user", { body: { email: inv.email.trim(), full_name: inv.name, organization_id: id, role: inv.role } });
    setBusy(false);
    const r = res as any;
    if (error || !r?.ok) { setErr(r?.error || error?.message || "Erro ao convidar."); return; }
    setInvite(false); setInv({ email: "", name: "", role: "client_member" }); reload();
    setToast(`Usuário criado. Login: ${r.email} · senha: ${r.password}`); setTimeout(() => setToast(""), 16000);
  }

  const roleLabel = (r: string) => (r === "client_owner" ? "Dono" : r === "client_member" ? "Membro" : r);

  return (
    <div>
      <PageHead eyebrow="Detalhe do cliente" title={org.name} sub={`${org.plan || "Sem plano"} · ${org.status}`}
        right={<>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { setEf(org); setEdit(true); }}><span className="crasto-btn__icon"><Pencil size={14} /></span><span className="crasto-btn__label">Editar</span></button>
          <button className="crasto-btn crasto-btn--destructive crasto-btn--sm" onClick={del} disabled={busy}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">Excluir</span></button>
        </>} />

      <div className="kpis" style={{ marginBottom: 22 }}>
        <div className="kpi g"><div className="lab">Health score</div><div className="val tnum">{score}</div><div className="delta">{sLabel}</div></div>
        <div className="kpi"><div className="lab">Implantação</div><div className="val tnum">{progress}<small>%</small></div><div className="delta">progresso</div></div>
        <div className="kpi"><div className="lab">Módulos ativos</div><div className="val tnum">{cm.filter((c) => c.status === "active").length}</div><div className="delta">liberados</div></div>
        <div className="kpi"><div className="lab">Usuários</div><div className="val tnum">{users.length}</div><div className="delta">na conta</div></div>
      </div>

      <div className="sec-h"><h2>Módulos deste cliente</h2><Pill tone="mute">Ative/desative — grava no banco</Pill></div>
      <div className="assign">
        {mods.length === 0 ? <Empty>Cadastre módulos no Catálogo primeiro.</Empty> : mods.map((m) => {
          const on = activeSet.has(m.id);
          return (
            <div className="arow" key={m.id}>
              <span className="ico" style={{ background: on ? "var(--crasto-navy)" : "var(--crasto-text-faint)" }}>{icon(m.category)}</span>
              <span><span className="t">{m.name}</span><br /><span className="s">{on ? "Liberado no portal" : "Não contratado"}</span></span>
              <button className={"sw" + (on ? " on" : "")} onClick={() => toggleModule(m.id, on)} />
            </div>
          );
        })}
      </div>

      <div className="sec-h" style={{ marginTop: 30 }}><h2>Usuários deste cliente</h2>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setInvite(true)}><span className="crasto-btn__icon"><UserPlus size={14} /></span><span className="crasto-btn__label">Convidar usuário</span></button></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Usuário</th><th>Papel</th><th>E-mail</th></tr></thead>
          <tbody>
            {users.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--crasto-text-muted)" }}>Sem usuários — convide o responsável.</td></tr> :
              users.map((u) => (
                <tr key={u.id}>
                  <td><div className="cust"><div className="logo" style={{ background: "var(--crasto-bg-3)", color: "var(--crasto-navy)" }}>{initials(u.full_name || u.email)}</div><div className="nm">{u.full_name || "—"}</div></div></td>
                  <td><Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{roleLabel(u.role)}</Pill></td>
                  <td className="cust"><span className="em">{u.email}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal title="Editar cliente" open={edit && !!ef} onClose={() => setEdit(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setEdit(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveEdit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar"}</span></button></>}>
        {ef && <>
          <Field label="Nome"><input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} /></Field>
          <Field label="CNPJ"><input value={ef.cnpj ?? ""} onChange={(e) => setEf({ ...ef, cnpj: e.target.value })} /></Field>
          <Field label="Plano"><input value={ef.plan ?? ""} onChange={(e) => setEf({ ...ef, plan: e.target.value })} /></Field>
          <Field label="Status"><select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })}><option value="active">Ativo</option><option value="paused">Pausado</option><option value="churned">Cancelado</option></select></Field>
        </>}
      </Modal>

      <Modal title="Convidar usuário" open={invite} onClose={() => setInvite(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setInvite(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={doInvite}><span className="crasto-btn__label">{busy ? "Criando…" : "Criar login"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="E-mail *"><input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="pessoa@empresa.com" /></Field>
        <Field label="Nome"><input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></Field>
        <Field label="Papel"><select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="client_owner">Dono</option><option value="client_member">Membro</option></select></Field>
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
