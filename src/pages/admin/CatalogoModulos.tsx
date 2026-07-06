import { useState } from "react";
import { Plus, Grid3x3, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

type V = { id: string; name: string; description: string | null; category: string | null; external_url: string | null; status: string };
const EMPTY = { id: "", name: "", description: "", category: "", external_url: "", status: "published" };

export default function CatalogoModulos() {
  const { data, loading, reload } = useAsync(async () => (await supabase.schema("catalog").from("vdi_modules").select("*").order("category")).data as V[], []);
  const rows = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");
  const editing = !!f.id;

  function openNew() { setF({ ...EMPTY }); setErr(""); setOpen(true); }
  function openEdit(m: V) { setF({ id: m.id, name: m.name, description: m.description ?? "", category: m.category ?? "", external_url: m.external_url ?? "", status: m.status }); setErr(""); setOpen(true); }

  async function submit() {
    if (!f.name.trim()) { setErr("Informe o nome do módulo."); return; }
    setBusy(true); setErr("");
    const payload = { name: f.name.trim(), description: f.description || null, category: f.category || null, external_url: f.external_url || null, status: f.status };
    const { error } = editing
      ? await supabase.schema("catalog").from("vdi_modules").update(payload).eq("id", f.id)
      : await supabase.schema("catalog").from("vdi_modules").insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOpen(false); reload();
  }
  async function del(m: V) {
    if (!confirm(`Excluir o módulo "${m.name}"?`)) return;
    const { error } = await supabase.schema("catalog").from("vdi_modules").delete().eq("id", m.id);
    if (error) { setToast("Não foi possível excluir (módulo em uso por clientes?)."); setTimeout(() => setToast(""), 6000); return; }
    reload();
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Catálogo de módulos" sub="O que existe para oferecer. É daqui que nascem os cards do cliente."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo módulo</span></button>} />
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>Catálogo vazio.</strong> Clique em "Novo módulo".</p></Empty> : (
        <div className="mods">
          {rows.map((m) => (
            <div className="mod" key={m.id}>
              <div className="cover"><div className="glow" /><Grid3x3 /></div>
              <div className="body">
                <h3>{m.name}</h3><p>{m.description || m.category}</p>
                <div className="foot"><Pill tone={m.status === "published" ? "ok" : "warn"}>{m.status === "published" ? "Publicado" : m.status}</Pill>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="icobtn" title="Editar" onClick={() => openEdit(m)}><Pencil size={14} /></button>
                    <button className="icobtn" title="Excluir" onClick={() => del(m)}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal title={editing ? "Editar módulo" : "Novo módulo"} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: WhatsApp CRM (OpenClaw)" /></Field>
        <Field label="Categoria"><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Vendas, Marketing, Atendimento e CS…" /></Field>
        <Field label="Descrição"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Link de acesso (externo)"><input value={f.external_url} onChange={(e) => setF({ ...f, external_url: e.target.value })} placeholder="https://…" /></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="published">Publicado</option><option value="beta">Beta</option><option value="draft">Rascunho</option></select></Field>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
