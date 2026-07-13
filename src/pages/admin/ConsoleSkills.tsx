import { useState } from "react";
import { Plus, Pencil, Trash2, Blocks } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

// Catálogo de Skills (SPEC 3.9) — capacidades DO AGENTE (skill-packs). Distinto do catálogo comercial.
const EMPTY = { id: "", key: "", name: "", description: "", enforcement: "default" };

export default function ConsoleSkills() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.skillsList()) as any[], []);
  const packs = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 5000); };

  async function save() {
    if (!f.name.trim()) { flash(t("Dê um nome ao skill.")); return; }
    setBusy(true);
    try { await services.analytics.admin.skillUpsert(f); setOpen(false); reload(); flash(t("Skill salvo ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function del(p: any) { if (!confirm(t("Excluir este skill?"))) return; await services.analytics.admin.skillRemove(p.id); reload(); }

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Governança" title="Catálogo de Skills"
        sub="As capacidades que os agentes de IA sabem executar (skill-packs). Diferente do catálogo comercial de módulos."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { setF({ ...EMPTY }); setOpen(true); }}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{t("Novo skill")}</span></button>} />

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Skill")}</th><th>{t("Descrição")}</th><th>{t("Imposição")}</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr>
              : packs.length === 0 ? <tr><td colSpan={4}><Empty><p><strong>{t("Catálogo de skills vazio.")}</strong> {t("Cadastre a primeira capacidade que os agentes poderão usar.")}</p></Empty></td></tr>
                : packs.map((p) => (
                  <tr key={p.id}>
                    <td><div className="nm"><Blocks size={13} style={{ verticalAlign: -2, marginRight: 5, opacity: .6 }} />{p.name}</div>{p.key && <div className="mt tnum">{p.key}</div>}</td>
                    <td className="mt">{p.description || "—"}</td>
                    <td><Pill tone={p.enforcement === "obrigatoria" ? "crit" : "mute"}>{p.enforcement === "obrigatoria" ? t("Obrigatória") : t("Padrão")}</Pill></td>
                    <td><div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button className="icobtn" title={t("Editar")} onClick={() => { setF({ id: p.id, key: p.key || "", name: p.name || "", description: p.description || "", enforcement: p.enforcement || "default" }); setOpen(true); }}><Pencil size={13} /></button>
                      <button className="icobtn rm" title={t("Excluir")} onClick={() => del(p)}><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <Blocks size={15} />
        <div>{t("Skill = o que a IA sabe fazer (ex.: emitir 2ª via, agendar). A instalação por agente acende com o WhatsApp CRM. Não confundir com o catálogo comercial (o que o cliente contrata).")}</div>
      </div>

      <Modal title={f.id ? t("Editar skill") : t("Novo skill")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <div className="grid2">
          <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("Ex.: 2ª via de boleto")} /></Field>
          <Field label="Chave (slug)"><input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="segunda_via_boleto" /></Field>
        </div>
        <Field label="Descrição"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Imposição"><select value={f.enforcement} onChange={(e) => setF({ ...f, enforcement: e.target.value })}><option value="default">{t("Padrão (opcional por agente)")}</option><option value="obrigatoria">{t("Obrigatória (todo agente)")}</option></select></Field>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
