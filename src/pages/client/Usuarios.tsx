import { useState } from "react";
import { UserPlus, Boxes } from "lucide-react";
import { services, errorMessage } from "../../services";
import { useAuth } from "../../lib/auth";
import { PageHead, Pill, Empty, useAsync, Avatar, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

type U = { id: string; full_name: string | null; email: string | null; role: string; avatar_url?: string | null };
const EMPTY = { email: "", full_name: "", role: "client_member" };

export default function Usuarios() {
  const { profile } = useAuth();
  const t = useT();
  const isOwner = profile?.role === "client_owner";
  const { data, loading, reload } = useAsync(
    async () => (await services.identity.profiles.listByOrg(profile?.organization_id ?? "")) as unknown as U[],
    [profile?.organization_id]
  );
  const users = data ?? [];
  const roleLabel = (r: string) => (r === "client_owner" ? t("Dono") : r === "client_member" ? t("Membro") : r);
  const roleTone = (r: string) => (r === "client_owner" ? "ok" : "mute");

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");

  // Permissão de módulos por membro (Fase 2 — só o dono libera QUAIS módulos o membro vê).
  const [modUser, setModUser] = useState<U | null>(null);
  const [orgMods, setOrgMods] = useState<{ id: string; label: string }[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [modBusy, setModBusy] = useState(false); const [modErr, setModErr] = useState("");
  function toggleMod(id: string) { setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function openMods(u: U) {
    setModUser(u); setModErr(""); setOrgMods([]); setChecked(new Set());
    try {
      const cms = (await services.delivery.clientModules.listByOrg(profile?.organization_id ?? "")) as any[];
      const seen = new Set<string>();
      const uniq = (cms || []).filter((c) => c.status === "active" && !seen.has(c.vdi_module_id) && seen.add(c.vdi_module_id))
        .map((c) => ({ id: c.vdi_module_id as string, label: (c.label as string) || t("Módulo") }));
      setOrgMods(uniq);
      const acc = await services.delivery.userModules.list(u.id).catch(() => [] as string[]);
      const arr = Array.isArray(acc) ? acc : [];
      // sem restrição (vazio no banco) = todos marcados; com restrição = só os liberados.
      setChecked(new Set(arr.length ? arr : uniq.map((m) => m.id)));
    } catch (e) { setModErr(errorMessage(e)); }
  }
  async function saveMods() {
    if (!modUser) return;
    setModBusy(true); setModErr("");
    try {
      const all = orgMods.map((m) => m.id);
      const sel = all.filter((id) => checked.has(id));
      // todos marcados = sem restrição (limpa); subconjunto = restringe a esses.
      await services.delivery.userModules.set(modUser.id, sel.length === all.length ? [] : sel);
      setModUser(null); setToast(t("Acesso a módulos atualizado ✓")); setTimeout(() => setToast(""), 6000);
    } catch (e) { setModErr(errorMessage(e)); } finally { setModBusy(false); }
  }

  async function submit() {
    if (!f.email.trim()) { setErr(t("Informe o e-mail.")); return; }
    setBusy(true); setErr("");
    const r = await services.identity.users.invite({ email: f.email.trim(), full_name: f.full_name || undefined, role: f.role });
    setBusy(false);
    if (!r.ok) { setErr(r.error || t("Não foi possível convidar.")); return; }
    setOpen(false); setF({ ...EMPTY }); reload();
    setToast(r.email_sent ? t("✉️ Convite enviado para {e}.", { e: f.email.trim() }) : t("Usuário criado. (e-mail não enviado: {err})", { err: r.email_error || "—" }));
    setTimeout(() => setToast(""), 8000);
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Usuários & Equipe" sub="Convide sua equipe e defina quem acessa o quê."
        right={isOwner ? <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { setF({ ...EMPTY }); setErr(""); setOpen(true); }}><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">{t("Convidar usuário")}</span></button> : undefined} />
      <div className="note"><span>{t("Sua conta suporta vários usuários. Você define o papel de cada um; a Crasto.AI libera as funcionalidades do seu plano.")} {!isOwner && t("Só o dono da conta pode convidar.")}</span></div>
      {loading ? <Empty>Carregando…</Empty> : users.length === 0 ? <Empty>Nenhum usuário.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Usuário")}</th><th>{t("Papel")}</th><th>{t("E-mail")}</th><th>{t("Acesso")}</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><div className="cust"><Avatar name={u.full_name || u.email} url={u.avatar_url} /><div className="nm">{u.full_name || "—"}</div></div></td>
                  <td><Pill tone={roleTone(u.role)}>{roleLabel(u.role)}</Pill></td>
                  <td className="cust"><span className="em">{u.email}</span></td>
                  <td>{isOwner && u.role === "client_member" ? (
                    <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => openMods(u)}><span className="crasto-btn__icon"><Boxes size={14} /></span><span className="crasto-btn__label">{t("Módulos")}</span></button>
                  ) : u.role === "client_owner" ? <span className="em" style={{ opacity: .6 }}>{t("vê tudo")}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={t("Convidar usuário")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? t("Enviando…") : t("Enviar convite")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="E-mail *"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="pessoa@empresa.com" /></Field>
        <Field label="Nome"><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder={t("Nome da pessoa")} /></Field>
        <Field label="Papel"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="client_member">{t("Membro (usa o portal)")}</option><option value="client_owner">{t("Dono (gerencia a conta)")}</option></select></Field>
        <div className="note" style={{ marginTop: 4 }}><span>{t("A pessoa recebe um e-mail de acesso da Crasto.AI e define a própria senha no primeiro login.")}</span></div>
      </Modal>
      <Modal title={t("Módulos de {n}", { n: modUser?.full_name || modUser?.email || "" })} open={!!modUser} onClose={() => setModUser(null)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setModUser(null)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={modBusy} onClick={saveMods}><span className="crasto-btn__label">{modBusy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        {modErr && <div className="formerr">{modErr}</div>}
        <div className="note" style={{ marginBottom: 10 }}><span>{t("Marque os módulos que este membro pode ver na sidebar. Todos marcados = vê tudo do plano.")}</span></div>
        {orgMods.length === 0 ? <Empty>{t("Nenhum módulo ativo na conta.")}</Empty> : orgMods.map((m) => (
          <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", cursor: "pointer", borderTop: "1px solid var(--crasto-border-soft)" }}>
            <input type="checkbox" checked={checked.has(m.id)} onChange={() => toggleMod(m.id)} />
            <span>{m.label}</span>
          </label>
        ))}
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
