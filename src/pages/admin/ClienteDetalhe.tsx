import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Search, Send, Grid3x3, Pencil, Trash2, UserPlus, Plus, Upload, Download, FileText, Building2, Globe, Cake } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, initials, Field, money } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import { COUNTRIES, countryOf, STAGES, stageOf } from "../../lib/countries";

type Org = any;
const icon = (cat?: string | null) => { const c = (cat || "").toLowerCase(); return c.includes("atend") ? <MessageCircle size={16} /> : c.includes("market") ? <Send size={16} /> : c.includes("vend") ? <Search size={16} /> : <Grid3x3 size={16} />; };
const DOC_KINDS = [{ v: "cnpj_card", l: "Cartão CNPJ" }, { v: "contrato_social", l: "Contrato Social" }, { v: "plano_diretor", l: "Plano Diretor" }, { v: "socios", l: "Sócios" }, { v: "outro", l: "Outro" }];
const fmtDate = (s?: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");

export default function ClienteDetalhe() {
  const { id } = useParams();
  const nav = useNavigate();
  const tr = useT();
  const { data, loading, reload } = useAsync(async () => {
    if (!id) return null;
    const [org, mods, cm, users, people, phones, docs, acts, impl, health, taxids, proposals, tasks, creds] = await Promise.all([
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
      api.crm.taxIds.listByOrg(id),
      api.commerce.proposals.listByOrg(id),
      api.delivery.projectTasks.listByOrg(id),
      api.delivery.moduleCredentials.listByOrg(id),
    ]);
    return { org: org as Org, mods: (mods as any[]) ?? [], cm: (cm as any[]) ?? [], users: (users as any[]) ?? [], people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], docs: (docs as any[]) ?? [], acts: (acts as any[]) ?? [], progress: (impl as any)?.overall_progress ?? 0, health: (health as any)?.status ?? null, impl: (impl as any) ?? null, healthObj: (health as any) ?? null, taxids: (taxids as any[]) ?? [], proposals: (proposals as any[]) ?? [], tasks: (tasks as any[]) ?? [], creds: (creds as any[]) ?? [] };
  }, [id]);

  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState<Org>(null);
  const [invite, setInvite] = useState(false);
  const [inv, setInv] = useState({ email: "", name: "", role: "client_member" });
  const [person, setPerson] = useState({ full_name: "", role: "", email: "", birthday: "" });
  const [phone, setPhone] = useState({ label: "mobile", country_code: "+55", number: "", person_id: "" });
  const [act, setAct] = useState({ type: "note", title: "", description: "" });
  const [taxid, setTaxid] = useState({ kind: "CNPJ", value: "", address: "" });
  // F-D: implantação, saúde, tarefas, credenciais
  const [implForm, setImplForm] = useState({ progress: "0", due: "", status: "in_progress" });
  const [healthForm, setHealthForm] = useState({ status: "green", message: "" });
  const [taskf, setTaskf] = useState({ name: "", start: "", end: "" });
  const [credf, setCredf] = useState({ moduleId: "", label: "", url: "", login: "", secret: "", sso: false });
  const [modQuery, setModQuery] = useState("");
  const [modCat, setModCat] = useState("");
  useEffect(() => {
    const i = (data as any)?.impl, h = (data as any)?.healthObj;
    if (i) setImplForm({ progress: String(i.overall_progress ?? 0), due: i.due_date ?? "", status: i.status ?? "in_progress" });
    if (h) setHealthForm({ status: h.status ?? "green", message: h.message ?? "" });
  }, [data]);
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState(""); const [err, setErr] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 7000); };

  if (loading) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Carregando…</Empty></>;
  if (!data?.org) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Não encontrado.</Empty></>;
  const { org, mods, cm, users, people, phones, docs, acts, progress, health, taxids, proposals, impl, healthObj, tasks, creds } = data;
  const activeSet = new Set(cm.map((c) => c.vdi_module_id));
  const co = countryOf(org.country); const st = stageOf(org.stage);

  async function saveEdit() {
    setBusy(true);
    const cc = countryOf(ef.country);
    try {
      await api.identity.organizations.update(id!, { name: ef.name, stage: ef.stage, country: ef.country, tax_id: ef.tax_id, tax_id_type: cc.idType, founded_on: ef.founded_on || null, website: ef.website, owner_name: ef.owner_name, plan: ef.plan, notes: ef.notes, status: ef.status });
      setEdit(false); reload(); flash(tr("Dados atualizados ✓"));
    } catch (e) { flash(tr("Erro ao salvar:") + " " + errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function setStage(stage: string) { await api.identity.organizations.setStage(id!, stage); reload(); }
  async function toggleModule(mid: string, on: boolean) {
    if (on) await api.delivery.clientModules.detach(id!, mid);
    else await api.delivery.clientModules.attach(id!, mid);
    reload();
  }
  async function del() {
    if (!confirm(tr("Apagar \"{n}\" e TODOS os dados/logins? Não dá pra desfazer.", { n: org.name }))) return;
    setBusy(true);
    const r = await api.identity.clients.remove(id!);
    setBusy(false);
    if (r.ok) nav("/admin/clientes", { replace: true });
    else flash(tr("Erro ao apagar:") + " " + (r.error || tr("tente novamente")));
  }
  async function doInvite() {
    if (!inv.email.trim()) { setErr(tr("Informe o e-mail.")); return; }
    setBusy(true); setErr("");
    const r = await api.identity.users.create({ email: inv.email.trim(), full_name: inv.name, organization_id: id!, role: inv.role });
    setBusy(false);
    if (!r.ok) { setErr(r.error || tr("Erro.")); return; }
    setInvite(false); setInv({ email: "", name: "", role: "client_member" }); reload(); flash(tr("Login: {e} · senha: {p}", { e: r.email, p: r.password }));
  }
  async function addPerson() { if (!person.full_name.trim()) return; await api.crm.people.add({ organization_id: id, full_name: person.full_name.trim(), role: person.role || null, email: person.email || null, birthday: person.birthday || null }); setPerson({ full_name: "", role: "", email: "", birthday: "" }); reload(); }
  async function addPhone() { if (!phone.number.trim()) return; await api.crm.phones.add({ organization_id: id, label: phone.label, country_code: phone.country_code, number: phone.number.trim(), person_id: phone.person_id || null }); setPhone({ label: "mobile", country_code: "+55", number: "", person_id: "" }); reload(); }
  async function addActivity() { if (!act.title.trim()) return; await api.crm.activities.add({ organization_id: id, type: act.type, title: act.title.trim(), description: act.description || null }); setAct({ type: "note", title: "", description: "" }); reload(); }
  async function delRow(_schema: string, table: string, rid: string) { await api.crm.removeRow(table as any, rid); reload(); }
  async function addTaxid() {
    if (!taxid.value.trim()) return;
    const first = (data?.taxids?.length ?? 0) === 0;
    await api.crm.taxIds.add({ organization_id: id, kind: taxid.kind, value: taxid.value.trim(), address: taxid.address.trim() || null, is_primary: first });
    setTaxid({ kind: "CNPJ", value: "", address: "" }); reload();
  }
  async function acceptProposal(pid: string) {
    if (!confirm(tr("Marcar esta proposta como GANHA? Isso define o plano do cliente e registra a comissão do agente."))) return;
    setBusy(true);
    try { await api.commerce.proposals.accept(pid); reload(); flash(tr("Proposta marcada como ganha ✓")); }
    catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function reopenProposal(pid: string) {
    if (!confirm(tr("Reabrir a proposta? A comissão vinculada será removida."))) return;
    setBusy(true);
    try { await api.commerce.proposals.reopen(pid); reload(); }
    catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function setPrimaryTaxid(tid: string) { await api.crm.taxIds.setPrimary(id!, tid); reload(); }
  async function delTaxid(tid: string) { await api.crm.taxIds.remove(tid); reload(); }
  async function saveImpl() {
    setBusy(true);
    try { await api.delivery.implementations.upsert(id!, { overall_progress: Math.max(0, Math.min(100, Number(implForm.progress) || 0)), due_date: implForm.due || null, status: implForm.status }); reload(); flash(tr("Implantação atualizada ✓")); }
    catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  async function saveHealth() {
    setBusy(true);
    try { await api.delivery.systemHealth.upsert(id!, { status: healthForm.status, message: healthForm.message || null }); reload(); flash(tr("Farol atualizado ✓")); }
    catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  async function addTask() {
    if (!taskf.name.trim()) return;
    await api.delivery.projectTasks.add({ organization_id: id, name: taskf.name.trim(), planned_start: taskf.start || null, planned_end: taskf.end || null, status: "todo", sort_order: (tasks?.length ?? 0) });
    setTaskf({ name: "", start: "", end: "" }); reload();
  }
  async function setTaskStatus(tid: string, status: string) {
    const patch: any = { status };
    if (status === "doing") patch.actual_start = new Date().toISOString().slice(0, 10);
    if (status === "done") { patch.actual_end = new Date().toISOString().slice(0, 10); patch.progress = 100; }
    await api.delivery.projectTasks.update(tid, patch); reload();
  }
  async function delTask(tid: string) { await api.delivery.projectTasks.remove(tid); reload(); }
  /** Ao escolher o módulo, sugere a URL padrão do template (o admin pode trocar pela URL do cliente). */
  function pickCredModule(moduleId: string) {
    const m = mods.find((x) => x.id === moduleId);
    setCredf((p) => ({ ...p, moduleId, url: p.url || (m as any)?.external_url || "", label: p.label || m?.name || "" }));
  }
  async function saveCred() {
    if (!credf.moduleId || (!credf.login.trim() && !credf.url.trim() && !credf.sso)) { flash(tr("Escolha o módulo e informe a URL ou o login.")); return; }
    setBusy(true);
    try {
      const m = mods.find((x) => x.id === credf.moduleId);
      await api.delivery.moduleCredentials.set({ orgId: id!, moduleId: credf.moduleId, label: credf.label || m?.name || "Acesso", url: credf.url.trim(), login: credf.login.trim(), secret: credf.secret, sso: credf.sso });
      setCredf({ moduleId: "", label: "", url: "", login: "", secret: "", sso: false }); reload(); flash(tr("Credencial salva ✓"));
    } catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  async function delCred(cid: string) { await api.delivery.moduleCredentials.remove(cid); reload(); }
  async function uploadDoc(file: File, kind: string) {
    setBusy(true);
    try {
      const key = await api.storage.upload(id!, file);
      await api.crm.documents.add({ organization_id: id, kind, file_name: file.name, storage_path: key });
      flash(tr("Documento enviado ✓ (Cloudflare R2)"));
    } catch (e) { flash(tr("Erro no upload:") + " " + errorMessage(e)); }
    setBusy(false); reload();
  }
  async function downloadDoc(path: string) { const url = await api.storage.getUrl(path); if (url) window.open(url, "_blank"); }
  async function delDoc(d: any) { await api.storage.remove(d.storage_path); await api.crm.documents.remove(d.id); reload(); }
  async function resendAccess(u: any) {
    if (!confirm(tr("Redefinir a senha de {e} e reenviar o e-mail de acesso da Crasto.AI?", { e: u.email }))) return;
    setBusy(true);
    const r = await api.identity.users.resendAccess({ user_id: u.id, email: u.email, full_name: u.full_name || "" });
    setBusy(false);
    if (!r.ok) { flash(tr("Falha ao reenviar:") + " " + (r.error || "erro")); return; }
    flash(r.email_sent ? tr("✉️ Acesso reenviado para {e}.", { e: u.email }) : tr("Senha redefinida, mas e-mail não enviado: {err}", { err: r.email_error || "" }));
  }

  return (
    <div>
      <PageHead eyebrow={`CRM · ${co.flag} ${co.name}`} title={org.name} sub={`${co.idLabel}: ${org.tax_id || "—"}  ·  ${org.website || "sem site"}`}
        right={<>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { setEf(org); setEdit(true); }}><span className="crasto-btn__icon"><Pencil size={14} /></span><span className="crasto-btn__label">{tr("Editar")}</span></button>
          <button className="crasto-btn crasto-btn--destructive crasto-btn--sm" onClick={del} disabled={busy}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">{tr("Excluir")}</span></button>
        </>} />

      {/* pipeline */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STAGES.map((s) => <button key={s.key} className={"stagetab" + (org.stage === s.key ? " on" : "")} onClick={() => setStage(s.key)}>{tr(s.label)}</button>)}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--crasto-text-muted)" }}>{tr("Status atual:")} <b style={{ color: "var(--crasto-text-primary)" }}>{tr(st.label)}</b></span>
      </div>

      {/* Dados da empresa (cadastro) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Building2 size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{tr("Dados da empresa")}</h3></div>
        <div className="infogrid">
          <div><div className="infolab">{tr("País")}</div><div className="infoval">{co.flag} {co.name}</div></div>
          <div><div className="infolab">{co.idLabel}</div><div className="infoval tnum">{org.tax_id || "—"}</div></div>
          <div><div className="infolab">{tr("Fundação")}</div><div className="infoval">{fmtDate(org.founded_on)}</div></div>
          <div><div className="infolab">{tr("Dono / Presidente")}</div><div className="infoval">{org.owner_name || "—"}</div></div>
          <div><div className="infolab">{tr("Website")}</div><div className="infoval">{org.website ? <a href={org.website} target="_blank" rel="noreferrer" style={{ color: "#3E6FB8" }}>{org.website}</a> : "—"}</div></div>
          <div><div className="infolab">{tr("Plano")}</div><div className="infoval">{org.plan || "—"}</div></div>
        </div>
        {org.notes && <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 13, color: "var(--crasto-text-body)" }}><b>{tr("Observações:")}</b> {org.notes}</div>}
      </div>

      {/* CNPJs & endereços de faturamento */}
      <div className="sec-h" style={{ marginTop: 4 }}><h2>{tr("CNPJs & endereços de faturamento")}</h2><Pill tone="mute">{tr("usado nas propostas")}</Pill></div>
      <div className="addrow">
        <select value={taxid.kind} onChange={(e) => setTaxid({ ...taxid, kind: e.target.value })}><option value="CNPJ">CNPJ</option><option value="CPF">CPF</option><option value="EIN">EIN</option><option value="VAT">VAT</option><option value="Outro">{tr("Outro")}</option></select>
        <input placeholder={tr("Número do documento")} value={taxid.value} onChange={(e) => setTaxid({ ...taxid, value: e.target.value })} style={{ flex: 1, minWidth: 150 }} />
        <input placeholder={tr("Endereço de faturamento (rua, nº, cidade/UF, CEP)")} value={taxid.address} onChange={(e) => setTaxid({ ...taxid, address: e.target.value })} style={{ flex: 2, minWidth: 200 }} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addTaxid}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Adicionar")}</span></button>
      </div>
      {taxids.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhum CNPJ cadastrado — a proposta usará o {id} do cadastro acima.", { id: countryOf(org.country).idLabel })}</div> : taxids.map((t) => (
        <div className="crmrow" key={t.id}>
          <Pill tone={t.is_primary ? "ok" : "info"}>{t.kind}</Pill>
          <div><div className="nm tnum">{t.value} {t.is_primary && <span className="chip" style={{ marginLeft: 6, background: "var(--crasto-navy-05)", color: "var(--crasto-text-primary)" }}>{tr("principal")}</span>}</div><div className="mt">{t.address || tr("sem endereço")}</div></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {!t.is_primary && <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setPrimaryTaxid(t.id)} title={tr("Tornar o CNPJ principal")}><span className="crasto-btn__label">{tr("Tornar principal")}</span></button>}
            <button className="icobtn rm" onClick={() => delTaxid(t.id)} title={tr("Excluir")}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}

      {/* Propostas / contrato ganho */}
      <div className="sec-h" style={{ marginTop: 20 }}><h2>{tr("Propostas & contrato")}</h2><Pill tone="mute">{tr("marcar como ganha liga o MRR")}</Pill></div>
      {(proposals ?? []).length === 0 ? <div className="mt" style={{ padding: "4px 2px 14px" }}>{tr("Nenhuma proposta gerada. Use o Gerador de propostas.")}</div> : (
        <div style={{ marginBottom: 22 }}>
          {(proposals ?? []).map((p) => {
            const won = p.status === "accepted";
            return (
              <div className="crmrow" key={p.id}>
                <Pill tone={won ? "ok" : p.status === "rejected" ? "crit" : "info"}>{won ? tr("Ganha") : p.status === "rejected" ? tr("Recusada") : p.status === "draft" ? tr("Rascunho") : tr("Enviada")}</Pill>
                <div style={{ flex: 1 }}><div className="nm">{p.title || tr("Proposta")}</div><div className="mt tnum">{money(p.subtotal)}{won && p.accepted_at ? ` · ${tr("ganha em")} ${fmtDate(p.accepted_at)}` : ""}</div></div>
                {won
                  ? <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => reopenProposal(p.id)}><span className="crasto-btn__label">{tr("Reabrir")}</span></button>
                  : <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={() => acceptProposal(p.id)}><span className="crasto-btn__label">{tr("Marcar como ganha")}</span></button>}
              </div>
            );
          })}
        </div>
      )}

      <div className="kpis" style={{ marginBottom: 22 }}>
        <div className="kpi g"><div className="lab">{tr("Implantação")}</div><div className="val tnum">{progress}<small>%</small></div><div className="delta">{health === "green" ? tr("no ar") : "—"}</div></div>
        <div className="kpi"><div className="lab">{tr("Módulos ativos")}</div><div className="val tnum">{cm.filter((c) => c.status === "active").length}</div><div className="delta">{tr("liberados")}</div></div>
        <div className="kpi"><div className="lab">{tr("Pessoas")}</div><div className="val tnum">{people.length}</div><div className="delta">{tr("contatos")}</div></div>
        <div className="kpi"><div className="lab">{tr("Documentos")}</div><div className="val tnum">{docs.length}</div><div className="delta">{tr("arquivos")}</div></div>
      </div>

      {/* Pessoas */}
      <div className="sec-h"><h2>{tr("Pessoas da empresa")}</h2></div>
      <div className="addrow">
        <input placeholder={tr("Nome completo")} value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} style={{ flex: 2, minWidth: 140 }} />
        <input placeholder={tr("Cargo (dono, diretor…)")} value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <input placeholder={tr("E-mail")} value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
        <input type="date" title={tr("Aniversário")} value={person.birthday} onChange={(e) => setPerson({ ...person, birthday: e.target.value })} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addPerson}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Adicionar")}</span></button>
      </div>
      {people.map((p) => (
        <div className="crmrow" key={p.id}>
          <div className="logo" style={{ width: 34, height: 34, borderRadius: 9, background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{initials(p.full_name)}</div>
          <div><div className="nm">{p.full_name} {p.role && <span className="chip" style={{ marginLeft: 6 }}>{p.role}</span>}</div><div className="mt">{p.email || tr("sem e-mail")}{p.birthday ? ` · 🎂 ${fmtDate(p.birthday)}` : ""}</div></div>
          <button className="icobtn rm" onClick={() => delRow("crm", "people", p.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      {/* Telefones */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Telefones")}</h2></div>
      <div className="addrow">
        <select value={phone.label} onChange={(e) => setPhone({ ...phone, label: e.target.value })}><option value="mobile">{tr("Celular")}</option><option value="fixo">{tr("Fixo")}</option><option value="whatsapp">WhatsApp</option></select>
        <select value={phone.country_code} onChange={(e) => setPhone({ ...phone, country_code: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.ddi}>{c.flag} {c.ddi}</option>)}</select>
        <input placeholder={tr("Número")} value={phone.number} onChange={(e) => setPhone({ ...phone, number: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
        <select value={phone.person_id} onChange={(e) => setPhone({ ...phone, person_id: e.target.value })}><option value="">{tr("(empresa)")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addPhone}><span className="crasto-btn__label">{tr("Adicionar")}</span></button>
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
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Documentos")}</h2></div>
      <div className="addrow">
        <label className="crasto-btn crasto-btn--secondary crasto-btn--sm" style={{ cursor: "pointer" }}>
          <span className="crasto-btn__icon"><Upload size={14} /></span><span className="crasto-btn__label">{busy ? tr("Enviando…") : tr("Enviar documento")}</span>
          <input type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadDoc(file, (document.getElementById("dockind") as HTMLSelectElement)?.value || "outro"); e.target.value = ""; }} />
        </label>
        <select id="dockind">{DOC_KINDS.map((k) => <option key={k.v} value={k.v}>{tr(k.l)}</option>)}</select>
        <span className="mt">{tr("Cartão CNPJ, contrato social, plano diretor, sócios…")}</span>
      </div>
      {docs.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhum documento.")}</div> : docs.map((d) => (
        <div className="dcard" key={d.id}>
          <span className="ic"><FileText size={16} /></span>
          <div><div className="nm">{d.file_name}</div><div className="mt">{tr(DOC_KINDS.find((k) => k.v === d.kind)?.l || d.kind)} · {fmtDate(d.uploaded_at)}</div></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="icobtn" title={tr("Baixar")} onClick={() => downloadDoc(d.storage_path)}><Download size={14} /></button>
            <button className="icobtn" title={tr("Excluir")} onClick={() => delDoc(d)}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}

      {/* Módulos */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Módulos contratados")}</h2><Pill tone="mute">{tr("{n} liberados", { n: activeSet.size })}</Pill></div>
      {mods.length === 0 ? <Empty>Cadastre módulos no Catálogo primeiro.</Empty> : (() => {
        const q = modQuery.trim().toLowerCase();
        const catOf = (m: any) => (m.department || m.category || tr("Outros")) as string;
        const cats = Array.from(new Set(mods.map(catOf))).sort((a, b) => a.localeCompare(b, "pt"));
        const filtered = mods.filter((m) => {
          const matchQ = !q || `${m.name} ${catOf(m)}`.toLowerCase().includes(q);
          if (modCat === "__on") return activeSet.has(m.id) && matchQ;
          return (!modCat || catOf(m) === modCat) && matchQ;
        });
        const groups: Record<string, any[]> = {};
        filtered.forEach((m) => { (groups[catOf(m)] ||= []).push(m); });
        const order = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pt"));
        const grouped = !modCat; // visão "Todas" mostra os cabeçalhos por categoria
        const card = (m: any) => {
          const on = activeSet.has(m.id);
          return (
            <div className="arow" key={m.id}>
              <span className="ico" style={{ background: on ? "var(--crasto-text-primary)" : "var(--crasto-text-faint)" }}>{icon(m.category)}</span>
              <span><span className="t">{m.name}</span><br /><span className="s">{on ? tr("Liberado no portal") : tr("Não contratado")}</span></span>
              <button className={"sw" + (on ? " on" : "")} onClick={() => toggleModule(m.id, on)} />
            </div>
          );
        };
        return (
          <>
            <div className="catsearch">
              <Search size={16} />
              <input value={modQuery} onChange={(e) => setModQuery(e.target.value)} placeholder={tr("Buscar módulo…")} />
              <span className="mt" style={{ whiteSpace: "nowrap" }}>{tr("{n} de {total}", { n: filtered.length, total: mods.length })}</span>
            </div>
            <div className="cattabs">
              <button className={"cattab" + (!modCat ? " is-active" : "")} onClick={() => setModCat("")}>{tr("Todas")}<span className="cnt">{mods.length}</span></button>
              <button className={"cattab" + (modCat === "__on" ? " is-active" : "")} onClick={() => setModCat("__on")}>{tr("Contratados")}<span className="cnt">{activeSet.size}</span></button>
              {cats.map((c) => (
                <button key={c} className={"cattab" + (modCat === c ? " is-active" : "")} onClick={() => setModCat(c)}>{c}<span className="cnt">{mods.filter((m) => catOf(m) === c).length}</span></button>
              ))}
            </div>
            {filtered.length === 0 ? <Empty>{tr("Nenhum módulo encontrado.")}</Empty> : grouped ? order.map((d) => (
              <div key={d} style={{ marginBottom: 8 }}>
                <div className="sec-h" style={{ marginTop: 18 }}><h2>{d}</h2><Pill tone="mute">{tr("{n} módulos", { n: groups[d].length })}</Pill></div>
                <div className="assign">{groups[d].map(card)}</div>
              </div>
            )) : <div className="assign">{filtered.map(card)}</div>}
          </>
        );
      })()}

      {/* Implantação & Saúde (F-D) */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Implantação & saúde")}</h2><Pill tone="mute">{tr("o cliente vê no Gantt e no farol")}</Pill></div>
      <div className="grid2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>{tr("Andamento da implantação")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
            <label className="frow"><span>{tr("Progresso (%)")}</span><input type="number" min={0} max={100} value={implForm.progress} onChange={(e) => setImplForm({ ...implForm, progress: e.target.value })} /></label>
            <label className="frow"><span>{tr("Prazo de entrega")}</span><input type="date" value={implForm.due} onChange={(e) => setImplForm({ ...implForm, due: e.target.value })} /></label>
          </div>
          <label className="frow"><span>{tr("Status")}</span><select value={implForm.status} onChange={(e) => setImplForm({ ...implForm, status: e.target.value })}><option value="in_progress">{tr("Em andamento")}</option><option value="delivered">{tr("Entregue")}</option><option value="on_hold">{tr("Em espera")}</option></select></label>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginTop: 8 }} disabled={busy} onClick={saveImpl}><span className="crasto-btn__label">{tr("Salvar")}</span></button>
        </div>
        <div className="card">
          <h3>{tr("Farol de saúde")}</h3>
          <label className="frow" style={{ marginTop: 8 }}><span>{tr("Status")}</span><select value={healthForm.status} onChange={(e) => setHealthForm({ ...healthForm, status: e.target.value })}><option value="green">🟢 {tr("No ar")}</option><option value="amber">🟡 {tr("Atenção")}</option><option value="red">🔴 {tr("Crítico")}</option></select></label>
          <label className="frow"><span>{tr("Mensagem ao cliente")}</span><input value={healthForm.message} onChange={(e) => setHealthForm({ ...healthForm, message: e.target.value })} placeholder={tr("Ex.: Tudo funcionando normalmente.")} /></label>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginTop: 8 }} disabled={busy} onClick={saveHealth}><span className="crasto-btn__label">{tr("Salvar")}</span></button>
        </div>
      </div>

      {/* Tarefas / cronograma */}
      <div className="sec-h"><h2>{tr("Etapas do cronograma")}</h2><Pill tone="mute">{tr("vira o Gantt do cliente")}</Pill></div>
      <div className="addrow">
        <input placeholder={tr("Nome da etapa")} value={taskf.name} onChange={(e) => setTaskf({ ...taskf, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
        <input type="date" title={tr("Início previsto")} value={taskf.start} onChange={(e) => setTaskf({ ...taskf, start: e.target.value })} />
        <input type="date" title={tr("Fim previsto")} value={taskf.end} onChange={(e) => setTaskf({ ...taskf, end: e.target.value })} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addTask}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Adicionar")}</span></button>
      </div>
      {(tasks ?? []).length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhuma etapa. Adicione o cronograma acima.")}</div> : (tasks ?? []).map((tk) => (
        <div className="crmrow" key={tk.id}>
          <Pill tone={tk.status === "done" ? "ok" : tk.status === "doing" ? "warn" : "mute"}>{tk.status === "done" ? tr("Feito") : tk.status === "doing" ? tr("Fazendo") : tr("A fazer")}</Pill>
          <div style={{ flex: 1 }}><div className="nm">{tk.name}</div><div className="mt">{tk.planned_start ? fmtDate(tk.planned_start) : "—"} → {tk.planned_end ? fmtDate(tk.planned_end) : "—"}</div></div>
          <select value={tk.status} onChange={(e) => setTaskStatus(tk.id, e.target.value)} style={{ width: 130 }}><option value="todo">{tr("A fazer")}</option><option value="doing">{tr("Fazendo")}</option><option value="done">{tr("Feito")}</option></select>
          <button className="icobtn rm" onClick={() => delTask(tk.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      {/* Credenciais de módulo (F-D) */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Acesso por módulo (URL + login do cliente)")}</h2><Pill tone="mute">{tr("o cliente vê em 'Minhas Soluções'")}</Pill></div>
      <div className="addrow" style={{ flexWrap: "wrap" }}>
        <select value={credf.moduleId} onChange={(e) => pickCredModule(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">{tr("Módulo…")}</option>
          {mods.filter((m) => activeSet.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input placeholder={tr("URL de acesso do cliente (https://…)")} value={credf.url} onChange={(e) => setCredf({ ...credf, url: e.target.value })} style={{ flex: 2, minWidth: 200 }} />
        <input placeholder={tr("Login")} value={credf.login} onChange={(e) => setCredf({ ...credf, login: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <input placeholder={tr("Senha")} value={credf.secret} onChange={(e) => setCredf({ ...credf, secret: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--crasto-text-body)" }}><input type="checkbox" checked={credf.sso} onChange={(e) => setCredf({ ...credf, sso: e.target.checked })} style={{ width: "auto" }} />{tr("Entra direto (SSO)")}</label>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveCred}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Salvar")}</span></button>
      </div>
      {(creds ?? []).length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhum acesso cadastrado — o cliente veria vazio.")}</div> : (creds ?? []).map((c) => (
        <div className="crmrow" key={c.id}>
          <Pill tone={c.sso_enabled ? "ok" : "info"}>{c.sso_enabled ? "SSO" : tr("Login/senha")}</Pill>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{c.label || (mods.find((m) => m.id === c.vdi_module_id)?.name)}</div>
            <div className="mt" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.access_url ? c.access_url : tr("Sem URL")}{" · "}{c.sso_enabled ? tr("Entra direto") : (c.login || "—")}</div>
          </div>
          <button className="icobtn rm" onClick={() => delCred(c.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      {/* Usuários */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Usuários (acesso ao portal)")}</h2><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setInvite(true)}><span className="crasto-btn__icon"><UserPlus size={14} /></span><span className="crasto-btn__label">{tr("Convidar")}</span></button></div>
      <div className="tbl-wrap">
        <table className="tbl"><thead><tr><th>{tr("Usuário")}</th><th>{tr("Papel")}</th><th>{tr("E-mail")}</th><th>{tr("Acesso")}</th></tr></thead><tbody>
          {users.length === 0 ? <tr><td colSpan={4} style={{ color: "var(--crasto-text-muted)" }}>{tr("Sem logins — convide o responsável.")}</td></tr> : users.map((u) => (
            <tr key={u.id}><td><div className="cust"><div className="logo" style={{ background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)" }}>{initials(u.full_name || u.email)}</div><div className="nm">{u.full_name || "—"}</div></div></td><td><Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{u.role === "client_owner" ? tr("Dono") : tr("Membro")}</Pill></td><td className="cust"><span className="em">{u.email}</span></td><td><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => resendAccess(u)} title={tr("Redefine a senha e reenvia o e-mail de acesso")}><span className="crasto-btn__label">{tr("Reenviar acesso")}</span></button></td></tr>
          ))}
        </tbody></table>
      </div>

      {/* Histórico */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Histórico & atividades")}</h2></div>
      <div className="addrow">
        <select value={act.type} onChange={(e) => setAct({ ...act, type: e.target.value })}><option value="note">{tr("Nota")}</option><option value="conversation">{tr("Conversa")}</option><option value="order">{tr("Pedido")}</option><option value="meeting">{tr("Reunião")}</option><option value="proposal">{tr("Proposta")}</option></select>
        <input placeholder={tr("Título (ex.: Ligação com o dono)")} value={act.title} onChange={(e) => setAct({ ...act, title: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
        <input placeholder={tr("Detalhe (opcional)")} value={act.description} onChange={(e) => setAct({ ...act, description: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addActivity}><span className="crasto-btn__label">{tr("Registrar")}</span></button>
      </div>
      {acts.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Sem histórico ainda.")}</div> : acts.map((a) => (
        <div className="lead" key={a.id}><div className="av">{({ note: "📝", conversation: "💬", order: "🛒", meeting: "📅", proposal: "📄" } as any)[a.type] || "•"}</div><div><div className="nm">{a.title}</div><div className="mt">{a.description || a.type} · {fmtDate(a.occurred_at)}</div></div><button className="icobtn rm" onClick={() => delRow("crm", "activities", a.id)}><Trash2 size={13} /></button></div>
      ))}

      {/* Modal editar empresa */}
      <Modal title={tr("Editar empresa")} open={edit && !!ef} onClose={() => setEdit(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setEdit(false)}><span className="crasto-btn__label">{tr("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveEdit}><span className="crasto-btn__label">{busy ? tr("Salvando…") : tr("Salvar")}</span></button></>}>
        {ef && <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Status"><select value={ef.stage} onChange={(e) => setEf({ ...ef, stage: e.target.value })}>{STAGES.map((s) => <option key={s.key} value={s.key}>{tr(s.label)}</option>)}</select></Field>
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

      <Modal title={tr("Convidar usuário")} open={invite} onClose={() => setInvite(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setInvite(false)}><span className="crasto-btn__label">{tr("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={doInvite}><span className="crasto-btn__label">{busy ? tr("Criando…") : tr("Criar login")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="E-mail *"><input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
        <Field label="Nome"><input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></Field>
        <Field label="Papel"><select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="client_owner">{tr("Dono")}</option><option value="client_member">{tr("Membro")}</option></select></Field>
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
