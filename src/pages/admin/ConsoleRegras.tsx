import { useState } from "react";
import { Plus, Pencil, Trash2, ScrollText } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, useToast, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import DocField from "../../ui/DocField";

// Regras Globais (SPEC 3.4) — políticas top-down aplicadas a todos os agentes.
const TYPES = [{ v: "seguranca", l: "Segurança" }, { v: "conformidade", l: "Conformidade" }, { v: "qualidade", l: "Qualidade" }];
const EMPTY = { id: "", rule: "", rule_type: "seguranca", enforcement: "default", status: "ativa", source_ref: "", document_path: "", document_name: "" };

export default function ConsoleRegras() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.rulesList()) as any[], []);
  const rules = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const typeLabel = (v: string) => TYPES.find((x) => x.v === v)?.l ?? v;

  async function save() {
    if (!f.rule.trim()) { toast.warn(t("Escreva a regra.")); return; }
    setBusy(true);
    try { await services.analytics.admin.ruleUpsert(f); setOpen(false); reload(); toast.ok(t("Regra salva ✓")); }
    catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }
  async function del(r: any) { if (!confirm(t("Excluir esta regra?"))) return; await services.analytics.admin.ruleRemove(r.id); reload(); }

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Governança" title="Regras Globais"
        sub="Políticas aplicadas a todos os agentes (segurança, conformidade, qualidade). O cliente herda; obrigatórias não podem ser desativadas."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { setF({ ...EMPTY }); setOpen(true); }}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{t("Nova regra")}</span></button>} />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab">{t("Regras")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : rules.length}</div><div className="delta">{t("no total")}</div></div>
        <div className="kpi"><div className="lab">{t("Obrigatórias")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : rules.filter((r) => r.enforcement === "obrigatoria").length}</div><div className="delta">{t("travas — não desativáveis")}</div></div>
        <div className="kpi g"><div className="lab">{t("Ativas")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : rules.filter((r) => r.status === "ativa").length}</div><div className="delta">{t("valendo agora")}</div></div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Regra")}</th><th>{t("Tipo")}</th><th>{t("Imposição")}</th><th>{t("Status")}</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr>
              : rules.length === 0 ? <tr><td colSpan={5}><Empty><p><strong>{t("Nenhuma regra global ainda.")}</strong> {t("Crie a primeira política que todos os agentes devem seguir.")}</p></Empty></td></tr>
                : rules.map((r) => (
                  <tr key={r.id}>
                    <td><div className="nm">{r.rule}</div><div className="mt">{[r.source_ref && `${t("fonte")}: ${r.source_ref}`, r.document_name && `${t("anexo")}: ${r.document_name}`].filter(Boolean).join(" · ")}</div></td>
                    <td>{t(typeLabel(r.rule_type))}</td>
                    <td><Pill tone={r.enforcement === "obrigatoria" ? "crit" : "mute"}>{r.enforcement === "obrigatoria" ? t("Obrigatória") : t("Padrão")}</Pill></td>
                    <td><Pill tone={r.status === "ativa" ? "ok" : "mute"}>{r.status === "ativa" ? t("Ativa") : t("Rascunho")}</Pill></td>
                    <td><div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button className="icobtn" title={t("Editar")} onClick={() => { setF({ id: r.id, rule: r.rule || "", rule_type: r.rule_type || "seguranca", enforcement: r.enforcement || "default", status: r.status || "ativa", source_ref: r.source_ref || "", document_path: r.document_path || "", document_name: r.document_name || "" }); setOpen(true); }}><Pencil size={13} /></button>
                      <button className="icobtn rm" title={t("Excluir")} onClick={() => del(r)}><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Modal title={f.id ? t("Editar regra") : t("Nova regra global")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <Field label="Regra *"><textarea value={f.rule} onChange={(e) => setF({ ...f, rule: e.target.value })} placeholder={t("Ex.: Nunca compartilhar dado de um cliente com outro.")} /></Field>
        <div className="grid3">
          <Field label="Tipo"><select value={f.rule_type} onChange={(e) => setF({ ...f, rule_type: e.target.value })}>{TYPES.map((x) => <option key={x.v} value={x.v}>{t(x.l)}</option>)}</select></Field>
          <Field label="Imposição"><select value={f.enforcement} onChange={(e) => setF({ ...f, enforcement: e.target.value })}><option value="obrigatoria">{t("Obrigatória (trava)")}</option><option value="default">{t("Padrão (cliente pode desativar)")}</option></select></Field>
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ativa">{t("Ativa")}</option><option value="rascunho">{t("Rascunho")}</option></select></Field>
        </div>
        <Field label="Fonte (doc de referência)"><input value={f.source_ref} onChange={(e) => setF({ ...f, source_ref: e.target.value })} placeholder={t("Ex.: Plano Diretor · LGPD")} /></Field>
        <Field label="Documento anexo (fonte para a IA)"><DocField path={f.document_path} name={f.document_name} onChange={(p, n) => setF({ ...f, document_path: p, document_name: n })} /></Field>
      </Modal>
      {toast.node}
    </div>
  );
}
