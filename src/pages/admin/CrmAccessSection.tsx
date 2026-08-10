// Seção "Agente do WhatsApp CRM" do detalhe do cliente (admin).
//
// Faz duas coisas: (1) vincular QUAL agente do CRM atende este cliente; (2) gerir as
// UNIDADES (CNPJs) da empresa — "Unidades dentro da empresa" (multi-CNPJ): uma empresa
// (1 login) pode ter vários CNPJs, e cada agente pertence a uma unidade. O admin gerencia
// aqui; o cliente só ESCOLHE a unidade no seletor da topbar. A gestão de PESSOAS (quem
// acessa, papel, telas) vive em Permissões & Acessos ("identidade tem um lugar só").
import { useEffect, useState, type CSSProperties } from "react";
import { ExternalLink, Users, Building2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { services, errorMessage } from "../../services";
import type { CrmAccessOverview, CrmUnit } from "../../services/crmAccess.service";
import { useT } from "../../lib/i18n";
import { Pill } from "../../ui/ui";

export function CrmAccessSection({ orgId, onToast }: { orgId: string; onToast: (m: string) => void }) {
  const tr = useT();
  const navigate = useNavigate();
  const [d, setD] = useState<CrmAccessOverview | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulário de nova unidade + edição inline.
  const [nu, setNu] = useState({ name: "", cnpj: "", legal_name: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [eu, setEu] = useState({ name: "", cnpj: "", legal_name: "" });

  async function load() {
    try { setD(await services.crmAccess.overview(orgId)); } catch (e) { onToast(errorMessage(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  if (!d || !d.enabled) return null; // módulo não contratado → a seção não existe
  // A API pode ainda não devolver `units` (antes do deploy da Parte 1) → nunca deixar undefined
  // estourar a tela; some suave até a API subir.
  const units = d.units ?? [];

  async function linkAgent(agentId: string | null) {
    setBusy(true);
    try { await services.crmAccess.linkAgent(orgId, agentId); onToast(tr("Agente vinculado.")); await load(); }
    catch (e) { onToast(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function addUnit() {
    const name = nu.name.trim();
    if (!name) { onToast(tr("Dê um nome à unidade.")); return; }
    setBusy(true);
    try {
      const r = await services.crmAccess.createUnit(orgId, { name, cnpj: nu.cnpj.trim() || undefined, legal_name: nu.legal_name.trim() || undefined });
      if (r?.error) throw new Error(r.error);
      setNu({ name: "", cnpj: "", legal_name: "" });
      onToast(tr("Unidade criada."));
      await load();
    } catch (e) { onToast(errorMessage(e)); } finally { setBusy(false); }
  }

  function startEdit(u: CrmUnit) {
    setEditId(u.id);
    setEu({ name: u.name, cnpj: u.cnpj ?? "", legal_name: u.legal_name ?? "" });
  }
  async function saveEdit(u: CrmUnit) {
    setBusy(true);
    try {
      const r = await services.crmAccess.updateUnit(orgId, u.id, { name: eu.name.trim(), cnpj: eu.cnpj.trim(), legal_name: eu.legal_name.trim() });
      if (r?.error) throw new Error(r.error);
      setEditId(null);
      onToast(tr("Unidade atualizada."));
      await load();
    } catch (e) { onToast(errorMessage(e)); } finally { setBusy(false); }
  }
  async function delUnit(u: CrmUnit) {
    if (!confirm(tr("Excluir a unidade {n}?", { n: u.name }))) return;
    setBusy(true);
    try {
      const r = await services.crmAccess.deleteUnit(orgId, u.id);
      if (r?.error) throw new Error(r.error);
      onToast(tr("Unidade excluída."));
      await load();
    } catch (e) { onToast(errorMessage(e)); } finally { setBusy(false); }
  }
  async function assignAgent(agentId: string, unitId: string | null) {
    setBusy(true);
    try {
      const r = await services.crmAccess.setAgentUnit(orgId, agentId, unitId);
      if (r?.error) throw new Error(r.error);
      await load();
    } catch (e) { onToast(errorMessage(e)); } finally { setBusy(false); }
  }

  const cell: CSSProperties = { border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-sm)", padding: "8px 10px", fontSize: 13 };

  return (
    <>
      <div className="sec-h" style={{ marginTop: 24 }}>
        <h2>{tr("Agente do WhatsApp CRM")}</h2>
        <Pill tone="ok">{d.module?.name}</Pill>
        {d.crm_url && <a className="crasto-btn crasto-btn--ghost crasto-btn--sm" href={d.crm_url} target="_blank" rel="noreferrer"><span className="crasto-btn__icon"><ExternalLink size={13} /></span><span className="crasto-btn__label">{tr("Abrir o CRM")}</span></a>}
      </div>

      {d.crm_error && <div className="formerr" style={{ marginBottom: 12 }}>{tr("Não foi possível falar com o CRM")}: {d.crm_error}</div>}

      <div className="addrow" style={{ flexWrap: "wrap" }}>
        <select
          value={d.agent_id ?? ""}
          disabled={busy || !d.agents.length}
          onChange={(e) => linkAgent(e.target.value || null)}
          style={{ minWidth: 240 }}
        >
          <option value="">{d.agents.length ? tr("Sem agente vinculado…") : tr("Nenhum agente criado no CRM")}</option>
          {d.agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status ? ` · ${a.status}` : ""}</option>)}
        </select>
        <span className="mt" style={{ alignSelf: "center" }}>{tr("qual agente do CRM atende este cliente")}</span>
      </div>

      {/* ── Unidades (CNPJs) da empresa — multi-CNPJ ─────────────────────────── */}
      <div className="sec-h" style={{ marginTop: 26 }}>
        <h2><Building2 size={16} style={{ verticalAlign: "-3px", marginRight: 6, opacity: .7 }} />{tr("Unidades (CNPJs)")}</h2>
        <Pill tone="ok">{units.length}</Pill>
      </div>
      <p className="mt" style={{ marginTop: -6, marginBottom: 12 }}>
        {tr("Uma empresa pode ter mais de um CNPJ. Cada unidade agrupa seus próprios agentes; a matriz é a unidade principal e não pode ser removida.")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {units.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)", background: "var(--crasto-glass-card)", opacity: u.status === "inactive" ? .6 : 1 }}>
            {editId === u.id ? (
              <>
                <input value={eu.name} onChange={(e) => setEu({ ...eu, name: e.target.value })} placeholder={tr("Nome/apelido")} style={{ ...cell, width: 170 }} />
                <input value={eu.cnpj} onChange={(e) => setEu({ ...eu, cnpj: e.target.value })} placeholder={tr("CNPJ")} style={{ ...cell, width: 180 }} />
                <input value={eu.legal_name} onChange={(e) => setEu({ ...eu, legal_name: e.target.value })} placeholder={tr("Razão social")} style={{ ...cell, width: 200, flex: 1 }} />
                <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={() => saveEdit(u)}><span className="crasto-btn__icon"><Check size={13} /></span><span className="crasto-btn__label">{tr("Salvar")}</span></button>
                <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => setEditId(null)}><span className="crasto-btn__icon"><X size={13} /></span></button>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, minWidth: 150 }}>{u.name}</div>
                {u.is_primary && <Pill tone="ok">{tr("Matriz")}</Pill>}
                {u.status === "inactive" && <Pill tone="mute">{tr("Inativa")}</Pill>}
                <span className="mt" style={{ fontVariantNumeric: "tabular-nums" }}>{u.cnpj || tr("sem CNPJ")}</span>
                <span className="mt">· {u.agentes ?? 0} {tr("agente(s)")}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => startEdit(u)} title={tr("Editar")}><span className="crasto-btn__icon"><Pencil size={13} /></span></button>
                  {!u.is_primary && <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => delUnit(u)} title={tr("Excluir")}><span className="crasto-btn__icon"><Trash2 size={13} /></span></button>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* adicionar unidade */}
      <div className="addrow" style={{ flexWrap: "wrap", marginTop: 12 }}>
        <input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder={tr("Nome/apelido (ex.: NS Store)")} style={{ ...cell, width: 200 }} />
        <input value={nu.cnpj} onChange={(e) => setNu({ ...nu, cnpj: e.target.value })} placeholder={tr("CNPJ (opcional)")} style={{ ...cell, width: 190 }} />
        <input value={nu.legal_name} onChange={(e) => setNu({ ...nu, legal_name: e.target.value })} placeholder={tr("Razão social (opcional)")} style={{ ...cell, width: 220 }} />
        <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" disabled={busy} onClick={addUnit}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Adicionar unidade")}</span></button>
      </div>

      {/* agentes por unidade */}
      {units.length > 1 && d.agents.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "var(--crasto-text-muted)" }}>{tr("Agentes por unidade")}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.agents.map((a) => (
              <div key={a.id} className="addrow" style={{ alignItems: "center" }}>
                <span style={{ minWidth: 200 }}>{a.name}</span>
                <select value={a.business_unit_id ?? ""} disabled={busy} onChange={(e) => assignAgent(a.id, e.target.value || null)} style={{ minWidth: 220 }}>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.is_primary ? ` · ${tr("Matriz")}` : ""}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pessoas moram em Permissões & Acessos — daqui só o atalho, para não haver duas fontes. */}
      <div className="note" style={{ marginTop: 18 }}>
        <Users size={15} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{tr("Quem da empresa acessa o CRM (e o que cada um vê) é definido em Permissões & Acessos.")}</span>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => navigate(`/admin/console/permissoes?org=${orgId}`)}>
            <span className="crasto-btn__label">{tr("Gerenciar pessoas")}</span>
          </button>
        </div>
      </div>
    </>
  );
}
