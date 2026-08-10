import { useMemo, useState } from "react";
import { UserPlus, Search, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { services, errorMessage } from "../../services";
import { useAuth } from "../../lib/auth";
import { PageHead, Empty, useAsync, Avatar, Pill } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import UsoModulos from "../../ui/UsoModulos";
import EditarColaborador from "./EditarColaborador";
import type { CollaboratorRow } from "../../services/delivery.service";
import "../../styles/colaboradores.css";

const NIVEL: Record<string, string> = { admin: "Admin", supervisor: "Supervisor", agente: "Agente", visualizador: "Visualizador" };
const TIPO: Record<string, string> = { clt: "CLT", pj: "PJ", estagio: "Estágio", temporario: "Temporário" };

export default function Usuarios() {
  const { profile } = useAuth();
  const t = useT();
  // Quem gerencia a "Gestão de Acessos": o Dono ou um colaborador Admin-level (decisão #4).
  const canManage = profile?.role === "client_owner" || profile?.access_level === "admin";
  const orgId = profile?.organization_id ?? "";

  const { data, loading, reload } = useAsync(async () => {
    if (!orgId || !canManage) return [] as CollaboratorRow[];
    const r = await services.delivery.collaborator.list(orgId);
    return (r?.collaborators ?? []) as CollaboratorRow[];
  }, [orgId, canManage]);
  const users = data ?? [];

  const [q, setQ] = useState("");
  const [tipoF, setTipoF] = useState<"" | "clt" | "pj">("");
  const [edit, setEdit] = useState<{ user: CollaboratorRow | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };

  const funcao = (u: CollaboratorRow) => (u.role === "client_owner" ? t("Dono") : u.access_level ? t(NIVEL[u.access_level] ?? u.access_level) : t("Membro"));
  const tipoLabel = (u: CollaboratorRow) => (u.tipo_contrato ? (TIPO[u.tipo_contrato] ?? u.tipo_contrato) : "—");
  const ultimo = (s: string | null) => {
    if (!s) return t("Nunca");
    const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
    return d <= 0 ? t("Hoje") : t("há {n} dia(s)", { n: d });
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return users.filter((u) => {
      if (tipoF && (u.tipo_contrato ?? "") !== tipoF) return false;
      if (!query) return true;
      return `${u.full_name ?? ""} ${u.email ?? ""} ${u.cargo ?? ""} ${u.departamento ?? ""}`.toLowerCase().includes(query);
    });
  }, [users, q, tipoF]);

  async function reenviar(u: CollaboratorRow) {
    setBusyId(u.id); setErr("");
    try { const r = await services.identity.users.resendByOwner(u.id); if (!r.ok) throw new Error(r.error || t("Falha ao reenviar.")); flash(t("Acesso reenviado ✓")); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusyId(null); }
  }
  async function toggleAtivo(u: CollaboratorRow) {
    setBusyId(u.id); setErr("");
    try {
      const r = await services.delivery.collaborator.setActive(u.id, !u.active);
      if (r?.error) throw new Error(r.error);
      flash(u.active ? t("Colaborador suspenso.") : t("Colaborador reativado ✓"));
      reload();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusyId(null); }
  }
  async function remover(u: CollaboratorRow) {
    // Governança: NUNCA hard-delete. "Remover" = suspender o acesso (reversível). A conta fica.
    if (!confirm(t("Remover o acesso de {n}? A conta é SUSPENSA (não excluída) — você pode reativar depois.", { n: u.full_name || u.email || "" }))) return;
    setBusyId(u.id); setErr("");
    try { const r = await services.delivery.collaborator.setActive(u.id, false); if (r?.error) throw new Error(r.error); flash(t("Acesso removido (suspenso).")); reload(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusyId(null); }
  }

  if (!canManage) {
    return (<div>
      <PageHead eyebrow="Portal do Cliente" title="Gestão de Acessos" sub="Convide sua equipe e defina quem acessa o quê." />
      <div className="note"><span>{t("Só o dono da conta (ou um Admin) pode gerenciar os colaboradores.")}</span></div>
    </div>);
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Gestão de Acessos" sub="Convide sua equipe, defina o papel e as telas de cada colaborador." />

      <div className="collab-toolbar">
        <div className="collab-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar por nome, email, cargo…")} /></div>
        <div className="collab-filters">
          {([["", t("Todos")], ["clt", "CLT"], ["pj", "PJ"]] as const).map(([k, lb]) => (
            <button key={k || "all"} className={"collab-chip" + (tipoF === k ? " on" : "")} onClick={() => setTipoF(k)}>{lb}</button>
          ))}
        </div>
        <div className="collab-count">{t("{n} colaborador(es)", { n: users.length })}</div>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setEdit({ user: null })}>
          <span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">{t("Novo Colaborador")}</span>
        </button>
      </div>

      {err && <div className="formerr" style={{ marginBottom: 10 }}>{err}</div>}

      {loading ? <Empty>{t("Carregando…")}</Empty> : filtered.length === 0 ? <Empty>{t("Nenhum colaborador.")}</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl collab-tbl">
            <thead><tr>
              <th>{t("Nome")}</th><th>{t("Função")}</th><th>{t("Tipo")}</th><th>{t("Cargo")}</th>
              <th>{t("Departamento")}</th><th>{t("Contato")}</th><th>{t("Status")}</th><th>{t("Último acesso")}</th><th>{t("Ações")}</th>
            </tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={u.active ? "" : "collab-off"}>
                  <td><div className="cust"><Avatar name={u.full_name || u.email} /><div><div className="nm">{u.full_name || "—"}</div><div className="em">{u.email}</div></div></div></td>
                  <td><Pill tone={u.role === "client_owner" ? "ok" : u.access_level === "admin" ? "warn" : "mute"}>{funcao(u)}</Pill></td>
                  <td>{tipoLabel(u)}</td>
                  <td>{u.cargo || "—"}</td>
                  <td>{u.departamento || "—"}</td>
                  <td>{u.telefone || "—"}</td>
                  <td><span className={"collab-status" + (u.active ? " on" : "")}>{u.active ? t("Ativo") : t("Inativo")}</span></td>
                  <td>{ultimo(u.last_login)}</td>
                  <td>
                    <div className="collab-actions">
                      <button title={t("Editar")} disabled={busyId === u.id} onClick={() => setEdit({ user: u })}><Pencil size={15} /></button>
                      <button className="collab-resend" title={t("Reenviar o e-mail de acesso ao Portal")} disabled={busyId === u.id} onClick={() => reenviar(u)}>
                        <RefreshCw size={14} /> {t("Reenviar acesso")}
                      </button>
                      {u.role !== "client_owner" && (
                        <button title={u.active ? t("Suspender") : t("Reativar")} className={"collab-toggle" + (u.active ? " on" : "")} disabled={busyId === u.id} onClick={() => toggleAtivo(u)} />
                      )}
                      {u.role !== "client_owner" && (
                        <button title={t("Remover acesso")} className="collab-del" disabled={busyId === u.id} onClick={() => remover(u)}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Uso por pessoa fica AQUI, junto da equipe: é a mesma pergunta ("quem é meu time e o que
          cada um usa"). Só o dono/admin vê — a RLS já garante isso no banco. */}
      <UsoModulos titulo={t("Uso dos módulos pela sua equipe")} />

      {edit && <EditarColaborador orgId={orgId} user={edit.user} onClose={() => setEdit(null)}
        onSaved={(m) => { setEdit(null); if (m) flash(m); reload(); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
