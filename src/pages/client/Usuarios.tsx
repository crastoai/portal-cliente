import { useState } from "react";
import { UserPlus } from "lucide-react";
import { services, errorMessage } from "../../services";
import { useAuth } from "../../lib/auth";
import { PageHead, Pill, Empty, useAsync, initials, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

type U = { id: string; full_name: string | null; email: string | null; role: string };
const EMPTY = { email: "", full_name: "", role: "client_member" };

export default function Usuarios() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "client_owner";
  const { data, loading, reload } = useAsync(
    async () => (await services.identity.profiles.listByOrg(profile?.organization_id ?? "")) as unknown as U[],
    [profile?.organization_id]
  );
  const users = data ?? [];
  const roleLabel = (r: string) => (r === "client_owner" ? "Dono" : r === "client_member" ? "Membro" : r);
  const roleTone = (r: string) => (r === "client_owner" ? "ok" : "mute");

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");

  async function submit() {
    if (!f.email.trim()) { setErr("Informe o e-mail."); return; }
    setBusy(true); setErr("");
    const r = await services.identity.users.invite({ email: f.email.trim(), full_name: f.full_name || undefined, role: f.role });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Não foi possível convidar."); return; }
    setOpen(false); setF({ ...EMPTY }); reload();
    setToast(r.email_sent ? `✉️ Convite enviado para ${f.email.trim()}.` : `Usuário criado. (e-mail não enviado: ${r.email_error || "—"})`);
    setTimeout(() => setToast(""), 8000);
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Usuários & Equipe" sub="Convide sua equipe e defina quem acessa o quê."
        right={isOwner ? <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { setF({ ...EMPTY }); setErr(""); setOpen(true); }}><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">Convidar usuário</span></button> : undefined} />
      <div className="note"><span>Sua conta suporta <b>vários usuários</b>. Você define o papel de cada um; a Crasto.AI libera as funcionalidades do seu plano. {!isOwner && "Só o dono da conta pode convidar."}</span></div>
      {loading ? <Empty>Carregando…</Empty> : users.length === 0 ? <Empty>Nenhum usuário.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Usuário</th><th>Papel</th><th>E-mail</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><div className="cust"><div className="logo" style={{ background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)" }}>{initials(u.full_name || u.email)}</div><div className="nm">{u.full_name || "—"}</div></div></td>
                  <td><Pill tone={roleTone(u.role)}>{roleLabel(u.role)}</Pill></td>
                  <td className="cust"><span className="em">{u.email}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="Convidar usuário" open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? "Enviando…" : "Enviar convite"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="E-mail *"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="pessoa@empresa.com" /></Field>
        <Field label="Nome"><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="Nome da pessoa" /></Field>
        <Field label="Papel"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="client_member">Membro (usa o portal)</option><option value="client_owner">Dono (gerencia a conta)</option></select></Field>
        <div className="note" style={{ marginTop: 4 }}><span>A pessoa recebe um <b>e-mail de acesso da Crasto.AI</b> e define a própria senha no primeiro login.</span></div>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
