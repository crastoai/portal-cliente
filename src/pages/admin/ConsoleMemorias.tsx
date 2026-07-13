import { useState } from "react";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import DocField from "../../ui/DocField";

// Memórias & Conhecimento (SPEC 3.3) — Cérebro Global da Crasto.AI (top-down; o cliente herda).
const EMPTY = { id: "", title: "", body: "", source_ref: "", document_path: "", document_name: "" };

export default function ConsoleMemorias() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.brainList()) as any[], []);
  const items = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 5000); };

  async function save() {
    if (!f.title.trim() && !f.body.trim()) { flash(t("Dê um título ou conteúdo.")); return; }
    setBusy(true);
    try { await services.analytics.admin.brainUpsert(f); setOpen(false); reload(); flash(t("Conhecimento salvo ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function del(i: any) { if (!confirm(t("Excluir este item?"))) return; await services.analytics.admin.brainRemove(i.id); reload(); }

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Governança" title="Memórias & Conhecimento"
        sub="O Cérebro Global da Crasto.AI — método, posicionamento e conhecimento que todo agente herda. Editado de cima pra baixo."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { setF({ ...EMPTY }); setOpen(true); }}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{t("Novo item")}</span></button>} />

      {loading ? <Empty>{t("Carregando…")}</Empty>
        : items.length === 0 ? <div className="card"><Empty><p><strong>{t("Cérebro Global vazio.")}</strong> {t("Adicione o primeiro item de conhecimento que todos os agentes vão herdar.")}</p></Empty></div>
          : <div className="grid2">
            {items.map((i) => (
              <div className="card" key={i.id}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <BookOpen size={16} style={{ color: "var(--crasto-blue, #3E6FB8)", flex: "none", marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0 }}>{i.title || t("(sem título)")}</h3>
                    {(i.source_ref || i.document_name) && <div className="mt">{[i.source_ref && `${t("fonte")}: ${i.source_ref}`, i.document_name && `${t("anexo")}: ${i.document_name}`].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="icobtn" title={t("Editar")} onClick={() => { setF({ id: i.id, title: i.title || "", body: i.body || "", source_ref: i.source_ref || "", document_path: i.document_path || "", document_name: i.document_name || "" }); setOpen(true); }}><Pencil size={13} /></button>
                    <button className="icobtn rm" title={t("Excluir")} onClick={() => del(i)}><Trash2 size={13} /></button>
                  </div>
                </div>
                {i.body && <p style={{ fontSize: 13.5, color: "var(--crasto-text-body)", marginTop: 8, whiteSpace: "pre-wrap" }}>{i.body.length > 280 ? i.body.slice(0, 280) + "…" : i.body}</p>}
              </div>
            ))}
          </div>}

      <div className="note" style={{ marginTop: 14 }}>
        <BookOpen size={15} />
        <div>{t("Este é o nível Global do cérebro (3 camadas: Global → Cliente → Efetivo). A herança por cliente e o sync do canon (RAG) acendem quando o WhatsApp CRM estiver no ar. Memória de contato é sempre por-cliente, não entra aqui.")}</div>
      </div>

      <Modal title={f.id ? t("Editar conhecimento") : t("Novo item de conhecimento")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <Field label="Título"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("Ex.: Tom de voz da Crasto.AI")} /></Field>
        <Field label="Conteúdo"><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ minHeight: 140 }} /></Field>
        <Field label="Fonte (doc de referência)"><input value={f.source_ref} onChange={(e) => setF({ ...f, source_ref: e.target.value })} placeholder={t("Ex.: Plano Diretor · Posicionamento")} /></Field>
        <Field label="Documento anexo (fonte para a IA)"><DocField path={f.document_path} name={f.document_name} onChange={(p, n) => setF({ ...f, document_path: p, document_name: n })} /></Field>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
