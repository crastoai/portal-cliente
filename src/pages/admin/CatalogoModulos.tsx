import { useState } from "react";
import { Plus, Grid3x3, Pencil, Trash2, Clock } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

type V = any;
type Cat = { name: string; department: string | null; description: string | null };
const EMPTY = { id: "", name: "", department: "", description: "", external_url: "", internal_url: "", status: "published", customization: "standard", tools_cost_by: "client", setup_workdays: "7", client_deadline_days: "30", version: "v1", remix_date: "" };

export default function CatalogoModulos() {
  const { data, loading, reload } = useAsync(async () => {
    const [m, c] = await Promise.all([
      api.catalog.vdiModules.listAll(),
      api.catalog.vdiCatalog.listNames(),
    ]);
    return { mods: (m as unknown as V[]) ?? [], cat: (c as unknown as Cat[]) ?? [] };
  }, []);
  const rows = data?.mods ?? []; const cat = data?.cat ?? [];
  const depts = Array.from(new Set(cat.map((c) => c.department).filter(Boolean))) as string[];

  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string; status: string }[] | null>(null);
  const editing = !!f.id;

  function openNew() { setF({ ...EMPTY }); setErr(""); setClients(null); setOpen(true); }
  async function openEdit(m: V) {
    setF({ id: m.id, name: m.name, department: m.department ?? "", description: m.description ?? "", external_url: m.external_url ?? "", internal_url: m.internal_url ?? "", status: m.status, customization: m.customization ?? "standard", tools_cost_by: m.tools_cost_by ?? "client", setup_workdays: String(m.setup_workdays ?? 7), client_deadline_days: String(m.client_deadline_days ?? 30), version: m.version ?? "v1", remix_date: m.remix_date ?? "" });
    setErr(""); setClients(null); setOpen(true);
    const cl = await api.analytics.admin.moduleClients<any[]>(m.id);
    setClients((cl as any) ?? []);
  }
  function onName(name: string) {
    const hit = cat.find((c) => c.name.toLowerCase() === name.toLowerCase());
    setF((p: any) => ({ ...p, name, department: hit?.department || p.department, description: p.description || hit?.description || p.description }));
  }
  async function submit() {
    if (!f.name.trim()) { setErr("Informe o nome do módulo."); return; }
    setBusy(true); setErr("");
    const payload = {
      name: f.name.trim(), department: f.department || null, category: f.department || null, description: f.description || null,
      external_url: f.external_url || null, internal_url: f.internal_url || null, status: f.status,
      customization: f.customization, tools_cost_by: f.tools_cost_by, setup_workdays: Number(f.setup_workdays) || 7,
      client_deadline_days: Number(f.client_deadline_days) || 30, version: f.version || "v1", remix_date: f.remix_date || null,
    };
    try {
      if (editing) await api.catalog.vdiModules.update(f.id, payload);
      else await api.catalog.vdiModules.create(payload);
      setOpen(false); reload();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function del(m: V) {
    if (!confirm(`Excluir o módulo "${m.name}"?`)) return;
    try { await api.catalog.vdiModules.remove(m.id); reload(); }
    catch { setToast("Não foi possível excluir (módulo em uso por clientes?)."); setTimeout(() => setToast(""), 6000); }
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Catálogo de módulos" sub="Módulos do Viver de IA que a Crasto configura e oferece."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo módulo</span></button>} />
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>Catálogo vazio.</strong> Clique em "Novo módulo" e comece a digitar — os nomes do Viver de IA aparecem sozinhos.</p></Empty> : (
        <div className="mods">
          {rows.map((m: V) => (
            <div className="mod" key={m.id}>
              <div className="cover"><div className="glow" /><Grid3x3 /></div>
              <div className="body">
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><h3>{m.name}</h3><span className="chip">{m.version}</span></div>
                <p>{m.department ? `${m.department} · ` : ""}{m.customization === "standard" ? "Standard" : "Sob medida"} · {m.setup_workdays}d úteis / {m.client_deadline_days}d cliente</p>
                <div className="foot">
                  <Pill tone={m.status === "published" ? "ok" : m.status === "beta" ? "warn" : "mute"}>{m.status === "published" ? "Publicado" : m.status === "beta" ? "Beta" : "Rascunho"}</Pill>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="icobtn" title="Editar / gestão" onClick={() => openEdit(m)}><Pencil size={14} /></button>
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Departamento"><select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">(escolha)</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
          <Field label="Versão"><input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="v1" /></Field>
        </div>
        <Field label="Nome do módulo * (comece a digitar — puxa do Viver de IA)">
          <input list="vdicat" value={f.name} onChange={(e) => onName(e.target.value)} placeholder="Ex.: WhatsApp CRM (OpenClaw)" />
          <datalist id="vdicat">{cat.filter((c) => !f.department || c.department === f.department).map((c) => <option key={c.name} value={c.name} />)}</datalist>
        </Field>
        <Field label="Descrição (o que o módulo faz)"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Customização"><select value={f.customization} onChange={(e) => setF({ ...f, customization: e.target.value })}><option value="standard">Standard (identidade Crasto)</option><option value="custom">Sob medida (design do cliente)</option></select></Field>
          <Field label="Custo das ferramentas por conta de"><select value={f.tools_cost_by} onChange={(e) => setF({ ...f, tools_cost_by: e.target.value })}><option value="client">Cliente contratante</option><option value="crasto">Crasto.AI (vende como serviço)</option></select></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Prazo de configuração (dias úteis)"><input type="number" value={f.setup_workdays} onChange={(e) => setF({ ...f, setup_workdays: e.target.value })} placeholder="7" /></Field>
          <Field label="Prazo prometido ao cliente (dias)"><input type="number" value={f.client_deadline_days} onChange={(e) => setF({ ...f, client_deadline_days: e.target.value })} placeholder="30" /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Link externo (acesso do cliente)"><input value={f.external_url} onChange={(e) => setF({ ...f, external_url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Link interno (gestão Crasto)"><input value={f.internal_url} onChange={(e) => setF({ ...f, internal_url: e.target.value })} placeholder="https://… (opcional)" /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="published">Publicado</option><option value="beta">Beta (em teste)</option><option value="draft">Rascunho</option></select></Field>
          <Field label="Data do remix"><input type="date" value={f.remix_date} onChange={(e) => setF({ ...f, remix_date: e.target.value })} /></Field>
        </div>

        {editing && clients && (
          <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--crasto-border-soft)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--crasto-text-muted)", marginBottom: 8 }}>
              <Clock size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Clientes com este módulo — {clients.filter((c) => c.status === "active").length} ativos · {clients.filter((c) => c.status !== "active").length} inativos
            </div>
            {clients.length === 0 ? <div className="mt">Nenhum cliente ainda.</div> : clients.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.status === "active" ? "#1F8A5B" : "#98A2B3" }} />
                {c.name} <span className="chip" style={{ marginLeft: "auto" }}>{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
