import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Search, Send, Grid3x3, Pencil, Trash2, UserPlus, Plus, Upload, Download, FileText, Building2, Globe, Cake } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, initials, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { COUNTRIES, countryOf, STAGES, stageOf } from "../../lib/countries";

type Org = any;
const icon = (cat?: string | null) => { const c = (cat || "").toLowerCase(); return c.includes("atend") ? <MessageCircle size={16} /> : c.includes("market") ? <Send size={16} /> : c.includes("vend") ? <Search size={16} /> : <Grid3x3 size={16} />; };
const DOC_KINDS = [{ v: "cnpj_card", l: "Cartão CNPJ" }, { v: "contrato_social", l: "Contrato Social" }, { v: "plano_diretor", l: "Plano Diretor" }, { v: "socios", l: "Sócios" }, { v: "outro", l: "Outro" }];
const fmtDate = (s?: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");

export default function ClienteDetalhe() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, reload } = useAsync(async () => {
    if (!id) return null;
    const [org, mods, cm, users, people, phones, docs, acts, impl, health] = await Promise.all([
      api.identity.organizations.getById(id),
      api.catalog.vdiModules.listActiveByName(),
      api.delivery.clientModules.listByOrg(id),
      api.identity.profiles.listByOrg(id),
      api.crm.people.listByOrg(id),
      api.crm.phones.listByOrg(id),
      api.crm.documents.listByOrg(id),
      api.crm.activities.listByOrg(id),
      api.delivery.implementations.getByOrg(id),
      api.delivery.systemHealth.getByOrg(id),
    ]);
    return { org: org as Org, mods: (mods as any[]) ?? [], cm: (cm as any[]) ?? [], users: (users as any[]) ?? [], people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], docs: (docs as any[]) ?? [], acts: (acts as any[]) ?? [], progress: (impl as any)?.overall_progress ?? 0, health: (health as any)?.status ?? null };
  }, [id]);

  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState<Org>(null);
  const [invite, setInvite] = useState(false);
  const [inv, setInv] = useState({ email: "", name: "", role: "client_member" });
  const [person, setPerson] = useState({ full_name: "", role: "", email: "", birthday: "" });
  const [phone, setPhone] = useState({ label: "mobile", country_code: "+55", number: "", person_id: "" });
  const [act, setAct] = useState({ type: "note", title: "", description: "" });
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState(""); const [err, setErr] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 7000); };

  if (loading) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Carregando…</Empty></>;
  if (!data?.org) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Não encontrado.</Empty></>;
  const { org, mods, cm, users, people, phones, docs, acts, progress, health } = data;
  const activeSet = new Set(cm.map((c) => c.vdi_module_id));
  const co = countryOf(org.country); const st = stageOf(org.stage);

  async function saveEdit() {
    setBusy(true);
    const cc = countryOf(ef.country);
    try {
      await api.identity.organizations.update(id!, { name: ef.name, stage: ef.stage, country: ef.country, tax_id: ef.tax_id, tax_id_type: cc.idType, founded_on: ef.founded_on || null, website: ef.website, owner_name: ef.owner_name, plan: ef.plan, notes: ef.notes, status: ef.status });
      setEdit(false); reload(); flash("Dados atualizados ✓");
    } catch (e) { flash("Erro ao salvar: " + errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function setStage(stage: string) { await api.identity.organizations.setStage(id!, stage); reload(); }
  async function toggleModule(mid: string, on: boolean) {
    if (on) await api.delivery.clientModules.detach(id!, mid);
    else await api.delivery.clientModules.attach(id!, mid);
    reload();
  }
  async function del() {
    if (!confirm(`Apagar "${org.name}" e TODOS os dados/logins? Não dá pra desfazer.`)) return;
    setBusy(true);
    const r = await api.identity.clients.remove(id!);
    setBusy(false);
    if (r.ok) nav("/admin/clientes", { replace: true });
    else flash("Erro ao apagar: " + (r.error || "tente novamente"));
  }
  async function doInvite() {
    if (!inv.email.trim()) { setErr("Informe o e-mail."); return; }
    setBusy(true); setErr("");
    const r = await api.identity.users.create({ email: inv.email.trim(), full_name: inv.name, organization_id: id!, role: inv.role });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Erro."); return; }
    setInvite(false); setInv({ email: "", name: "", role: "client_member" }); reload(); flash(`Login: ${r.email} · senha: ${r.password}`);
  }
  async function addPerson() { if (!person.full_name.trim()) return; await api.crm.people.add({ organization_id: id, full_name: person.full_name.trim(), role: person.role || null, email: person.email || null, birthday: person.birthday || null }); setPerson({ full_name: "", role: "", email: "", birthday: "" }); reload(); }
  async function addPhone() { if (!phone.number.trim()) return; await api.crm.phones.add({ organization_id: id, label: phone.label, country_code: phone.country_code, number: phone.number.trim(), person_id: phone.person_id || null }); setPhone({ label: "mobile", country_code: "+55", number: "", person_id: "" }); reload(); }
  async function addActivity() { if (!act.title.trim()) return; await api.crm.activities.add({ organization_id: id, type: act.type, title: act.title.trim(), description: act.description || null }); setAct({ type: "note", title: "", description: "" }); reload(); }
  async function delRow(_schema: string, table: string, rid: string) { await api.crm.removeRow(table as any, rid); reload(); }
  async function uploadDoc(file: File, kind: string) {
    setBusy(true);
    try {
      const key = await api.storage.upload(id!, file);
      await api.crm.documents.add({ organization_id: id, kind, file_name: file.name, storage_path: key });
      flash("Documento enviado ✓ (Cloudflare R2)");
    } catch (e) { flash("Erro no upload: " + errorMessage(e)); }
    setBusy(false); reload();
  }
  async function downloadDoc(path: string) { const url = await api.storage.getUrl(path); if (url) window.open(url, "_blank"); }
  async function delDoc(d: any) { await api.storage.remove(d.storage_path); await api.crm.documents.remove(d.id); reload(); }

  return (
    <div>
      <PageHead eyebrow={`CRM · ${co.flag} ${co.name}`} title={org.name} sub={`${co.idLabel}: ${org.tax_id || "—"}  ·  ${org.website || "sem site"}`}
        right={<>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { setEf(org); setEdit(true); }}><span className="crasto-btn__icon"><Pencil size={14} /></span><span className="crasto-btn__label">Editar</span></button>
          <button className="crasto-btn crasto-btn--destructive crasto-btn--sm" onClick={del} disabled={busy}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">Excluir</span></button>
        </>} />

      {/* pipeline */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STAGES.map((s) => <button key={s.key} className={"stagetab" + (org.stage === s.key ? " on" : "")} onClick={() => setStage(s.key)}>{s.label}</button>)}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--crasto-text-muted)" }}>Status atual: <b style={{ color: "var(--crasto-navy)" }}>{st.label}</b></span>
      </div>

      {/* Dados da empresa (cadastro) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Building2 size={16} style={{ color: "var(--crasto-navy)" }} /><h3 style={{ margin: 0 }}>Dados da empresa</h3></div>
        <div className="infogrid">
          <div><div className="infolab">País</div><div className="infoval">{co.flag} {co.name}</div></div>
          <div><div className="infolab">{co.idLabel}</div><div className="infoval tnum">{org.tax_id || "—"}</div></div>
          <div><div className="infolab">Fundação</div><div className="infoval">{fmtDate(org.founded_on)}</div></div>
          <div><div className="infolab">Dono / Presidente</div><div className="infoval">{org.owner_name || "—"}</div></div>
          <div><div className="infolab">Website</div><div className="infoval">{org.website ? <a href={org.website} target="_blank" rel="noreferrer" style={{ color: "#3E6FB8" }}>{org.website}</a> : "—"}</div></div>
          <div><div className="infolab">Plano</div><div className="infoval">{org.plan || "—"}</div></div>
        </div>
        {org.notes && <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 13, color: "var(--crasto-text-body)" }}><b>Observações:</b> {org.notes}</div>}
      </div>

      <div className="kpis" style={{ marginBottom: 22 }}>
        <div className="kpi g"><div className="lab">Implantação</div><div className="val tnum">{progress}<small>%</small></div><div className="delta">{health === "green" ? "no ar" : "—"}</div></div>
        <div className="kpi"><div className="lab">Módulos ativos</div><div className="val tnum">{cm.filter((c) => c.status === "active").length}</div><div className="delta">liberados</div></div>
        <div className="kpi"><div className="lab">Pessoas</div><div className="val tnum">{people.length}</div><div className="delta">contatos</div></div>
        <div className="kpi"><div className="lab">Documentos</div><div className="val tnum">{docs.length}</div><div className="delta">arquivos</div></div>
      </div>

      {/* Pessoas */}
      <div className="sec-h"><h2>Pessoas da empresa</h2></div>
      <div className="addrow">
        <input placeholder="Nome completo" value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} style={{ flex: 2, minWidth: 140 }} />
        <input placeholder="Cargo (dono, diretor…)" value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <input placeholder="E-mail" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
        <input type="date" title="Aniversário" value={person.birthday} onChange={(e) => setPerson({ ...person, birthday: e.target.value })} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addPerson}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">Adicionar</span></button>
      </div>
      {people.map((p) => (
        <div className="crmrow" key={p.id}>
          <div className="logo" style={{ width: 34, height: 34, borderRadius: 9, background: "var(--crasto-bg-3)", color: "var(--crasto-navy)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{initials(p.full_name)}</div>
          <div><div className="nm">{p.full_name} {p.role && <span className="chip" style={{ marginLeft: 6 }}>{p.role}</span>}</div><div className="mt">{p.email || "sem e-mail"}{p.birthday ? ` · 🎂 ${fmtDate(p.birthday)}` : ""}</div></div>
          <button className="icobtn rm" onClick={() => delRow("crm", "people", p.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      {/* Telefones */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>Telefones</h2></div>
      <div className="addrow">
        <select value={phone.label} onChange={(e) => setPhone({ ...phone, label: e.target.value })}><option value="mobile">Celular</option><option value="fixo">Fixo</option><option value="whatsapp">WhatsApp</option></select>
        <select value={phone.country_code} onChange={(e) => setPhone({ ...phone, country_code: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.ddi}>{c.flag} {c.ddi}</option>)}</select>
        <input placeholder="Número" value={phone.number} onChange={(e) => setPhone({ ...phone, number: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
        <select value={phone.person_id} onChange={(e) => setPhone({ ...phone, person_id: e.target.value })}><option value="">(empresa)</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addPhone}><span className="crasto-btn__label">Adicionar</span></button>
      </div>
      {phones.map((ph) => (
        <div className="crmrow" key={ph.id}>
          <Pill tone="info">{ph.label}</Pill>
          <div className="nm tnum">{ph.country_code} {ph.number}</div>
          {ph.person_id && <span className="mt">{people.find((p) => p.id === ph.person_id)?.full_name}</span>}
          <button className="icobtn rm" onClick={() => delRow("crm", "phones", ph.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      {/* Documentos */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>Documentos</h2></div>
      <div className="addrow">
        <label className="crasto-btn crasto-btn--secondary crasto-btn--sm" style={{ cursor: "pointer" }}>
          <span className="crasto-btn__icon"><Upload size={14} /></span><span className="crasto-btn__label">{busy ? "Enviando…" : "Enviar documento"}</span>
          <input type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadDoc(file, (document.getElementById("dockind") as HTMLSelectElement)?.value || "outro"); e.target.value = ""; }} />
        </label>
        <select id="dockind">{DOC_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</select>
        <span className="mt">Cartão CNPJ, contrato social, plano diretor, sócios…</span>
      </div>
      {docs.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>Nenhum documento.</div> : docs.map((d) => (
        <div className="dcard" key={d.id}>
          <span className="ic"><FileText size={16} /></span>
          <div><div className="nm">{d.file_name}</div><div className="mt">{DOC_KINDS.find((k) => k.v === d.kind)?.l || d.kind} · {fmtDate(d.uploaded_at)}</div></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="icobtn" title="Baixar" onClick={() => downloadDoc(d.storage_path)}><Download size={14} /></button>
            <button className="icobtn" title="Excluir" onClick={() => delDoc(d)}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}

      {/* Módulos */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>Módulos contratados</h2><Pill tone="mute">grava no banco</Pill></div>
      <div className="assign">
        {mods.length === 0 ? <Empty>Cadastre módulos no Catálogo primeiro.</Empty> : mods.map((m) => {
          const on = activeSet.has(m.id);
          return (
            <div className="arow" key={m.id}>
              <span className="ico" style={{ background: on ? "var(--crasto-navy)" : "var(--crasto-text-faint)" }}>{icon(m.category)}</span>
              <span><span className="t">{m.name}</span><br /><span className="s">{on ? "Liberado no portal" : "Não contratado"}</span></span>
              <button className={"sw" + (on ? " on" : "")} onClick={() => toggleModule(m.id, on)} />
            </div>
          );
        })}
      </div>

      {/* Usuários */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>Usuários (acesso ao portal)</h2><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setInvite(true)}><span className="crasto-btn__icon"><UserPlus size={14} /></span><span className="crasto-btn__label">Convidar</span></button></div>
      <div className="tbl-wrap">
        <table className="tbl"><thead><tr><th>Usuário</th><th>Papel</th><th>E-mail</th></tr></thead><tbody>
          {users.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--crasto-text-muted)" }}>Sem logins — convide o responsável.</td></tr> : users.map((u) => (
            <tr key={u.id}><td><div className="cust"><div className="logo" style={{ background: "var(--crasto-bg-3)", color: "var(--crasto-navy)" }}>{initials(u.full_name || u.email)}</div><div className="nm">{u.full_name || "—"}</div></div></td><td><Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{u.role === "client_owner" ? "Dono" : "Membro"}</Pill></td><td className="cust"><span className="em">{u.email}</span></td></tr>
          ))}
        </tbody></table>
      </div>

      {/* Histórico */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>Histórico &amp; atividades</h2></div>
      <div className="addrow">
        <select value={act.type} onChange={(e) => setAct({ ...act, type: e.target.value })}><option value="note">Nota</option><option value="conversation">Conversa</option><option value="order">Pedido</option><option value="meeting">Reunião</option><option value="proposal">Proposta</option></select>
        <input placeholder="Título (ex.: Ligação com o dono)" value={act.title} onChange={(e) => setAct({ ...act, title: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
        <input placeholder="Detalhe (opcional)" value={act.description} onChange={(e) => setAct({ ...act, description: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addActivity}><span className="crasto-btn__label">Registrar</span></button>
      </div>
      {acts.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>Sem histórico ainda.</div> : acts.map((a) => (
        <div className="lead" key={a.id}><div className="av">{({ note: "📝", conversation: "💬", order: "🛒", meeting: "📅", proposal: "📄" } as any)[a.type] || "•"}</div><div><div className="nm">{a.title}</div><div className="mt">{a.description || a.type} · {fmtDate(a.occurred_at)}</div></div><button className="icobtn rm" onClick={() => delRow("crm", "activities", a.id)}><Trash2 size={13} /></button></div>
      ))}

      {/* Modal editar empresa */}
      <Modal title="Editar empresa" open={edit && !!ef} onClose={() => setEdit(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setEdit(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveEdit}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar"}</span></button></>}>
        {ef && <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Status"><select value={ef.stage} onChange={(e) => setEf({ ...ef, stage: e.target.value })}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
            <Field label="País"><select value={ef.country} onChange={(e) => setEf({ ...ef, country: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select></Field>
          </div>
          <Field label="Nome"><input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={countryOf(ef.country).idLabel}><input value={ef.tax_id ?? ""} onChange={(e) => setEf({ ...ef, tax_id: e.target.value })} /></Field>
            <Field label="Fundação"><input type="date" value={ef.founded_on ?? ""} onChange={(e) => setEf({ ...ef, founded_on: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Dono / Presidente"><input value={ef.owner_name ?? ""} onChange={(e) => setEf({ ...ef, owner_name: e.target.value })} /></Field>
            <Field label="Plano"><input value={ef.plan ?? ""} onChange={(e) => setEf({ ...ef, plan: e.target.value })} /></Field>
          </div>
          <Field label="Website"><input value={ef.website ?? ""} onChange={(e) => setEf({ ...ef, website: e.target.value })} /></Field>
          <Field label="Observações"><textarea value={ef.notes ?? ""} onChange={(e) => setEf({ ...ef, notes: e.target.value })} /></Field>
        </>}
      </Modal>

      <Modal title="Convidar usuário" open={invite} onClose={() => setInvite(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setInvite(false)}><span className="crasto-btn__label">Cancelar</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={doInvite}><span className="crasto-btn__label">{busy ? "Criando…" : "Criar login"}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="E-mail *"><input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
        <Field label="Nome"><input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></Field>
        <Field label="Papel"><select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="client_owner">Dono</option><option value="client_member">Membro</option></select></Field>
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
