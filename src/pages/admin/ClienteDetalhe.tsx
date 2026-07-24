import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Search, Send, Grid3x3, Pencil, Trash2, UserPlus, Plus, Upload, Download, FileText, Building2, Globe, Cake, Eye } from "lucide-react";
import { preview } from "../../lib/preview";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, initials, Avatar, Field, money } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import UsoModulos from "../../ui/UsoModulos";
import Modal from "../../ui/Modal";
import { COUNTRIES, countryOf, STAGES, stageOf, DIAL_CODES } from "../../lib/countries";
import { reg as regInfo, regTypeFor, COUNTRIES as REG_COUNTRIES, countryName as regCountryName } from "../../lib/registrations";
import { CrmAccessSection } from "./CrmAccessSection";
import DiagnosticoCard from "./DiagnosticoCard";

type Org = any;
const icon = (cat?: string | null) => { const c = (cat || "").toLowerCase(); return c.includes("atend") ? <MessageCircle size={16} /> : c.includes("market") ? <Send size={16} /> : c.includes("vend") ? <Search size={16} /> : <Grid3x3 size={16} />; };
const DOC_KINDS = [{ v: "cnpj_card", l: "Cartão CNPJ" }, { v: "contrato_social", l: "Contrato Social" }, { v: "plano_diretor", l: "Plano Diretor" }, { v: "socios", l: "Sócios" }, { v: "outro", l: "Outro" }];
const fmtDate = (s?: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");

export default function ClienteDetalhe({ onStageChange }: { onStageChange?: (s: string) => void } = {}) {
  const { id } = useParams();
  const nav = useNavigate();
  const tr = useT();
  const { data, loading, reload } = useAsync(async () => {
    if (!id) return null;
    const [org, mods, cm, users, people, phones, docs, acts, impl, health, taxids, proposals, tasks, creds, csvc, svcCat, cnpjs, partners] = await Promise.all([
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
      api.delivery.clientServices.listByOrg(id),
      api.catalog.services.listClientFacing(),
      api.identity.cnpjs.listByOrg(id).catch(() => []),
      api.identity.partners.listByOrg(id).catch(() => []),
    ]);
    return { org: org as Org, mods: (mods as any[]) ?? [], cm: (cm as any[]) ?? [], users: (users as any[]) ?? [], people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], docs: (docs as any[]) ?? [], acts: (acts as any[]) ?? [], progress: (impl as any)?.overall_progress ?? 0, health: (health as any)?.status ?? null, impl: (impl as any) ?? null, healthObj: (health as any) ?? null, taxids: (taxids as any[]) ?? [], proposals: (proposals as any[]) ?? [], tasks: (tasks as any[]) ?? [], creds: (creds as any[]) ?? [], csvc: (csvc as any[]) ?? [], svcCat: (svcCat as any[]) ?? [], cnpjs: (cnpjs as any[]) ?? [], partners: (partners as any[]) ?? [] };
  }, [id]);

  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState<Org>(null);
  const [invite, setInvite] = useState(false);
  const [inv, setInv] = useState({ email: "", name: "", role: "client_member" });
  // Edição de usuário do Portal (nome/e-mail/papel).
  const [euOpen, setEuOpen] = useState(false);
  const [eu, setEu] = useState<{ id: string; name: string; email: string; role: string }>({ id: "", name: "", email: "", role: "client_member" });
  const [person, setPerson] = useState({ full_name: "", role: "", email: "", birthday: "" });
  const [phone, setPhone] = useState({ label: "mobile", country_code: "+55", number: "", person_id: "" });
  const [epId, setEpId] = useState("");
  const [ep, setEp] = useState({ full_name: "", role: "", email: "", birthday: "" });
  const [ephId, setEphId] = useState("");
  const [eph, setEph] = useState({ label: "mobile", country_code: "+55", number: "", person_id: "" });
  const [act, setAct] = useState({ type: "note", title: "", description: "" });
  const [taxid, setTaxid] = useState({ kind: "CNPJ", value: "", address: "" });
  const [regOpen, setRegOpen] = useState(false);
  const [regF, setRegF] = useState<any>({ id: "", organization_id: id, country: "BR", reg_type: "cnpj", cnpj: "", legal_name: "", trade_name: "", is_headquarters: false, is_active: true });
  function newReg() { setRegF({ id: "", organization_id: id, country: "BR", reg_type: "cnpj", cnpj: "", legal_name: "", trade_name: "", is_headquarters: false, is_active: true }); setRegOpen(true); }
  function editReg(c: any) { setRegF({ id: c.id, organization_id: id, country: c.country || "BR", reg_type: c.reg_type || "cnpj", cnpj: c.cnpj || "", legal_name: c.legal_name || "", trade_name: c.trade_name || "", is_headquarters: !!c.is_headquarters, is_active: c.is_active !== false }); setRegOpen(true); }
  async function saveReg() { if (regF.cnpj && !regInfo(regF.reg_type).validate(regF.cnpj)) { alert(tr("Número do registro inválido para o país selecionado.")); return; } try { await api.identity.cnpjs.adminSave(regF); setRegOpen(false); reload(); } catch (e) { alert(errorMessage(e)); } }
  async function delReg(c: any) { if (!confirm(tr("Excluir este registro?"))) return; await api.identity.cnpjs.adminRemove(c.id); reload(); }
  async function delPartner(p: any) { if (!confirm(tr("Excluir o sócio \"{n}\"?", { n: p.full_name || "sócio" }))) return; try { await api.identity.partners.remove(p.id); reload(); } catch (e) { alert(errorMessage(e)); } }
  // F-D: implantação, saúde, tarefas, credenciais
  const [rolloutForm, setRolloutForm] = useState<Record<string, { label: string; progress: string; due: string; status: string }>>({});
  const [healthForm, setHealthForm] = useState({ status: "green", message: "" });
  const [taskf, setTaskf] = useState({ name: "", start: "", end: "" });
  const [credf, setCredf] = useState({ cmId: "", label: "", url: "", login: "", secret: "", sso: false, mode: "link" });
  const [modQuery, setModQuery] = useState("");
  const [modCat, setModCat] = useState("__on");
  const [svcQuery, setSvcQuery] = useState("");
  const [svcRows, setSvcRows] = useState<any[]>([]);
  useEffect(() => {
    const h = (data as any)?.healthObj;
    if (h) setHealthForm({ status: h.status ?? "green", message: h.message ?? "" });
    const cms = ((data as any)?.cm ?? []) as any[];
    const rf: Record<string, { label: string; progress: string; due: string; status: string }> = {};
    cms.forEach((c) => { rf[c.id] = { label: c.label ?? "", progress: String(c.rollout_progress ?? 0), due: c.rollout_due ?? "", status: c.rollout_status ?? "in_progress" }; });
    setRolloutForm(rf);
    setSvcRows(((data as any)?.csvc ?? []) as any[]);
  }, [data]);
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState(""); const [err, setErr] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 7000); };

  if (loading) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Carregando…</Empty></>;
  if (!data?.org) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Não encontrado.</Empty></>;
  const { org, mods, cm, users, people, phones, docs, acts, progress, health, taxids, proposals, impl, healthObj, tasks, creds, svcCat, cnpjs, partners } = data;
  const activeSet = new Set(cm.map((c) => c.vdi_module_id));
  const rollAvg = cm.length ? Math.round(cm.reduce((s: number, c: any) => s + (c.rollout_progress || 0), 0) / cm.length) : (progress || 0);
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
  async function setStage(stage: string) { await api.identity.organizations.setStage(id!, stage); onStageChange?.(stage); if (stage === "cliente") reload(); }
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
    setInvite(false); setInv({ email: "", name: "", role: "client_member" }); reload();
    // Não há senha para mostrar: a pessoa define a dela pelo link. É o ponto da mudança.
    flash(r.email_sent
      ? tr("✉️ Convite enviado para {e} — ela define a própria senha.", { e: r.email ?? inv.email.trim() })
      : tr("Acesso criado, mas o e-mail falhou: {err}", { err: r.email_error || "—" }));
  }
  function startEditUser(u: any) { setEu({ id: u.id, name: u.full_name || "", email: u.email || "", role: u.role || "client_member" }); setErr(""); setEuOpen(true); }
  async function saveUser() {
    if (!eu.email.trim()) { setErr(tr("Informe o e-mail.")); return; }
    setBusy(true); setErr("");
    const r = await api.identity.users.update(eu.id, { full_name: eu.name.trim(), email: eu.email.trim(), role: eu.role });
    setBusy(false);
    if (!r.ok) { setErr(r.error || tr("Erro.")); return; }
    setEuOpen(false); reload(); flash(tr("Usuário atualizado."));
  }
  async function addPerson() { if (!person.full_name.trim()) return; await api.crm.people.add({ organization_id: id, full_name: person.full_name.trim(), role: person.role || null, email: person.email || null, birthday: person.birthday || null }); setPerson({ full_name: "", role: "", email: "", birthday: "" }); reload(); }
  async function addPhone() { if (!phone.number.trim()) return; await api.crm.phones.add({ organization_id: id, label: phone.label, country_code: phone.country_code, number: phone.number.trim(), person_id: phone.person_id || null }); setPhone({ label: "mobile", country_code: "+55", number: "", person_id: "" }); reload(); }
  function startEditPerson(p: any) { setEpId(p.id); setEp({ full_name: p.full_name || "", role: p.role || "", email: p.email || "", birthday: p.birthday || "" }); }
  async function savePerson() { if (!ep.full_name.trim()) return; await api.crm.people.update(epId, { full_name: ep.full_name.trim(), role: ep.role || null, email: ep.email || null, birthday: ep.birthday || null }); setEpId(""); reload(); }
  function startEditPhone(ph: any) { setEphId(ph.id); setEph({ label: ph.label || "mobile", country_code: ph.country_code || "+55", number: ph.number || "", person_id: ph.person_id || "" }); }
  async function savePhone() { if (!eph.number.trim()) return; await api.crm.phones.update(ephId, { label: eph.label, country_code: eph.country_code, number: eph.number.trim(), person_id: eph.person_id || null }); setEphId(""); reload(); }
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
  async function saveRollout(cmId: string) {
    const rf = rolloutForm[cmId]; if (!rf) return;
    setBusy(true);
    try { await api.delivery.clientModules.updateRollout(cmId, { label: rf.label.trim() || null, rollout_progress: Math.max(0, Math.min(100, Number(rf.progress) || 0)), rollout_due: rf.due || null, rollout_status: rf.status }); reload(); flash(tr("Instância salva ✓")); }
    catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  const setRf = (cmId: string, patch: Partial<{ label: string; progress: string; due: string; status: string }>) =>
    setRolloutForm((s) => ({ ...s, [cmId]: { label: "", progress: "0", due: "", status: "in_progress", ...s[cmId], ...patch } }));
  async function dupInstance(c: any) { setBusy(true); try { await api.delivery.clientModules.addInstance(id!, c.vdi_module_id, ""); reload(); flash(tr("Instância duplicada ✓ Dê um apelido para diferenciar.")); } catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); } }
  async function delInstance(cmId: string) { if (!confirm(tr("Excluir esta instância? O acesso e o andamento dela serão removidos."))) return; await api.delivery.clientModules.removeInstance(cmId); reload(); }
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
  /** Ao escolher a instância, sugere apelido + URL padrão do template (o admin pode trocar). */
  function pickCredInstance(cmId: string) {
    const c = cm.find((x: any) => x.id === cmId);
    const m = mods.find((x) => x.id === c?.vdi_module_id);
    setCredf((p) => ({ ...p, cmId, url: p.url || (m as any)?.external_url || "", label: p.label || c?.label || m?.name || "" }));
  }
  async function saveCred() {
    if (!credf.cmId || (!credf.login.trim() && !credf.url.trim() && !credf.sso)) { flash(tr("Escolha a instância e informe a URL ou o login.")); return; }
    setBusy(true);
    try {
      const c = cm.find((x: any) => x.id === credf.cmId);
      const m = mods.find((x) => x.id === c?.vdi_module_id);
      await api.delivery.moduleCredentials.set({ clientModuleId: credf.cmId, label: credf.label || c?.label || m?.name || "Acesso", url: credf.url.trim(), login: credf.login.trim(), secret: credf.secret, sso: credf.sso });
      // O MODO mora na instância (client_modules), não na credencial: é característica de
      // como o módulo abre, não de quem entra. SSO marcado implica abrir embarcado.
      await api.delivery.clientModules.updateRollout(credf.cmId, { access_mode: credf.sso && credf.mode === "link" ? "embed" : credf.mode });
      setCredf({ cmId: "", label: "", url: "", login: "", secret: "", sso: false, mode: "link" }); reload(); flash(tr("Acesso salvo ✓"));
    } catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  function editCred(c: any) {
    const inst = cm.find((x: any) => x.id === c.client_module_id);
    setCredf({ cmId: c.client_module_id || "", label: c.label || "", url: c.access_url || "", login: c.login || "", secret: "", sso: !!c.sso_enabled, mode: (inst as any)?.access_mode || "link" });
    flash(tr("Editando — altere e clique em Salvar. Senha em branco mantém a atual."));
  }
  async function delCred(cid: string) { await api.delivery.moduleCredentials.remove(cid); reload(); }
  const refreshServices = async () => setSvcRows((await api.delivery.clientServices.listByOrg(id!)) as any[]);
  async function addService(serviceId: string) {
    if (!serviceId) { flash(tr("Escolha um serviço.")); return; }
    setBusy(true);
    try { const svc = svcCat.find((s: any) => s.id === serviceId) || { id: serviceId }; await api.delivery.clientServices.attach(id!, svc); setSvcQuery(""); await refreshServices(); flash(tr("Serviço adicionado ✓")); }
    catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  async function setServiceStatus(csId: string, status: string) {
    setSvcRows((rows) => rows.map((r) => (r.id === csId ? { ...r, status } : r))); // otimista
    try { await api.delivery.clientServices.setStatus(csId, status); } catch { await refreshServices(); }
  }
  async function delService(csId: string) {
    setSvcRows((rows) => rows.filter((r) => r.id !== csId)); // otimista
    try { await api.delivery.clientServices.detach(csId); } catch { await refreshServices(); }
  }
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
    if (!confirm(tr("Enviar para {e} um link para definir a senha de acesso? A senha atual continua valendo até ela usar o link.", { e: u.email }))) return;
    setBusy(true);
    const r = await api.identity.users.resendAccess({ user_id: u.id, email: u.email, full_name: u.full_name || "" });
    setBusy(false);
    if (!r.ok) { flash(tr("Falha ao reenviar:") + " " + (r.error || "erro")); return; }
    flash(r.email_sent ? tr("✉️ Link de acesso enviado para {e}.", { e: u.email }) : tr("Não foi possível enviar o e-mail: {err}", { err: r.email_error || "" }));
  }

  return (
    <div>
      <PageHead eyebrow={`CRM · ${co.flag} ${co.name}`} title={org.name} sub={`${co.idLabel}: ${org.tax_id || "—"}  ·  ${org.website || "sem site"}`}
        right={<>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { preview.set(id!, org.name); nav("/app"); }}><span className="crasto-btn__icon"><Eye size={14} /></span><span className="crasto-btn__label">{tr("Visualizar cliente")}</span></button>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { setEf(org); setEdit(true); }}><span className="crasto-btn__icon"><Pencil size={14} /></span><span className="crasto-btn__label">{tr("Editar")}</span></button>
          <button className="crasto-btn crasto-btn--destructive crasto-btn--sm" onClick={del} disabled={busy}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">{tr("Excluir")}</span></button>
        </>} />

      {/* pipeline */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STAGES.map((s) => <button key={s.key} className={"stagetab" + (org.stage === s.key ? " on" : "")} onClick={() => setStage(s.key)}>{tr(s.label)}</button>)}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--crasto-text-muted)" }}>{tr("Status atual:")} <b style={{ color: "var(--crasto-text-primary)" }}>{tr(st.label)}</b></span>
      </div>

      {/* Diagnóstico do site (Mapa de IA) — card + popup; some se o cliente não veio do /mapa */}
      <DiagnosticoCard orgId={id!} />

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

      {/* Grupo & registros legais (internacional — Grupo × N registros × país) */}
      <div className="sec-h" style={{ marginTop: 20 }}><h2>{tr("Grupo & registros legais")}</h2><Pill tone="mute">{tr("Grupo × N registros · internacional")}</Pill>
        <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" style={{ marginLeft: "auto" }} onClick={newReg}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Adicionar registro")}</span></button></div>
      {(cnpjs ?? []).length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhum registro legal cadastrado.")}</div> : cnpjs.map((c: any) => (
        <div className="crmrow" key={c.id}>
          <Pill tone={c.is_headquarters ? "ok" : "info"}>{c.is_headquarters ? tr("Matriz") : tr("Filial")}</Pill>
          <div style={{ flex: 1, minWidth: 0 }}><div className="nm tnum">{regInfo(c.reg_type).label} {c.cnpj || "—"} {!c.is_active && <span className="chip" style={{ marginLeft: 6 }}>{tr("Inativo")}</span>}</div><div className="mt">{[regCountryName(c.country), c.trade_name || c.legal_name].filter(Boolean).join(" · ") || tr("sem nome")}</div></div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icobtn" title={tr("Editar")} onClick={() => editReg(c)}><Pencil size={13} /></button>
            <button className="icobtn rm" title={tr("Excluir")} onClick={() => delReg(c)}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
      <Modal title={regF.id ? tr("Editar registro legal") : tr("Novo registro legal")} open={regOpen} onClose={() => setRegOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setRegOpen(false)}><span className="crasto-btn__label">{tr("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={saveReg}><span className="crasto-btn__label">{tr("Salvar")}</span></button></>}>
        <div className="grid2">
          <Field label="País"><select value={regF.country} onChange={(e) => setRegF({ ...regF, country: e.target.value, reg_type: regTypeFor(e.target.value) })}>{REG_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
          <Field label={regInfo(regF.reg_type).label}><input value={regF.cnpj} onChange={(e) => setRegF({ ...regF, cnpj: e.target.value })} onBlur={(e) => setRegF({ ...regF, cnpj: regInfo(regF.reg_type).format(e.target.value) })} placeholder={regInfo(regF.reg_type).placeholder} /></Field>
        </div>
        <div className="grid2">
          <Field label="Razão social"><input value={regF.legal_name} onChange={(e) => setRegF({ ...regF, legal_name: e.target.value })} /></Field>
          <Field label="Nome fantasia"><input value={regF.trade_name} onChange={(e) => setRegF({ ...regF, trade_name: e.target.value })} /></Field>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (regF.is_headquarters ? " on" : "")} onClick={() => setRegF({ ...regF, is_headquarters: !regF.is_headquarters })} /><span style={{ fontSize: 13, fontWeight: 600 }}>{regF.is_headquarters ? tr("Matriz") : tr("Filial")}</span></label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (regF.is_active ? " on" : "")} onClick={() => setRegF({ ...regF, is_active: !regF.is_active })} /><span style={{ fontSize: 13, fontWeight: 600 }}>{regF.is_active ? tr("Ativo") : tr("Inativo")}</span></label>
        </div>
      </Modal>

      {/* Sócios cadastrados pelo cliente */}
      {(partners ?? []).length > 0 && (<>
        <div className="sec-h" style={{ marginTop: 20 }}><h2>{tr("Sócios")}</h2><Pill tone="mute">{tr("cadastrados pelo cliente no portal")}</Pill></div>
        {partners.map((p: any) => (
          <div className="crmrow" key={p.id}>
            <Pill tone={p.is_ceo ? "ok" : "info"}>{p.is_ceo ? tr("Administrador") : tr("Sócio")}</Pill>
            <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{p.full_name || "—"} {!p.is_active && <span className="chip" style={{ marginLeft: 6 }}>{tr("Inativo")}</span>}</div><div className="mt">{[p.role_title, p.cpf, p.ownership_percentage != null ? `${p.ownership_percentage}%` : null].filter(Boolean).join(" · ")}</div></div>
            <button className="icobtn" title={tr("Excluir sócio")} onClick={() => delPartner(p)}><Trash2 size={14} /></button>
          </div>
        ))}
      </>)}

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
        <div className="kpi g"><div className="lab">{tr("Implantação")}</div><div className="val tnum">{rollAvg}<small>%</small></div><div className="delta">{health === "green" ? tr("no ar") : "—"}</div></div>
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
      {people.map((p) => (epId === p.id ? (
        <div className="addrow" key={p.id}>
          <input placeholder={tr("Nome completo")} value={ep.full_name} onChange={(e) => setEp({ ...ep, full_name: e.target.value })} style={{ flex: 2, minWidth: 140 }} />
          <input placeholder={tr("Cargo (dono, diretor…)")} value={ep.role} onChange={(e) => setEp({ ...ep, role: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
          <input placeholder={tr("E-mail")} value={ep.email} onChange={(e) => setEp({ ...ep, email: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
          <input type="date" value={ep.birthday} onChange={(e) => setEp({ ...ep, birthday: e.target.value })} />
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={savePerson}><span className="crasto-btn__label">{tr("Salvar")}</span></button>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setEpId("")}><span className="crasto-btn__label">{tr("Cancelar")}</span></button>
        </div>
      ) : (
        <div className="crmrow" key={p.id}>
          <div className="logo" style={{ width: 34, height: 34, borderRadius: 9, background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{initials(p.full_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{p.full_name} {p.role && <span className="chip" style={{ marginLeft: 6 }}>{p.role}</span>}</div><div className="mt">{p.email || tr("sem e-mail")}{p.birthday ? ` · 🎂 ${fmtDate(p.birthday)}` : ""}</div></div>
          <button className="icobtn" title={tr("Editar")} onClick={() => startEditPerson(p)}><Pencil size={14} /></button>
          <button className="icobtn rm" onClick={() => delRow("crm", "people", p.id)}><Trash2 size={14} /></button>
        </div>
      )))}

      {/* Telefones */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Telefones")}</h2></div>
      <div className="addrow">
        <select value={phone.label} onChange={(e) => setPhone({ ...phone, label: e.target.value })}><option value="mobile">{tr("Celular")}</option><option value="fixo">{tr("Fixo")}</option><option value="whatsapp">WhatsApp</option></select>
        <select value={phone.country_code} onChange={(e) => setPhone({ ...phone, country_code: e.target.value })}>{DIAL_CODES.map((d, i) => <option key={i} value={d.ddi}>{d.flag} {d.ddi}</option>)}</select>
        <input placeholder={tr("Número")} value={phone.number} onChange={(e) => setPhone({ ...phone, number: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
        <select value={phone.person_id} onChange={(e) => setPhone({ ...phone, person_id: e.target.value })}><option value="">{tr("(empresa)")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addPhone}><span className="crasto-btn__label">{tr("Adicionar")}</span></button>
      </div>
      {phones.map((ph) => (ephId === ph.id ? (
        <div className="addrow" key={ph.id}>
          <select value={eph.label} onChange={(e) => setEph({ ...eph, label: e.target.value })}><option value="mobile">{tr("Celular")}</option><option value="fixo">{tr("Fixo")}</option><option value="whatsapp">WhatsApp</option></select>
          <select value={eph.country_code} onChange={(e) => setEph({ ...eph, country_code: e.target.value })}>{DIAL_CODES.map((d, i) => <option key={i} value={d.ddi}>{d.flag} {d.ddi}</option>)}</select>
          <input placeholder={tr("Número")} value={eph.number} onChange={(e) => setEph({ ...eph, number: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
          <select value={eph.person_id} onChange={(e) => setEph({ ...eph, person_id: e.target.value })}><option value="">{tr("(empresa)")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={savePhone}><span className="crasto-btn__label">{tr("Salvar")}</span></button>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setEphId("")}><span className="crasto-btn__label">{tr("Cancelar")}</span></button>
        </div>
      ) : (
        <div className="crmrow" key={ph.id}>
          <Pill tone="info">{ph.label}</Pill>
          <div className="nm tnum" style={{ flex: 1, minWidth: 0 }}>{ph.country_code} {ph.number}{ph.person_id ? <span className="mt" style={{ fontWeight: 400 }}> · {people.find((p) => p.id === ph.person_id)?.full_name}</span> : ""}</div>
          <button className="icobtn" title={tr("Editar")} onClick={() => startEditPhone(ph)}><Pencil size={14} /></button>
          <button className="icobtn rm" onClick={() => delRow("crm", "phones", ph.id)}><Trash2 size={14} /></button>
        </div>
      )))}

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
            {filtered.length === 0 ? <Empty>{modCat === "__on" && !q ? tr("Nenhum módulo contratado ainda — abra \"Todas\" e ative os módulos deste cliente.") : tr("Nenhum módulo encontrado.")}</Empty> : grouped ? order.map((d) => (
              <div key={d} style={{ marginBottom: 8 }}>
                <div className="sec-h" style={{ marginTop: 18 }}><h2>{d}</h2><Pill tone="mute">{tr("{n} módulos", { n: groups[d].length })}</Pill></div>
                <div className="assign">{groups[d].map(card)}</div>
              </div>
            )) : <div className="assign">{filtered.map(card)}</div>}
          </>
        );
      })()}

      {/* Serviços contratados */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Serviços contratados")}</h2><Pill tone="mute">{tr("o cliente vê em 'Meus serviços' (sem link)")}</Pill></div>
      {(() => {
        const q = svcQuery.trim().toLowerCase();
        const available = svcCat.filter((s: any) => !svcRows.some((c: any) => c.service_id === s.id));
        const matches = q ? available.filter((s: any) => `${s.name} ${s.category || ""}`.toLowerCase().includes(q)) : available;
        return (
          <div className="svcpick">
            <div className="catsearch" style={{ margin: 0 }}>
              <Search size={16} />
              <input value={svcQuery} onChange={(e) => setSvcQuery(e.target.value)} placeholder={tr("Buscar serviço para adicionar…")} />
              <span className="mt" style={{ whiteSpace: "nowrap" }}>{tr("{n} disponíveis", { n: available.length })}</span>
            </div>
            <div className="svcpick-list">
              {matches.length === 0 ? <div className="svcpick-empty">{tr("Nenhum serviço encontrado.")}</div> : matches.map((s: any) => (
                <button key={s.id} className="svcpick-item" disabled={busy} onClick={() => addService(s.id)}>
                  <span className="svcpick-plus"><Plus size={14} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><span className="nm">{s.name}</span>{s.category ? <span className="cat"> · {s.category}</span> : null}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      {svcRows.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhum serviço contratado — adicione acima.")}</div> : svcRows.map((c: any) => {
        const nm = c.service_name || svcCat.find((x: any) => x.id === c.service_id)?.name || tr("Serviço");
        const stl = c.status === "delivered" ? tr("Concluído") : c.status === "in_progress" ? tr("Em execução") : c.status === "scheduled" ? tr("Agendado") : tr("Ativo");
        const stt = c.status === "delivered" ? "ok" : c.status === "scheduled" ? "warn" : c.status === "in_progress" ? "info" : "ok";
        return (
          <div className="crmrow" key={c.id}>
            <Pill tone={stt as any}>{stl}</Pill>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">{nm}</div>
              <div className="mt">{[c.service_category, c.service_unit].filter(Boolean).join(" · ")}</div>
            </div>
            <select value={c.status} onChange={(e) => setServiceStatus(c.id, e.target.value)} className="selorg" style={{ width: 150 }}>
              <option value="active">{tr("Ativo")}</option>
              <option value="in_progress">{tr("Em execução")}</option>
              <option value="delivered">{tr("Concluído")}</option>
              <option value="scheduled">{tr("Agendado")}</option>
            </select>
            <button className="icobtn rm" onClick={() => delService(c.id)}><Trash2 size={14} /></button>
          </div>
        );
      })}

      {/* Implantação & Saúde (F-D) */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Implantação & saúde")}</h2><Pill tone="mute">{tr("o cliente vê no Gantt e no farol")}</Pill></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>{tr("Farol de saúde")}</h3>
        <div className="grid2">
          <label className="frow" style={{ marginTop: 8 }}><span>{tr("Status")}</span><select value={healthForm.status} onChange={(e) => setHealthForm({ ...healthForm, status: e.target.value })}><option value="green">🟢 {tr("No ar")}</option><option value="amber">🟡 {tr("Atenção")}</option><option value="red">🔴 {tr("Crítico")}</option></select></label>
          <label className="frow" style={{ marginTop: 8 }}><span>{tr("Mensagem ao cliente")}</span><input value={healthForm.message} onChange={(e) => setHealthForm({ ...healthForm, message: e.target.value })} placeholder={tr("Ex.: Tudo funcionando normalmente.")} /></label>
        </div>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginTop: 8 }} disabled={busy} onClick={saveHealth}><span className="crasto-btn__label">{tr("Salvar")}</span></button>
      </div>

      <div className="sec-h"><h2>{tr("Instâncias & andamento")}</h2><Pill tone="mute">{tr("apelido, acesso e progresso por instância — o cliente vê o apelido")}</Pill></div>
      {cm.length === 0 ? <Empty>{tr("Nenhum módulo contratado — libere módulos acima para acompanhar a implantação.")}</Empty> : cm.map((c: any) => {
        const name = mods.find((m) => m.id === c.vdi_module_id)?.name || tr("Módulo");
        const rf = rolloutForm[c.id] || { label: "", progress: "0", due: "", status: "in_progress" };
        return (
          <div className="rollrow" key={c.id}>
            <label className="rollf" style={{ flex: "1 1 200px" }}><span>{name}</span><input placeholder={tr("Apelido p/ o cliente (ex.: Nina Comercial)")} value={rf.label} onChange={(e) => setRf(c.id, { label: e.target.value })} /></label>
            <label className="rollf"><span>{tr("Progresso (%)")}</span><input type="number" min={0} max={100} value={rf.progress} onChange={(e) => setRf(c.id, { progress: e.target.value })} /></label>
            <label className="rollf"><span>{tr("Prazo de entrega")}</span><input type="date" value={rf.due} onChange={(e) => setRf(c.id, { due: e.target.value })} /></label>
            <label className="rollf"><span>{tr("Status")}</span><select value={rf.status} onChange={(e) => setRf(c.id, { status: e.target.value })}><option value="in_progress">{tr("Em andamento")}</option><option value="delivered">{tr("Entregue")}</option><option value="on_hold">{tr("Em espera")}</option></select></label>
            <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={() => saveRollout(c.id)}><span className="crasto-btn__label">{tr("Salvar")}</span></button>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} title={tr("Criar outra instância deste mesmo módulo")} onClick={() => dupInstance(c)}><span className="crasto-btn__label">{tr("+ Duplicar")}</span></button>
            <button className="icobtn rm" title={tr("Excluir instância")} onClick={() => delInstance(c.id)}><Trash2 size={14} /></button>
          </div>
        );
      })}

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
      <UsoModulos orgId={id} titulo={tr("Uso dos módulos por usuário")} />

      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Acesso por instância (URL + login do cliente)")}</h2><Pill tone="mute">{tr("o cliente vê em 'Minhas Soluções'")}</Pill></div>
      <div className="addrow" style={{ flexWrap: "wrap" }}>
        <select value={credf.cmId} onChange={(e) => pickCredInstance(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">{tr("Instância…")}</option>
          {cm.map((c: any) => { const mn = mods.find((m) => m.id === c.vdi_module_id)?.name || tr("Módulo"); return <option key={c.id} value={c.id}>{c.label ? `${c.label} — ${mn}` : mn}</option>; })}
        </select>
        <input placeholder={tr("URL de acesso do cliente (https://…)")} value={credf.url} onChange={(e) => setCredf({ ...credf, url: e.target.value })} style={{ flex: 2, minWidth: 200 }} />
        <input placeholder={tr("Login")} value={credf.login} onChange={(e) => setCredf({ ...credf, login: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <input placeholder={tr("Senha")} value={credf.secret} onChange={(e) => setCredf({ ...credf, secret: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        {/* COMO ABRE: "nova aba" é o de sempre; "dentro do Portal" mantém o cliente na casca
            (com "Voltar ao Portal") e é o que gera a métrica de uso por usuário. */}
        <select value={credf.mode} onChange={(e) => setCredf({ ...credf, mode: e.target.value })} style={{ minWidth: 150 }} title={tr("Como o cliente abre este módulo")}>
          <option value="link">{tr("Abre em nova aba")}</option>
          <option value="embed">{tr("Abre dentro do Portal")}</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--crasto-text-body)" }}><input type="checkbox" checked={credf.sso} onChange={(e) => setCredf({ ...credf, sso: e.target.checked })} style={{ width: "auto" }} />{tr("Entra direto (SSO)")}</label>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveCred}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{tr("Salvar")}</span></button>
      </div>
      {(creds ?? []).length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhum acesso cadastrado — o cliente veria vazio.")}</div> : (creds ?? []).map((c) => {
        const inst = cm.find((x: any) => x.id === (c as any).client_module_id);
        const mn = mods.find((m) => m.id === c.vdi_module_id)?.name;
        const nm = inst?.label || c.label || mn;
        return (
        <div className="crmrow" key={c.id}>
          <Pill tone={c.sso_enabled ? "ok" : c.login ? "info" : "mute"}>{c.sso_enabled ? "SSO" : c.login ? tr("Login/senha") : tr("Só link")}</Pill>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{nm}{inst?.label && mn ? <span className="mt" style={{ fontWeight: 400 }}> · {mn}</span> : null}</div>
            <div className="mt" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.access_url ? c.access_url : tr("Sem URL")}{" · "}{c.sso_enabled ? tr("Entra direto") : (c.login || tr("sem login"))}</div>
          </div>
          <button className="icobtn" title={tr("Editar")} onClick={() => editCred(c)}><Pencil size={14} /></button>
          <button className="icobtn rm" onClick={() => delCred(c.id)}><Trash2 size={14} /></button>
        </div>
        );
      })}

      {/* Usuários */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Usuários (acesso ao portal)")}</h2><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setInvite(true)}><span className="crasto-btn__icon"><UserPlus size={14} /></span><span className="crasto-btn__label">{tr("Convidar")}</span></button></div>
      <div className="tbl-wrap">
        <table className="tbl"><thead><tr><th>{tr("Usuário")}</th><th>{tr("Papel")}</th><th>{tr("E-mail")}</th><th>{tr("Acesso")}</th></tr></thead><tbody>
          {users.length === 0 ? <tr><td colSpan={4} style={{ color: "var(--crasto-text-muted)" }}>{tr("Sem logins — convide o responsável.")}</td></tr> : users.map((u) => (
            <tr key={u.id}><td><div className="cust"><Avatar name={u.full_name || u.email} url={u.avatar_url} /><div className="nm">{u.full_name || "—"}</div></div></td><td><Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{u.role === "client_owner" ? tr("Dono") : tr("Membro")}</Pill></td><td className="cust"><span className="em">{u.email}</span></td><td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><button className="icobtn" title={tr("Editar nome, e-mail e papel")} onClick={() => startEditUser(u)}><Pencil size={14} /></button><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => resendAccess(u)} title={tr("Envia um link para a pessoa definir a senha (não redefine a atual)")}><span className="crasto-btn__label">{tr("Reenviar acesso")}</span></button></div></td></tr>
          ))}
        </tbody></table>
      </div>

      {/* Acesso ao WhatsApp CRM — só aparece se o módulo estiver ativo (a API decide) */}
      {id && <CrmAccessSection orgId={id} onToast={setToast} />}

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
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setInvite(false)}><span className="crasto-btn__label">{tr("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={doInvite}><span className="crasto-btn__label">{busy ? tr("Enviando…") : tr("Enviar convite")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="E-mail *"><input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
        <Field label="Nome"><input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></Field>
        <Field label="Papel"><select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="client_owner">{tr("Dono")}</option><option value="client_member">{tr("Membro")}</option></select></Field>
      </Modal>

      {/* Editar usuário do Portal — nome, e-mail (muda o login) e papel */}
      <Modal title={tr("Editar usuário")} open={euOpen} onClose={() => setEuOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setEuOpen(false)}><span className="crasto-btn__label">{tr("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveUser}><span className="crasto-btn__label">{busy ? tr("Salvando…") : tr("Salvar")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <Field label="Nome"><input value={eu.name} onChange={(e) => setEu({ ...eu, name: e.target.value })} /></Field>
        <Field label="E-mail *"><input type="email" value={eu.email} onChange={(e) => setEu({ ...eu, email: e.target.value })} /></Field>
        <Field label="Papel"><select value={eu.role} onChange={(e) => setEu({ ...eu, role: e.target.value })}><option value="client_owner">{tr("Dono")}</option><option value="client_member">{tr("Membro")}</option></select></Field>
        <div className="mt" style={{ marginTop: 8, color: "var(--crasto-text-muted)", fontSize: 12 }}>{tr("Mudar o e-mail altera o login desta pessoa. A senha atual continua valendo.")}</div>
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
