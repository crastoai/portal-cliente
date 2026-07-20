// Seção "Acesso ao WhatsApp CRM" do detalhe do cliente (admin).
// Só existe se o módulo do WhatsApp CRM estiver ATIVO para este cliente — quem decide
// isso é a API (catalog.vdi_modules.crm_solution + client_modules.status='active'),
// não a tela. Duas coisas acontecem aqui:
//   1) vincular QUAL agente do CRM atende este cliente;
//   2) dizer QUEM da empresa dele pode entrar no CRM (cada um com a própria senha).
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, ExternalLink, Pencil } from "lucide-react";
import { services, errorMessage } from "../../services";
import type { CrmAccessOverview, CrmUser } from "../../services/crmAccess.service";
import { useT } from "../../lib/i18n";
import { Pill, Avatar, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

export function CrmAccessSection({ orgId, onToast }: { orgId: string; onToast: (m: string) => void }) {
  const tr = useT();
  const [d, setD] = useState<CrmAccessOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ email: "", full_name: "", role: "client_member" });
  const [edit, setEdit] = useState<{ id: string; full_name: string; email: string; email0: string; role: string } | null>(null);

  async function load() {
    try { setD(await services.crmAccess.overview(orgId)); } catch (e) { onToast(errorMessage(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  if (!d || !d.enabled) return null; // módulo não contratado → a seção não existe

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); onToast(tr(ok)); await load(); }
    catch (e) { onToast(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function invite() {
    setErr(null);
    if (!f.email.trim()) return setErr(tr("Informe o e-mail."));
    setBusy(true);
    try {
      const r = await services.crmAccess.invite(orgId, { email: f.email.trim(), full_name: f.full_name || undefined, role: f.role });
      setOpen(false);
      setF({ email: "", full_name: "", role: "client_member" });
      onToast(
        r.email_sent
          ? r.password_link_sent ? tr("Acesso liberado — e-mail com o link de senha enviado.") : tr("Acesso liberado — a pessoa já tem senha Crasto.AI; e-mail de aviso enviado.")
          : `${tr("Acesso liberado, mas o e-mail falhou")}: ${r.email_error || "—"}`,
      );
      await load();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!edit) return;
    const em = edit.email.trim();
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setErr(tr("E-mail inválido.")); return; }
    setBusy(true); setErr(null);
    try {
      const r = await services.crmAccess.update(orgId, edit.id, { full_name: edit.full_name.trim(), email: em, role: edit.role });
      setEdit(null);
      onToast(r.email_changed ? tr("Atualizado. O e-mail de login mudou — use “Reenviar” para enviar o acesso ao novo e-mail.") : tr("Usuário atualizado."));
      await load();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const users = d.users.filter((u) => u.role !== "crasto_admin"); // admins da Crasto não são acesso do cliente

  return (
    <>
      <div className="sec-h" style={{ marginTop: 24 }}>
        <h2>{tr("Acesso ao WhatsApp CRM")}</h2>
        <Pill tone="ok">{d.module?.name}</Pill>
        {d.crm_url && <a className="crasto-btn crasto-btn--ghost crasto-btn--sm" href={d.crm_url} target="_blank" rel="noreferrer"><span className="crasto-btn__icon"><ExternalLink size={13} /></span><span className="crasto-btn__label">{tr("Abrir o CRM")}</span></a>}
      </div>

      {d.crm_error && <div className="formerr" style={{ marginBottom: 12 }}>{tr("Não foi possível falar com o CRM")}: {d.crm_error}</div>}

      {/* 1) Agente que atende este cliente */}
      <div className="addrow" style={{ flexWrap: "wrap" }}>
        <select
          value={d.agent_id ?? ""}
          disabled={busy || !d.agents.length}
          onChange={(e) => run(() => services.crmAccess.linkAgent(orgId, e.target.value || null), "Agente vinculado.")}
          style={{ minWidth: 240 }}
        >
          <option value="">{d.agents.length ? tr("Sem agente vinculado…") : tr("Nenhum agente criado no CRM")}</option>
          {d.agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status ? ` · ${a.status}` : ""}</option>)}
        </select>
        <span className="mt" style={{ alignSelf: "center" }}>{tr("qual agente do CRM atende este cliente")}</span>
      </div>

      {/* 2) Quem entra no CRM */}
      <div className="sec-h" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 14 }}>{tr("Usuários do WhatsApp CRM")}</h2>
        <Pill tone="mute">{tr("cada um define a própria senha")}</Pill>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={() => setOpen(true)}>
          <span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Adicionar")}</span>
        </button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{tr("Usuário")}</th><th>{tr("Papel")}</th><th>{tr("E-mail")}</th><th>{tr("Situação")}</th><th></th></tr></thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)" }}>{tr("Ninguém tem acesso ao CRM ainda.")}</td></tr>
            ) : users.map((u: CrmUser) => (
              <tr key={u.id}>
                <td><div className="cust"><Avatar name={u.full_name || u.email} /><div className="nm">{u.full_name || "—"}</div></div></td>
                <td><Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{u.role === "client_owner" ? tr("Dono") : tr("Membro")}</Pill></td>
                <td className="cust"><span className="em">{u.email}</span></td>
                <td><Pill tone={u.online ? "ok" : u.last_seen_at ? "info" : "mute"}>{u.online ? tr("Online") : u.last_seen_at ? tr("Já entrou") : tr("Nunca entrou")}</Pill></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} title={tr("Reenvia o e-mail de acesso (link novo)")}
                    onClick={() => run(() => services.crmAccess.resend(orgId, u.id), "E-mail reenviado.")}>
                    <span className="crasto-btn__icon"><RefreshCw size={13} /></span><span className="crasto-btn__label">{tr("Reenviar")}</span>
                  </button>
                  <button className="icobtn" disabled={busy} title={tr("Editar nome e e-mail")}
                    onClick={() => { setErr(null); setEdit({ id: u.id, full_name: u.full_name || "", email: u.email || "", email0: u.email || "", role: u.role || "client_member" }); }}>
                    <Pencil size={14} />
                  </button>
                  <button className="icobtn rm" disabled={busy} title={tr("Tira o acesso ao CRM (a conta no portal continua)")}
                    onClick={() => { if (confirm(tr("Tirar o acesso desta pessoa ao WhatsApp CRM?"))) run(() => services.crmAccess.revoke(orgId, u.id), "Acesso removido."); }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={tr("Adicionar usuário do WhatsApp CRM")} open={open} onClose={() => setOpen(false)}
        footer={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{tr("Cancelar")}</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={invite}><span className="crasto-btn__label">{busy ? tr("Enviando…") : tr("Liberar acesso")}</span></button>
        </>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="E-mail *"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Nome"><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Papel"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="client_member">{tr("Membro")}</option><option value="client_owner">{tr("Dono")}</option></select></Field>
        <p className="mt" style={{ margin: "10px 2px 0", lineHeight: 1.6 }}>
          {tr("A pessoa recebe um e-mail para definir a própria senha. É a mesma conta Crasto.AI do Portal — quem já tem senha entra com ela.")}
        </p>
      </Modal>

      <Modal title={tr("Editar usuário do WhatsApp CRM")} open={!!edit} onClose={() => setEdit(null)}
        footer={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setEdit(null)}><span className="crasto-btn__label">{tr("Cancelar")}</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveEdit}><span className="crasto-btn__label">{busy ? tr("Salvando…") : tr("Salvar")}</span></button>
        </>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome"><input value={edit?.full_name ?? ""} onChange={(e) => setEdit((s) => s && { ...s, full_name: e.target.value })} /></Field>
        <Field label="E-mail (login) *"><input type="email" value={edit?.email ?? ""} onChange={(e) => setEdit((s) => s && { ...s, email: e.target.value })} /></Field>
        <Field label={tr("Papel")}>
          <select value={edit?.role ?? "client_member"} onChange={(e) => setEdit((s) => s && { ...s, role: e.target.value })}>
            <option value="client_member">{tr("Membro")}</option>
            <option value="client_owner">{tr("Dono")}</option>
          </select>
        </Field>
        {edit?.role === "client_owner" && (
          <p className="mt" style={{ margin: "8px 2px 0", lineHeight: 1.6 }}>
            {tr("Dono vê TODAS as conversas e leads do cliente (não é escopado). Membro vê só o que for atribuído a ele.")}
          </p>
        )}
        {edit && edit.email.trim().toLowerCase() !== edit.email0.trim().toLowerCase() && (
          <p className="mt" style={{ margin: "10px 2px 0", lineHeight: 1.6 }}>
            {tr("Você está mudando o e-mail de LOGIN desta pessoa. Ela passará a entrar com o novo e-mail (a senha continua a mesma). Se ela ainda não definiu senha, use “Reenviar” depois para mandar o link ao novo e-mail.")}
          </p>
        )}
      </Modal>
    </>
  );
}
