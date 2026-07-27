import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Search, Send, Grid3x3, Pencil, Trash2, UserPlus, Plus, Upload, Download, FileText, Building2, Eye } from "lucide-react";
import { preview } from "../../lib/preview";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, initials, Field, money, prettyName } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import UsoModulos from "../../ui/UsoModulos";
import Modal from "../../ui/Modal";
import { COUNTRIES, countryOf, STAGES, stageOf, DIAL_CODES } from "../../lib/countries";
import { reg as regInfo, regTypeFor, COUNTRIES as REG_COUNTRIES, countryName as regCountryName } from "../../lib/registrations";
import { CrmAccessSection } from "./CrmAccessSection";
import SocialIntegracoes from "./SocialIntegracoes";
import DiagnosticoCard from "./DiagnosticoCard";
import EmpresaExtra from "./EmpresaExtra";
import PessoasEditor from "./PessoasEditor";
import OrgInline from "./OrgInline";

type Org = any;
const icon = (cat?: string | null) => { const c = (cat || "").toLowerCase(); return c.includes("atend") ? <MessageCircle size={16} /> : c.includes("market") ? <Send size={16} /> : c.includes("vend") ? <Search size={16} /> : <Grid3x3 size={16} />; };
const DOC_KINDS = [{ v: "contrato_servico", l: "Contrato de prestação de serviço" }, { v: "cnpj_card", l: "Cartão CNPJ" }, { v: "contrato_social", l: "Contrato Social" }, { v: "plano_diretor", l: "Plano Diretor" }, { v: "socios", l: "Sócios" }, { v: "outro", l: "Outro" }];
const fmtDate = (s?: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");

export default function ClienteDetalhe({ onStageChange }: { onStageChange?: (s: string) => void } = {}) {
  const { id } = useParams();
  const nav = useNavigate();
  const tr = useT();
  const { data, loading, reload } = useAsync(async () => {
    if (!id) return null;
    const [org, mods, cm, users, people, phones, docs, acts, impl, health, taxids, proposals, tasks, creds, csvc, svcCat, cnpjs, partners, meetings, implEvents] = await Promise.all([
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
      api.delivery.meetings.listByOrg(id).catch(() => []),
      api.delivery.implEvents.listByOrg(id).catch(() => []),
    ]);
    return { org: org as Org, mods: (mods as any[]) ?? [], cm: (cm as any[]) ?? [], users: (users as any[]) ?? [], people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], docs: (docs as any[]) ?? [], acts: (acts as any[]) ?? [], progress: (impl as any)?.overall_progress ?? 0, health: (health as any)?.status ?? null, impl: (impl as any) ?? null, healthObj: (health as any) ?? null, taxids: (taxids as any[]) ?? [], proposals: (proposals as any[]) ?? [], tasks: (tasks as any[]) ?? [], creds: (creds as any[]) ?? [], csvc: (csvc as any[]) ?? [], svcCat: (svcCat as any[]) ?? [], cnpjs: (cnpjs as any[]) ?? [], partners: (partners as any[]) ?? [], meetings: (meetings as any[]) ?? [], implEvents: (implEvents as any[]) ?? [] };
  }, [id]);

  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState<Org>(null);
  // Edição de usuário do Portal (nome/e-mail/papel).
  const [person, setPerson] = useState({ full_name: "", role: "", funcao: "", email: "", birthday: "", is_primary: false, disc_tipo: "", disc_data: "", notes: "" });
  const [phone, setPhone] = useState({ label: "mobile", country_code: "+55", number: "", person_id: "" });
  const [epId, setEpId] = useState("");
  const [ep, setEp] = useState({ full_name: "", role: "", funcao: "", email: "", birthday: "", is_primary: false, disc_tipo: "", disc_data: "", notes: "" });
  const [ephId, setEphId] = useState("");
  const [eph, setEph] = useState({ label: "mobile", country_code: "+55", number: "", person_id: "" });
  const [act, setAct] = useState({ type: "note", title: "", description: "" });
  const [meetf, setMeetf] = useState({ meeting_at: "", title: "", attendees: "", summary: "", transcript: "" });
  const [ievf, setIevf] = useState({ happened_at: "", title: "", client_module_id: "", performed_by_name: "", detail: "" });
  const [taxid, setTaxid] = useState({ kind: "CNPJ", value: "", address: "" });
  const [regOpen, setRegOpen] = useState(false);
  const [regF, setRegF] = useState<any>({ id: "", organization_id: id, country: "BR", reg_type: "cnpj", cnpj: "", legal_name: "", trade_name: "", is_headquarters: false, is_active: true });
  function newReg() { setRegF({ id: "", organization_id: id, country: "BR", reg_type: "cnpj", cnpj: "", legal_name: "", trade_name: "", is_headquarters: false, is_active: true, zip_code: "", inscricao_estadual: "", logradouro: "", numero: "", bairro: "", city: "", state: "" }); setRegOpen(true); }
  function editReg(c: any) { setRegF({ id: c.id, organization_id: id, country: c.country || "BR", reg_type: c.reg_type || "cnpj", cnpj: c.cnpj || "", legal_name: c.legal_name || "", trade_name: c.trade_name || "", is_headquarters: !!c.is_headquarters, is_active: c.is_active !== false, zip_code: c.zip_code || "", inscricao_estadual: c.inscricao_estadual || "", logradouro: c.logradouro || "", numero: c.numero || "", bairro: c.bairro || "", city: c.city || "", state: c.state || "" }); setRegOpen(true); }
  // CEP → autopreenche logradouro/bairro/cidade/UF via ViaCEP (BR). Offline: preenche na mão.
  async function cepLookup(cep: string) {
    const d = (cep || "").replace(/\D/g, "");
    if (d.length !== 8 || regF.country !== "BR") return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j && !j.erro) setRegF((f: any) => ({ ...f, logradouro: f.logradouro || j.logradouro || "", bairro: f.bairro || j.bairro || "", city: j.localidade || f.city, state: j.uf || f.state }));
    } catch { /* sem internet: preenche manual */ }
  }
  async function saveReg() { if (regF.cnpj && !regInfo(regF.reg_type).validate(regF.cnpj)) { alert(tr("Número do registro inválido para o país selecionado.")); return; } try { await api.identity.cnpjs.adminSave(regF); setRegOpen(false); reload(); } catch (e) { alert(errorMessage(e)); } }
  async function delReg(c: any) { if (!confirm(tr("Excluir este registro?"))) return; await api.identity.cnpjs.adminRemove(c.id); reload(); }
  async function delPartner(p: any) { if (!confirm(tr("Excluir o sócio \"{n}\"?", { n: p.full_name || "sócio" }))) return; try { await api.identity.partners.remove(p.id); reload(); } catch (e) { alert(errorMessage(e)); } }
  // F-D: implantação, saúde, tarefas, credenciais
  const [rolloutForm, setRolloutForm] = useState<Record<string, { label: string; blurb: string; progress: string; due: string; status: string; monthly: string; setup: string; contract: string; cost_allocation: string }>>({});
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
    const rf: Record<string, { label: string; blurb: string; progress: string; due: string; status: string; monthly: string; setup: string; contract: string; cost_allocation: string }> = {};
    cms.forEach((c) => { rf[c.id] = { label: c.label ?? "", blurb: c.blurb ?? "", progress: String(c.rollout_progress ?? 0), due: c.rollout_due ?? "", status: c.rollout_status ?? "in_progress", monthly: c.monthly_cost != null ? String(c.monthly_cost) : "", setup: c.setup_cost != null ? String(c.setup_cost) : "", contract: c.contract_date ?? "", cost_allocation: c.cost_allocation ?? "" }; });
    setRolloutForm(rf);
    setSvcRows(((data as any)?.csvc ?? []) as any[]);
  }, [data]);
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 7000); };

  if (loading) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Carregando…</Empty></>;
  if (!data?.org) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Não encontrado.</Empty></>;
  const { org, mods, cm, users, people, phones, docs, acts, progress, health, taxids, proposals, tasks, creds, svcCat, cnpjs, partners, meetings, implEvents } = data;
  const activeSet = new Set(cm.map((c) => c.vdi_module_id));
  const rollAvg = cm.length ? Math.round(cm.reduce((s: number, c: any) => s + (c.rollout_progress || 0), 0) / cm.length) : (progress || 0);
  const co = countryOf(org.country); const st = stageOf(org.stage);
  // REGRA DE ESTÁGIO (decisão Crasto 2026-07-27): prospecto/lead manuais; OPORTUNIDADE só com
  // proposta gerada; CLIENTE só com proposta ganha (assinada+paga). O estágio atual sempre pode voltar.
  const hasProposal = (proposals ?? []).length > 0;
  const hasWon = (proposals ?? []).some((p: any) => p.status === "accepted");
  const curIdx = STAGES.findIndex((x) => x.key === org.stage);
  function stageLock(key: string): string | null {
    if (key === org.stage || key === "prospecto" || key === "lead") return null;
    if (key === "oportunidade" && !hasProposal) return tr("Vira oportunidade quando há uma proposta gerada (você gera no Gerador de propostas).");
    if (key === "cliente" && !hasWon) return tr("Vira cliente quando a proposta é ganha — assinada e paga.");
    return null;
  }

  async function saveEdit() {
    setBusy(true);
    const cc = countryOf(ef.country);
    try {
      await api.identity.organizations.update(id!, { name: ef.name, stage: ef.stage, country: ef.country, tax_id: ef.tax_id, tax_id_type: cc.idType, founded_on: ef.founded_on || null, website: ef.website, owner_name: ef.owner_name, plan: ef.plan, notes: ef.notes, status: ef.status });
      setEdit(false); reload(); flash(tr("Dados atualizados ✓"));
    } catch (e) { flash(tr("Erro ao salvar:") + " " + errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function setStage(stage: string) {
    try {
      await api.identity.organizations.setStage(id!, stage);
      flash(tr("Movido para {s}", { s: tr(stageOf(stage).label) }));
      onStageChange?.(stage);            // wrapper troca Lead↔Cliente na hora
      if (stage === "cliente") reload();
    } catch (e) { flash(tr("Erro ao mover o estágio:") + " " + errorMessage(e)); }
  }
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
  async function addPerson() { if (!person.full_name.trim()) return; await api.crm.people.add({ organization_id: id, full_name: person.full_name.trim(), role: person.role || null, funcao: person.funcao || null, email: person.email || null, birthday: person.birthday || null, is_primary: person.is_primary, disc_tipo: person.disc_tipo || null, disc_data: person.disc_data || null, notes: person.notes || null }); setPerson({ full_name: "", role: "", funcao: "", email: "", birthday: "", is_primary: false, disc_tipo: "", disc_data: "", notes: "" }); reload(); }
  async function addPhone() { if (!phone.number.trim()) return; await api.crm.phones.add({ organization_id: id, label: phone.label, country_code: phone.country_code, number: phone.number.trim(), person_id: phone.person_id || null }); setPhone({ label: "mobile", country_code: "+55", number: "", person_id: "" }); reload(); }
  function startEditPerson(p: any) { setEpId(p.id); setEp({ full_name: p.full_name || "", role: p.role || "", funcao: p.funcao || "", email: p.email || "", birthday: p.birthday || "", is_primary: !!p.is_primary, disc_tipo: p.disc_tipo || "", disc_data: p.disc_data || "", notes: p.notes || "" }); }
  async function savePerson() { if (!ep.full_name.trim()) return; await api.crm.people.update(epId, { full_name: ep.full_name.trim(), role: ep.role || null, funcao: ep.funcao || null, email: ep.email || null, birthday: ep.birthday || null, is_primary: ep.is_primary, disc_tipo: ep.disc_tipo || null, disc_data: ep.disc_data || null, notes: ep.notes || null }); setEpId(""); reload(); }
  function startEditPhone(ph: any) { setEphId(ph.id); setEph({ label: ph.label || "mobile", country_code: ph.country_code || "+55", number: ph.number || "", person_id: ph.person_id || "" }); }
  async function savePhone() { if (!eph.number.trim()) return; await api.crm.phones.update(ephId, { label: eph.label, country_code: eph.country_code, number: eph.number.trim(), person_id: eph.person_id || null }); setEphId(""); reload(); }
  async function addActivity() { if (!act.title.trim()) return; await api.crm.activities.add({ organization_id: id, type: act.type, title: act.title.trim(), description: act.description || null }); setAct({ type: "note", title: "", description: "" }); reload(); }
  async function addMeeting() {
    if (!meetf.title.trim() || !meetf.meeting_at) { flash(tr("Informe ao menos a data/hora e o título da reunião.")); return; }
    setBusy(true);
    try {
      const r = await api.delivery.meetings.create({ organization_id: id!, meeting_at: new Date(meetf.meeting_at).toISOString(), title: meetf.title.trim(), attendees: meetf.attendees.trim() || undefined, summary: meetf.summary.trim() || undefined, transcript: meetf.transcript.trim() || undefined });
      if ((r as any)?.error) { flash(tr("Erro:") + " " + (r as any).error); return; }
      setMeetf({ meeting_at: "", title: "", attendees: "", summary: "", transcript: "" }); reload(); flash(tr("Reunião registrada ✓"));
    } catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  async function delMeeting(mid: string) { if (!confirm(tr("Excluir esta reunião da base de conhecimento?"))) return; await api.delivery.meetings.remove(mid); reload(); }
  async function addImplEvent() {
    if (!ievf.title.trim() || !ievf.happened_at) { flash(tr("Informe ao menos a data/hora e o que foi implantado.")); return; }
    setBusy(true);
    try {
      const r = await api.delivery.implEvents.create({ organization_id: id!, client_module_id: ievf.client_module_id || undefined, happened_at: new Date(ievf.happened_at).toISOString(), title: ievf.title.trim(), performed_by_name: ievf.performed_by_name.trim() || undefined, detail: ievf.detail.trim() || undefined });
      if ((r as any)?.error) { flash(tr("Erro:") + " " + (r as any).error); return; }
      setIevf({ happened_at: "", title: "", client_module_id: "", performed_by_name: "", detail: "" }); reload(); flash(tr("Marco de implantação registrado ✓"));
    } catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  async function delImplEvent(eid: string) { if (!confirm(tr("Excluir este marco de implantação?"))) return; await api.delivery.implEvents.remove(eid); reload(); }
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
    try {
      const num = (v: string) => { const n = Number(String(v).replace(",", ".")); return v.trim() === "" || Number.isNaN(n) ? null : n; };
      await api.delivery.clientModules.updateRollout(cmId, { label: rf.label.trim() || null, blurb: rf.blurb.trim() || null, rollout_progress: Math.max(0, Math.min(100, Number(rf.progress) || 0)), rollout_due: rf.due || null, rollout_status: rf.status, monthly_cost: num(rf.monthly), setup_cost: num(rf.setup), contract_date: rf.contract || null, cost_allocation: rf.cost_allocation || null });
      reload(); flash(tr("Instância salva ✓"));
    }
    catch (e) { flash(tr("Erro:") + " " + errorMessage(e)); } finally { setBusy(false); }
  }
  const setRf = (cmId: string, patch: Partial<{ label: string; blurb: string; progress: string; due: string; status: string; monthly: string; setup: string; contract: string; cost_allocation: string }>) =>
    setRolloutForm((s) => ({ ...s, [cmId]: { label: "", blurb: "", progress: "0", due: "", status: "in_progress", monthly: "", setup: "", contract: "", cost_allocation: "", ...s[cmId], ...patch } }));
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

  return (
    <div>
      <PageHead eyebrow={`CRM · ${co.flag} ${co.name}`} title={org.name} sub={`${co.idLabel}: ${org.tax_id || "—"}  ·  ${org.website || "sem site"}`}
        right={<>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { preview.set(id!, org.name); nav("/app"); }}><span className="crasto-btn__icon"><Eye size={14} /></span><span className="crasto-btn__label">{tr("Visualizar cliente")}</span></button>
          <button className="crasto-btn crasto-btn--destructive crasto-btn--sm" onClick={del} disabled={busy}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">{tr("Excluir")}</span></button>
        </>} />

      {/* pipeline */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STAGES.map((s, i) => {
          const isCur = i === curIdx, isPast = i < curIdx;
          const lock = isCur ? null : (isPast ? tr("Já demonstrou interesse — não retorna a esta etapa.") : stageLock(s.key));
          const cls = "stagetab" + (isCur ? " on stage-glow" : " stage-dim") + (lock ? " stage-locked" : "");
          return (
            <button key={s.key} className={cls} title={lock || undefined} disabled={!!lock || isCur}
              onClick={() => { if (!lock && !isCur) setStage(s.key); }}>{tr(s.label)}</button>
          );
        })}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--crasto-text-muted)" }}>{tr("Status atual:")} <b style={{ color: "var(--crasto-text-primary)" }}>{tr(st.label)}</b></span>
      </div>

      {/* Dados da empresa — edição INLINE (clique e edite; salva sozinho, sem botão) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><Building2 size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{tr("Dados da empresa")}</h3><span className="mt" style={{ fontSize: 11.5 }}>{tr("clique e edite — salva sozinho")}</span></div>
        <div className="infogrid">
          <div><div className="infolab">{tr("Nome / Razão")}</div><OrgInline orgId={id!} field="name" value={org.name} placeholder={tr("Nome da empresa")} flash={flash} reloadOnSave reload={reload} /></div>
          <div><div className="infolab">{tr("País")}</div><OrgInline orgId={id!} field="country" value={org.country} type="select" options={COUNTRIES.map((c) => ({ v: c.code, l: `${c.flag} ${c.name}` }))} flash={flash} reloadOnSave reload={reload} /></div>
          <div><div className="infolab">{co.idLabel}</div><OrgInline orgId={id!} field="tax_id" value={org.tax_id} placeholder="—" flash={flash} /></div>
          <div><div className="infolab">{tr("Fundação")}</div><OrgInline orgId={id!} field="founded_on" value={org.founded_on ? String(org.founded_on).slice(0, 10) : ""} type="date" flash={flash} /></div>
          <div><div className="infolab">{tr("Dono / Presidente")}</div><OrgInline orgId={id!} field="owner_name" value={org.owner_name} placeholder="—" flash={flash} /></div>
          <div><div className="infolab">{tr("Website")}</div><OrgInline orgId={id!} field="website" value={org.website} placeholder="https://…" flash={flash} /></div>
          <div><div className="infolab">{tr("Plano")}</div><OrgInline orgId={id!} field="plan" value={org.plan} placeholder="—" flash={flash} /></div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--crasto-border-soft)" }}>
          <div className="infolab">{tr("Observações")}</div>
          <OrgInline orgId={id!} field="notes" value={org.notes} placeholder={tr("nota interna sobre a empresa")} flash={flash} />
        </div>
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
        <div className="grid2">
          <Field label="CEP (autopreenche)"><input value={regF.zip_code || ""} onChange={(e) => setRegF({ ...regF, zip_code: e.target.value })} onBlur={(e) => cepLookup(e.target.value)} placeholder="00000-000" /></Field>
          <Field label="Inscrição estadual"><input value={regF.inscricao_estadual || ""} onChange={(e) => setRegF({ ...regF, inscricao_estadual: e.target.value })} placeholder={tr("(se houver)")} /></Field>
        </div>
        <div className="grid2">
          <Field label="Logradouro"><input value={regF.logradouro || ""} onChange={(e) => setRegF({ ...regF, logradouro: e.target.value })} placeholder={tr("Rua / Avenida")} /></Field>
          <Field label="Número"><input value={regF.numero || ""} onChange={(e) => setRegF({ ...regF, numero: e.target.value })} /></Field>
        </div>
        <div className="grid2">
          <Field label="Bairro"><input value={regF.bairro || ""} onChange={(e) => setRegF({ ...regF, bairro: e.target.value })} /></Field>
          <Field label="Cidade"><input value={regF.city || ""} onChange={(e) => setRegF({ ...regF, city: e.target.value })} /></Field>
        </div>
        <div className="grid2">
          <Field label="Estado / UF"><input value={regF.state || ""} onChange={(e) => setRegF({ ...regF, state: e.target.value })} /></Field>
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

      {/* Contatos — persona/CRM completo (componente compartilhado com a ficha de lead) */}
      <div className="sec-h"><h2>{tr("Contatos da empresa")}</h2><Pill tone="mute">{tr("persona · familiares · consultável")}</Pill></div>
      <PessoasEditor orgId={id!} />

      {/* Cadastro & relação (tipo/NF/oculto + papéis/indicador + origem interno) */}
      <EmpresaExtra orgId={id!} org={org} onSaved={reload} flash={flash} />

      {/* Diagnóstico do site (Mapa de IA) — card + popup; some se o cliente não veio do /mapa */}
      <DiagnosticoCard orgId={id!} />

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

      {/* Documentos */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Documentos")}</h2></div>
      <div className="addrow">
        <label className="crasto-btn crasto-btn--secondary crasto-btn--sm" style={{ cursor: "pointer" }}>
          <span className="crasto-btn__icon"><Upload size={14} /></span><span className="crasto-btn__label">{busy ? tr("Enviando…") : tr("Enviar documento")}</span>
          <input type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadDoc(file, (document.getElementById("dockind") as HTMLSelectElement)?.value || "outro"); e.target.value = ""; }} />
        </label>
        <select id="dockind">{DOC_KINDS.map((k) => <option key={k.v} value={k.v}>{tr(k.l)}</option>)}</select>
        <span className="mt">{tr("Cartão CNPJ, contrato social, plano diretor… O \"Contrato de prestação de serviço\" aparece para o cliente no portal (card Contrato).")}</span>
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

      {/* Integrações do Social Media — só quando o módulo está contratado. Chaves BYO deste
          cliente, cifradas no cofre do social-api (o Portal só mostra a máscara). */}
      {(() => {
        const socialMod = mods.find((m: any) => (m as any).social_solution);
        if (!socialMod || !activeSet.has(socialMod.id)) return null;
        return (
          <>
            <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Integrações — Social Media")}</h2><Pill tone="mute">{tr("chaves deste cliente (cifradas)")}</Pill></div>
            <SocialIntegracoes orgId={id!} />
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
        const rf = rolloutForm[c.id] || { label: "", blurb: "", progress: "0", due: "", status: "in_progress", monthly: "", setup: "", contract: "" };
        return (
          <div className="rollrow" key={c.id}>
            <label className="rollf" style={{ flex: "1 1 200px" }}><span>{name}</span><input placeholder={tr("Apelido p/ o cliente (ex.: WhatsApp CRM Comercial)")} value={rf.label} onChange={(e) => setRf(c.id, { label: e.target.value })} /></label>
            <label className="rollf" style={{ flex: "1 1 240px" }}><span>{tr("Descrição p/ o cliente")}</span><input placeholder={tr("ex.: Atendimento e vendas no WhatsApp com IA")} value={rf.blurb} onChange={(e) => setRf(c.id, { blurb: e.target.value })} /></label>
            <label className="rollf"><span>{tr("Progresso (%)")}</span><input type="number" min={0} max={100} value={rf.progress} onChange={(e) => setRf(c.id, { progress: e.target.value })} /></label>
            <label className="rollf"><span>{tr("Prazo de entrega")}</span><input type="date" value={rf.due} onChange={(e) => setRf(c.id, { due: e.target.value })} /></label>
            <label className="rollf"><span>{tr("Status")}</span><select value={rf.status} onChange={(e) => setRf(c.id, { status: e.target.value })}><option value="in_progress">{tr("Em andamento")}</option><option value="delivered">{tr("Entregue")}</option><option value="on_hold">{tr("Em espera")}</option></select></label>
            <label className="rollf"><span>{tr("Custo mensal (R$)")}</span><input type="number" min={0} step="0.01" placeholder="—" value={rf.monthly} onChange={(e) => setRf(c.id, { monthly: e.target.value })} /></label>
            <label className="rollf"><span>{tr("Custo de implantação (R$)")}</span><input type="number" min={0} step="0.01" placeholder="—" value={rf.setup} onChange={(e) => setRf(c.id, { setup: e.target.value })} /></label>
            <label className="rollf" title={tr("Quem paga o custo de IA deste processo")}><span>{tr("Custo de IA")}</span><select value={rf.cost_allocation} onChange={(e) => setRf(c.id, { cost_allocation: e.target.value })}><option value="">{tr("Padrão do serviço")}</option><option value="absorvido">{tr("Crasto absorve")}</option><option value="byo_cliente">{tr("Transferir ao cliente")}</option></select></label>
            <label className="rollf"><span>{tr("Data do contrato")}</span><input type="date" value={rf.contract} onChange={(e) => setRf(c.id, { contract: e.target.value })} /></label>
            <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={() => saveRollout(c.id)}><span className="crasto-btn__label">{tr("Salvar")}</span></button>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} title={tr("Criar outra instância deste mesmo módulo")} onClick={() => dupInstance(c)}><span className="crasto-btn__label">{tr("+ Duplicar")}</span></button>
            <button className="icobtn rm" title={tr("Excluir instância")} onClick={() => delInstance(c.id)}><Trash2 size={14} /></button>
          </div>
        );
      })}

      {/* Etapas do cronograma: NÃO se edita aqui (decisão Crasto 2026-07-27). O cronograma nasce na
          PROPOSTA e é pré-definido por módulo no Catálogo de Módulos (VDI); ao contratar o módulo,
          preenche automaticamente. Editor manual removido. */}

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

      {/* PESSOAS moram em Permissões & Acessos (unificação 24/07/2026). Aqui fica só um resumo
          e o atalho — o Detalhe do cliente cuida do CLIENTE (dados, agentes, módulos), não das
          pessoas. Uma fonte da verdade para "quem acessa o quê". */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Pessoas com acesso")}</h2></div>
      <div className="note">
        <UserPlus size={15} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{users.length > 0
            ? tr("{n} pessoa(s) com acesso ao Portal. Convidar, papel, telas e módulos ficam em Permissões & Acessos.", { n: users.length })
            : tr("Ninguém com acesso ainda. Convide e defina permissões em Permissões & Acessos.")}</span>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => nav(`/admin/console/permissoes?org=${id}`)}>
            <span className="crasto-btn__icon"><UserPlus size={14} /></span><span className="crasto-btn__label">{tr("Gerenciar pessoas")}</span>
          </button>
        </div>
      </div>

      {/* Agente do WhatsApp CRM que atende este cliente — config do cliente (a API decide se aparece) */}
      {id && <CrmAccessSection orgId={id} onToast={setToast} />}

      {/* Histórico de implantação — o quê / quando / QUEM implantou (o cliente vê no card Implantação) */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Histórico de implantação")}</h2><Pill tone="mute">{tr("o cliente abre no card \"Implantação\" — o quê, quando e quem")}</Pill></div>
      <div className="addrow" style={{ flexWrap: "wrap" }}>
        <input type="datetime-local" value={ievf.happened_at} onChange={(e) => setIevf({ ...ievf, happened_at: e.target.value })} style={{ minWidth: 200 }} />
        <input placeholder={tr("O que foi implantado (ex.: Agente publicado)")} value={ievf.title} onChange={(e) => setIevf({ ...ievf, title: e.target.value })} style={{ flex: 2, minWidth: 200 }} />
        <select value={ievf.client_module_id} onChange={(e) => setIevf({ ...ievf, client_module_id: e.target.value })} style={{ minWidth: 160 }}>
          <option value="">{tr("Marco geral (sem módulo)")}</option>
          {cm.map((c) => <option key={c.id} value={c.id}>{c.label || mods.find((m) => m.id === c.vdi_module_id)?.name || tr("Instância")}</option>)}
        </select>
        <input placeholder={tr("Quem implantou (ex.: Crasto, Jhon)")} value={ievf.performed_by_name} onChange={(e) => setIevf({ ...ievf, performed_by_name: e.target.value })} style={{ minWidth: 160 }} />
      </div>
      <div className="addrow" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <textarea placeholder={tr("Detalhe do marco (opcional)")} value={ievf.detail} onChange={(e) => setIevf({ ...ievf, detail: e.target.value })} style={{ flex: 1, minWidth: 240, minHeight: 60 }} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={addImplEvent}><span className="crasto-btn__label">{busy ? tr("Salvando…") : tr("Registrar marco")}</span></button>
      </div>
      {(implEvents as any[]).length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhum marco registrado — o card de implantação abre vazio para o cliente.")}</div> : (implEvents as any[]).map((e: any) => (
        <div className="lead" key={e.id}><div className="av">✅</div><div style={{ flex: 1 }}><div className="nm">{e.title}{e.module_name ? ` · ${e.module_name}` : ""}</div><div className="mt">{fmtDate(e.happened_at)}{e.performed_by_name ? ` · ${tr("por")} ${e.performed_by_name}` : ""}{e.created_by_name ? ` · ${tr("registrou")} ${e.created_by_name}` : ""}</div></div><button className="icobtn rm" onClick={() => delImplEvent(e.id)}><Trash2 size={13} /></button></div>
      ))}

      {/* Reuniões & base de conhecimento — minutas/transcrições que o cliente vê no portal dele */}
      <div className="sec-h" style={{ marginTop: 24 }}><h2>{tr("Reuniões & base de conhecimento")}</h2><Pill tone="mute">{tr("o cliente vê no início — data, resumo e minuta")}</Pill></div>
      <div className="addrow" style={{ flexWrap: "wrap" }}>
        <input type="datetime-local" value={meetf.meeting_at} onChange={(e) => setMeetf({ ...meetf, meeting_at: e.target.value })} style={{ minWidth: 200 }} />
        <input placeholder={tr("Título (ex.: Kickoff, Alinhamento de escopo)")} value={meetf.title} onChange={(e) => setMeetf({ ...meetf, title: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <input placeholder={tr("Participantes (ex.: Crasto, Jhon, Daniel)")} value={meetf.attendees} onChange={(e) => setMeetf({ ...meetf, attendees: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
      </div>
      <div className="addrow" style={{ marginTop: 8 }}>
        <textarea placeholder={tr("Resumo — o que ficou decidido (o cliente lê isto)")} value={meetf.summary} onChange={(e) => setMeetf({ ...meetf, summary: e.target.value })} style={{ flex: 1, minWidth: 240, minHeight: 60 }} />
      </div>
      <div className="addrow" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <textarea placeholder={tr("Minuta / transcrição completa (opcional)")} value={meetf.transcript} onChange={(e) => setMeetf({ ...meetf, transcript: e.target.value })} style={{ flex: 1, minWidth: 240, minHeight: 90 }} />
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={addMeeting}><span className="crasto-btn__label">{busy ? tr("Salvando…") : tr("Registrar reunião")}</span></button>
      </div>
      {(meetings as any[]).length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{tr("Nenhuma reunião registrada — o cliente ainda não vê nada aqui.")}</div> : (meetings as any[]).map((m: any) => (
        <div className="lead" key={m.id}><div className="av">📋</div><div style={{ flex: 1 }}><div className="nm">{m.title}</div><div className="mt">{fmtDate(m.meeting_at)}{m.attendees ? ` · ${m.attendees}` : ""}{m.created_by_name ? ` · ${tr("por")} ${m.created_by_name}` : ""}{m.transcript ? ` · ${tr("com minuta")}` : ""}</div></div><button className="icobtn rm" onClick={() => delMeeting(m.id)}><Trash2 size={13} /></button></div>
      ))}

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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// OrgInline foi extraído para ./OrgInline.tsx (compartilhado entre a ficha de lead e a de cliente).
