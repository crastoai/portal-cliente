import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, Plus, Search, Building2, FileText, Users, Upload, Download, Trash2, KeyRound, IdCard, ShieldCheck, Bell, MessageSquare } from "lucide-react";
import { services, errorMessage } from "../services";
import { useAuth } from "../lib/auth";
import { PageHead, Field, Empty, Pill, useAsync, initials } from "../ui/ui";
import { useT } from "../lib/i18n";
import Modal from "../ui/Modal";
import { supabase } from "../lib/supabase";
import { COUNTRIES, reg, regTypeFor } from "../lib/registrations";
import { useUnitScope } from "../lib/unitScope";
import AddCompanyModal from "../ui/AddCompanyModal";
import { NotifPrefsCard } from "./client/Notificacoes";
import TwoFactor from "./TwoFactor";
import "../styles/settings.css";
import "../styles/colaboradores.css"; // reaproveita .ec-preview (prévia do WhatsApp)

const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Isento / Outro"];
const EMPTY = { name: "", legal_name: "", tax_id: "", state_registration: "", municipal_registration: "", tax_regime: "", owner_name: "", founded_on: "", zip: "", state: "", city: "", address: "", address_number: "", district: "", address_complement: "", emails: [] as string[], phones: [] as string[], websites: [] as string[] };
const TIPO_LABEL: Record<string, string> = { clt: "CLT", pj: "Prestador PJ", estagio: "Estágio", temporario: "Temporário" };
type Secao = "conta" | "seguranca" | "notif" | "empresa";

// Empresas (CNPJs) da conta — as MESMAS unidades do seletor de unidades (business_units). Aparecem
// aqui em "Dados da empresa" e nos detalhes do cliente (admin); o dono adiciona por aqui ou pelo topo.
function EmpresasCnpj() {
  const t = useT();
  const { units, canManage, reload } = useUnitScope();
  const [add, setAdd] = useState(false);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>{t("Empresas (CNPJs)")}</h3>
          <div className="mt">{t("As unidades da sua empresa no sistema. A matriz e cada CNPJ adicional aparecem no seletor do topo.")}</div>
        </div>
        {canManage && (
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setAdd(true)}>
            <span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Adicionar empresa")}</span>
          </button>
        )}
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {units.length === 0 && <Empty>{t("Nenhuma empresa cadastrada ainda.")}</Empty>}
        {units.map((u) => (
          <div key={u.id} className="urow">
            <div className="urow-ico"><Building2 size={16} /></div>
            <div className="urow-main">
              <div className="urow-nm">{u.name}{u.is_primary && <Pill>{t("Matriz")}</Pill>}{u.status === "inactive" && <Pill>{t("Inativa")}</Pill>}</div>
              <div className="urow-sub">{u.cnpj || t("Sem CNPJ informado")}{u.legal_name ? ` · ${u.legal_name}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
      {add && <AddCompanyModal onClose={() => setAdd(false)} onCreated={reload} />}
    </div>
  );
}

export default function Perfil() {
  const t = useT();
  const { profile, refreshProfile } = useAuth();
  const isClient = !!profile?.organization_id;
  const isOwner = profile?.role === "client_owner";
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };
  const [tab, setTab] = useState("empresa"); // sub-abas DENTRO de "Dados da Empresa"

  // Seção da tela Configurações (sub-nav à esquerda). Deep-link por ?sec= (o menu do perfil usa).
  const [sp] = useSearchParams();
  const [sec, setSec] = useState<Secao>((sp.get("sec") as Secao) || "conta");
  // Navegar pro ?sec= já estando na tela (ex.: menu do perfil → "Autenticação em duas etapas").
  useEffect(() => { const s = sp.get("sec") as Secao | null; if (s) setSec(s); }, [sp]);

  // --- Meu perfil (usuário) ---
  const avInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile?.full_name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [avBusy, setAvBusy] = useState(false);
  const [busyU, setBusyU] = useState(false);
  useEffect(() => { setName(profile?.full_name || ""); setEmail(profile?.email || ""); }, [profile?.full_name, profile?.email]);

  // --- Dados do PRÓPRIO usuário (auto-edição): contato + nome no WhatsApp; cargo/dept/tipo read-only ---
  const [self, setSelf] = useState<{ cargo?: string | null; departamento?: string | null; tipo_contrato?: string | null }>({});
  const [cpf, setCpf] = useState(""); const [tel, setTel] = useState(""); const [waSender, setWaSender] = useState("");
  useEffect(() => {
    if (!isClient) return;
    services.delivery.myCollaborator.get().then((d) => {
      setSelf({ cargo: d.team?.cargo, departamento: d.team?.departamento, tipo_contrato: d.team?.tipo_contrato });
      setCpf(d.team?.cpf_cnpj || ""); setTel(d.team?.telefone || ""); setWaSender(d.wa_sender_name || "");
    }).catch(() => {});
  }, [isClient]);

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !profile?.id || !file.type.startsWith("image/")) return;
    setAvBusy(true);
    try { await services.identity.profiles.uploadAvatar(profile.id, file); await refreshProfile(); flash(t("Foto atualizada ✓")); }
    catch (err) { flash(errorMessage(err)); } finally { setAvBusy(false); }
  }
  // Salva TUDO da aba "Informações de Conta": nome/e-mail (identidade) + contato/WhatsApp (self).
  async function saveConta() {
    if (!profile?.id) return;
    const novoNome = name.trim() || null;
    const novoEmail = email.trim().toLowerCase();
    const emailMudou = !!novoEmail && novoEmail !== (profile.email || "").toLowerCase();
    if (emailMudou && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novoEmail)) { flash(t("E-mail inválido.")); return; }
    setBusyU(true);
    try {
      await services.identity.profiles.update(profile.id, { full_name: novoNome });
      if (emailMudou) { const { error } = await supabase.auth.updateUser({ email: novoEmail }); if (error) throw new Error(error.message); }
      const r: any = await services.delivery.myCollaborator.set({ wa_sender_name: waSender.trim() || null, team: { cpf_cnpj: cpf.trim() || null, telefone: tel.trim() || null } });
      if (r?.error) throw new Error(r.error);
      await refreshProfile();
      flash(emailMudou ? t("Perfil salvo ✓ — confirme o novo e-mail na sua caixa de entrada.") : t("Perfil salvo ✓"));
    }
    catch (e) { flash(errorMessage(e)); } finally { setBusyU(false); }
  }

  // --- Redefinir senha (própria) ---
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ atual: "", nova: "", conf: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwSent, setPwSent] = useState(false);
  function abrirPw() { setPw({ atual: "", nova: "", conf: "" }); setPwErr(null); setPwSent(false); setPwOpen(true); }
  async function redefinirSenha() {
    setPwErr(null);
    if (pw.nova.length < 8) { setPwErr(t("A nova senha precisa ter ao menos 8 caracteres.")); return; }
    if (pw.nova !== pw.conf) { setPwErr(t("A confirmação não confere com a nova senha.")); return; }
    if (!profile?.email) { setPwErr(t("Sessão sem e-mail — recarregue a página.")); return; }
    setPwBusy(true);
    try {
      const { error: e1 } = await supabase.auth.signInWithPassword({ email: profile.email, password: pw.atual });
      if (e1) { setPwErr(t("Senha atual incorreta. Se não lembra, use \"Esqueci minha senha\".")); return; }
      await services.identity.auth.updatePassword(pw.nova);
      setPwOpen(false); flash(t("Senha redefinida ✓"));
    } catch (e) { setPwErr(errorMessage(e)); }
    finally { setPwBusy(false); }
  }
  async function esqueciSenha() {
    if (!profile?.email) return;
    setPwBusy(true); setPwErr(null);
    try { await services.identity.auth.requestReset(profile.email); setPwSent(true); }
    catch (e) { setPwErr(errorMessage(e)); }
    finally { setPwBusy(false); }
  }

  // --- Dados da empresa ---
  const { data: org, loading: orgLoading, reload } = useAsync(
    () => (isClient ? services.identity.organizations.getById(profile!.organization_id!) : Promise.resolve(null)),
    [profile?.organization_id]
  );
  const [f, setF] = useState({ ...EMPTY });
  const [busyO, setBusyO] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  useEffect(() => {
    if (!org) return;
    const o = org as any;
    setF({
      name: o.name || "", legal_name: o.legal_name || "", tax_id: o.tax_id || "", state_registration: o.state_registration || "",
      municipal_registration: o.municipal_registration || "", tax_regime: o.tax_regime || "", owner_name: o.owner_name || "",
      founded_on: o.founded_on || "", zip: o.zip || "", state: o.state || "", city: o.city || "", address: o.address || "",
      address_number: o.address_number || "", district: o.district || "", address_complement: o.address_complement || "",
      emails: o.emails?.length ? o.emails : [], phones: o.phones?.length ? o.phones : [], websites: o.websites?.length ? o.websites : [],
    });
  }, [org]);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  async function lookupCep() {
    const d = f.zip.replace(/\D/g, "");
    if (d.length !== 8) { flash(t("CEP inválido.")); return; }
    setCepBusy(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then((x) => x.json());
      if (r.erro) flash(t("CEP não encontrado."));
      else setF((s) => ({ ...s, state: r.uf || s.state, city: r.localidade || s.city, address: r.logradouro || s.address, district: r.bairro || s.district }));
    } catch { flash(t("Não foi possível buscar o CEP.")); } finally { setCepBusy(false); }
  }
  async function saveOrg() {
    setBusyO(true);
    try {
      await services.identity.organizations.updateMine({ ...f, founded_on: f.founded_on || null, emails: f.emails, websites: f.websites, phones: f.phones });
      await reload(); flash(t("Dados da empresa salvos ✓"));
    } catch (e) { flash(errorMessage(e)); } finally { setBusyO(false); }
  }

  const multi = (label: string, k: "emails" | "phones" | "websites", placeholder: string) => {
    const list = f[k].length ? f[k] : [""];
    return (
      <label className="frow"><span>{t(label)}</span>
        {list.map((v, i) => (
          <input key={i} value={v} disabled={!isOwner} placeholder={placeholder} style={{ marginBottom: 6 }}
            onChange={(e) => { const n = [...list]; n[i] = e.target.value; set(k, n); }} />
        ))}
        {isOwner && <button type="button" className="addlink" onClick={() => set(k, [...list, ""])}><Plus size={13} /> {t("Adicionar")}</button>}
      </label>
    );
  };

  // --- CNPJs (matriz + filiais) ---
  const { data: cnpjData, reload: reloadCnpjs } = useAsync(() => (isClient ? services.identity.cnpjs.mine() : Promise.resolve([] as any[])), [profile?.organization_id]);
  const [rows, setRows] = useState<any[]>([]);
  const [rowBusy, setRowBusy] = useState<string>("");
  useEffect(() => { setRows((cnpjData as any[]) ?? []); }, [cnpjData]);
  const setRow = (i: number, k: string, v: any) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  function addCnpj() { setRows((r) => [...r, { cnpj: "", trade_name: "", legal_name: "", country: "BR", reg_type: "cnpj", is_headquarters: r.length === 0, is_active: true }]); }
  function setCountry(i: number, c: string) { setRows((r) => r.map((x, j) => (j === i ? { ...x, country: c, reg_type: regTypeFor(c) } : x))); }
  async function saveCnpj(i: number) {
    const row = rows[i];
    if (row.cnpj && !reg(row.reg_type).validate(row.cnpj)) { flash(t("Número do registro inválido para o país selecionado.")); return; }
    setRowBusy(String(i));
    try { await services.identity.cnpjs.save(row); await reloadCnpjs(); flash(t("Registro salvo ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setRowBusy(""); }
  }
  async function toggleCnpj(i: number, k: string) {
    const v = !rows[i][k]; setRow(i, k, v);
    const row = { ...rows[i], [k]: v };
    if (row.id) { try { await services.identity.cnpjs.save(row); await reloadCnpjs(); } catch (e) { flash(errorMessage(e)); } }
  }
  async function delCnpj(i: number) {
    const row = rows[i];
    if (row.id) { if (!confirm(t("Excluir este CNPJ?"))) return; await services.identity.cnpjs.remove(row.id); await reloadCnpjs(); }
    else setRows((r) => r.filter((_, j) => j !== i));
  }

  // --- Sócios ---
  const { data: partData, reload: reloadPart } = useAsync(() => (isClient ? services.identity.partners.mine() : Promise.resolve([] as any[])), [profile?.organization_id]);
  const [prows, setProws] = useState<any[]>([]);
  const [pBusy, setPBusy] = useState<string>("");
  useEffect(() => { setProws((partData as any[]) ?? []); }, [partData]);
  const setP = (i: number, k: string, v: any) => setProws((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  function addPartner() { setProws((r) => [...r, { full_name: "", cpf: "", role_title: "", ownership_percentage: "", email: "", mobile_phone: "", is_ceo: r.length === 0, is_active: true }]); }
  async function savePartner(i: number) { setPBusy(String(i)); try { await services.identity.partners.save(prows[i]); await reloadPart(); flash(t("Sócio salvo ✓")); } catch (e) { flash(errorMessage(e)); } finally { setPBusy(""); } }
  async function togglePartner(i: number, k: string) { const v = !prows[i][k]; setP(i, k, v); const row = { ...prows[i], [k]: v }; if (row.id) { try { await services.identity.partners.save(row); await reloadPart(); } catch (e) { flash(errorMessage(e)); } } }
  async function delPartner(i: number) { const row = prows[i]; if (row.id) { if (!confirm(t("Excluir este sócio?"))) return; await services.identity.partners.remove(row.id); await reloadPart(); } else setProws((r) => r.filter((_, j) => j !== i)); }

  // --- Documentos ---
  const { data: docData, reload: reloadDocs } = useAsync(() => (isClient ? services.identity.clientDocs.mine() : Promise.resolve([] as any[])), [profile?.organization_id]);
  const docInput = useRef<HTMLInputElement>(null);
  const [docKind, setDocKind] = useState("Contrato social");
  const [docBusy, setDocBusy] = useState(false);
  async function onDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !profile?.organization_id) return;
    setDocBusy(true);
    try {
      const key = await services.storage.upload(profile.organization_id, file);
      await services.identity.clientDocs.add({ kind: docKind, file_name: file.name, storage_path: key });
      await reloadDocs(); flash(t("Documento enviado ✓"));
    } catch (err) { flash(errorMessage(err)); } finally { setDocBusy(false); }
  }
  async function dlDoc(path: string) { const url = await services.storage.getUrl(path); if (url) window.open(url, "_blank"); }
  async function delDoc(d: any) { if (!confirm(t("Excluir este documento?"))) return; try { const path = await services.identity.clientDocs.remove(d.id); if (path) await services.storage.remove(path); await reloadDocs(); } catch (e) { flash(errorMessage(e)); } }

  const TABS = [
    { key: "empresa", icon: Building2, label: "Dados da Empresa" },
    { key: "cnpjs", icon: FileText, label: "Registros legais" },
    { key: "socios", icon: Users, label: "Sócios" },
    { key: "docs", icon: Upload, label: "Documentos" },
  ];
  const NAV: { key: Secao; icon: typeof IdCard; label: string; show: boolean }[] = [
    { key: "conta", icon: IdCard, label: "Informações de Conta", show: true },
    { key: "seguranca", icon: ShieldCheck, label: "Segurança", show: true },
    { key: "notif", icon: Bell, label: "Notificações", show: isClient },
    { key: "empresa", icon: Building2, label: "Dados da Empresa", show: isClient && isOwner },
  ];

  return (
    <div>
      <PageHead eyebrow={isClient ? "Portal do Cliente" : "Painel Admin"} title="Configurações"
        sub="Gerencie a sua conta, segurança e notificações."
        right={<Pill tone="info">{isClient ? (isOwner ? t("Dono") : t("Membro")) : t("Admin")}</Pill>} />

      <div className="set-layout">
        {/* Sub-navegação à esquerda (padrão Hostinger) */}
        <nav className="set-nav">
          {NAV.filter((n) => n.show).map((n) => (
            <button key={n.key} className={"set-nav-item" + (sec === n.key ? " on" : "")} onClick={() => setSec(n.key)}>
              <n.icon size={17} /> <span>{t(n.label)}</span>
            </button>
          ))}
        </nav>

        <div className="set-main">
          {/* ── INFORMAÇÕES DE CONTA ── */}
          {sec === "conta" && (
            <div className="card">
              <h3>{t("Informações de Conta")}</h3>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", margin: "14px 0 4px" }}>
                <button type="button" className="su-av su-av--btn" style={{ width: 68, height: 68, borderRadius: 18, fontSize: 24 }} disabled={avBusy} onClick={() => avInput.current?.click()} title={t("Trocar foto de perfil")}>
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.full_name || profile?.email)}
                  <span className="su-av__cam"><Camera size={18} /></span>
                </button>
                <input ref={avInput} type="file" accept="image/*" hidden onChange={onAvatar} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="nm" style={{ fontSize: 16 }}>{profile?.full_name || "—"}</div>
                  <div className="mt">{profile?.email}{self.cargo ? ` · ${self.cargo}` : ""}</div>
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 6 }}>
                <Field label="Nome completo"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Seu nome")} /></Field>
                <Field label="E-mail (login)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" /></Field>
              </div>
              {isClient && (<>
                <div className="grid2">
                  <Field label="CPF / CNPJ"><input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" /></Field>
                  <Field label="Telefone"><input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(11) 99999-0000" /></Field>
                </div>
                {/* Dados definidos pela empresa (o admin/dono edita) — aqui só leitura. */}
                {(self.cargo || self.departamento || self.tipo_contrato) && (
                  <div className="grid3" style={{ marginTop: 2 }}>
                    <Field label="Cargo / Função"><input value={self.cargo || "—"} disabled /></Field>
                    <Field label="Departamento"><input value={self.departamento || "—"} disabled /></Field>
                    <Field label="Tipo de contrato"><input value={self.tipo_contrato ? (TIPO_LABEL[self.tipo_contrato] || self.tipo_contrato) : "—"} disabled /></Field>
                  </div>
                )}
                <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--crasto-border-hairline)" }}>
                  <div className="set-sub-h"><MessageSquare size={14} /> {t("Nome de exibição no WhatsApp")}</div>
                  <div className="grid2" style={{ marginTop: 8 }}>
                    <Field label="Nome de exibição"><input value={waSender} onChange={(e) => setWaSender(e.target.value)} placeholder={profile?.full_name || t("Ex.: João, Suporte Técnico")} /></Field>
                    <div className="ec-preview" style={{ margin: 0, alignSelf: "end" }}>
                      <div className="ec-preview__lb">{t("Prévia da mensagem")}:</div>
                      <div><b style={{ color: "var(--crasto-blue)" }}>{waSender || profile?.full_name || t("Nome")}:</b> <i>{t("Olá, como posso ajudar?")}</i></div>
                    </div>
                  </div>
                  <div className="note" style={{ marginTop: 10 }}><span>{t("Este é o nome que aparece como sua assinatura nas mensagens do WhatsApp CRM quando você assume uma conversa. Se ficar vazio, usamos o seu nome completo.")}</span></div>
                </div>
              </>)}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busyU} onClick={saveConta}><span className="crasto-btn__label">{busyU ? t("Salvando…") : t("Salvar")}</span></button>
              </div>
            </div>
          )}

          {/* ── SEGURANÇA ── */}
          {sec === "seguranca" && (<>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="set-row">
                <div><h3 style={{ margin: 0 }}>{t("Senha")}</h3><div className="mt">{t("Sua senha de acesso ao Portal. Recomendamos trocar de tempos em tempos.")}</div></div>
                <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={abrirPw}><span className="crasto-btn__icon"><KeyRound size={14} /></span><span className="crasto-btn__label">{t("Redefinir senha")}</span></button>
              </div>
            </div>
            <TwoFactor />
          </>)}

          {/* ── PERMISSÕES DE NOTIFICAÇÃO ── */}
          {sec === "notif" && isClient && <NotifPrefsCard />}

          {/* ── DADOS DA EMPRESA (só dono) ── */}
          {sec === "empresa" && isClient && isOwner && (<>
            <div className="ptabs">
              {TABS.map((tb) => (
                <button key={tb.key} className={"ptab" + (tab === tb.key ? " is-active" : "")} onClick={() => setTab(tb.key)}>
                  <tb.icon size={15} /> <span>{t(tb.label)}</span>
                </button>
              ))}
            </div>

            {tab === "empresa" && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>{t("Dados Cadastrais")}</h3>
                  <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busyO} onClick={saveOrg}><span className="crasto-btn__label">{busyO ? t("Salvando…") : t("Salvar")}</span></button>
                </div>
                {orgLoading ? <Empty>Carregando…</Empty> : (
                  <div style={{ marginTop: 14 }}>
                    <div className="grid3">
                      <Field label="Razão social"><input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></Field>
                      <Field label="Nome fantasia"><input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
                      <Field label="CNPJ"><input value={f.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="00.000.000/0000-00" /></Field>
                    </div>
                    <div className="grid3">
                      <Field label="Inscrição estadual"><input value={f.state_registration} onChange={(e) => set("state_registration", e.target.value)} /></Field>
                      <Field label="Inscrição municipal"><input value={f.municipal_registration} onChange={(e) => set("municipal_registration", e.target.value)} /></Field>
                      <Field label="Regime tributário"><select value={f.tax_regime} onChange={(e) => set("tax_regime", e.target.value)}><option value="">{t("Selecione")}</option>{REGIMES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field>
                    </div>
                    <div className="grid3">
                      <Field label="Responsável"><input value={f.owner_name} onChange={(e) => set("owner_name", e.target.value)} placeholder={t("Nome")} /></Field>
                      {multi("E-mail(s)", "emails", "email@empresa.com")}
                      {multi("Telefone(s)", "phones", "(11) 99999-0000")}
                    </div>
                    <div className="grid3">
                      <Field label="CEP"><div style={{ display: "flex", gap: 6 }}><input style={{ flex: 1 }} value={f.zip} onChange={(e) => set("zip", e.target.value)} onBlur={lookupCep} placeholder="00000-000" /><button type="button" className="icobtn" title={t("Buscar CEP")} disabled={cepBusy} onClick={lookupCep}><Search size={14} /></button></div></Field>
                      <Field label="Estado"><input value={f.state} onChange={(e) => set("state", e.target.value)} placeholder="UF" /></Field>
                      <Field label="Cidade"><input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
                    </div>
                    <div className="grid3">
                      <Field label="Endereço"><input value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
                      <Field label="Número"><input value={f.address_number} onChange={(e) => set("address_number", e.target.value)} /></Field>
                      <Field label="Bairro"><input value={f.district} onChange={(e) => set("district", e.target.value)} /></Field>
                    </div>
                    <div className="grid2">
                      <Field label="Complemento"><input value={f.address_complement} onChange={(e) => set("address_complement", e.target.value)} /></Field>
                      <Field label="Fundação da empresa"><input type="date" value={f.founded_on} onChange={(e) => set("founded_on", e.target.value)} /></Field>
                    </div>
                    {multi("Website(s)", "websites", "https://www.empresa.com.br")}
                    <div className="note" style={{ marginTop: 14 }}><span>{t("O que você atualizar aqui também atualiza o seu cadastro na Crasto.AI.")}</span></div>
                  </div>
                )}
              </div>
            )}

            {/* Empresas (CNPJs) do CRM — as unidades do seletor do topo, geridas aqui também */}
            {tab === "empresa" && <EmpresasCnpj />}

            {tab === "cnpjs" && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div><h3 style={{ margin: 0 }}>{t("Registros legais")}</h3><div className="mt">{t("Um grupo pode ter vários registros — inclusive em países diferentes.")}</div></div>
                  <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addCnpj}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo registro")}</span></button>
                </div>
                {rows.length === 0 ? <div className="mt" style={{ padding: "8px 2px" }}>{t("Nenhum registro cadastrado.")}</div> : rows.map((r, i) => { const rc = reg(r.reg_type); return (
                  <div className="card" style={{ marginTop: 12, background: "var(--crasto-bg-2)" }} key={r.id || `new${i}`}>
                    <div className="grid3">
                      <Field label="País"><select value={r.country || "BR"} onChange={(e) => setCountry(i, e.target.value)}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
                      <Field label={rc.label}><input value={r.cnpj || ""} onChange={(e) => setRow(i, "cnpj", e.target.value)} onBlur={(e) => setRow(i, "cnpj", rc.format(e.target.value))} placeholder={rc.placeholder} /></Field>
                      <Field label="Razão social"><input value={r.legal_name || ""} onChange={(e) => setRow(i, "legal_name", e.target.value)} /></Field>
                    </div>
                    <div className="grid3">
                      <Field label="Nome fantasia"><input value={r.trade_name || ""} onChange={(e) => setRow(i, "trade_name", e.target.value)} /></Field>
                      {rc.br ? <>
                        <Field label="Inscrição estadual"><input value={r.inscricao_estadual || ""} onChange={(e) => setRow(i, "inscricao_estadual", e.target.value)} /></Field>
                        <Field label="Regime tributário"><select value={r.regime_tributario || ""} onChange={(e) => setRow(i, "regime_tributario", e.target.value)}><option value="">{t("Selecione")}</option>{REGIMES.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
                      </> : <Field label="Observações"><input value={r.notes || ""} onChange={(e) => setRow(i, "notes", e.target.value)} /></Field>}
                    </div>
                    {rc.br && <div className="grid3"><Field label="Inscrição municipal"><input value={r.inscricao_municipal || ""} onChange={(e) => setRow(i, "inscricao_municipal", e.target.value)} /></Field></div>}
                    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (r.is_headquarters ? " on" : "")} onClick={() => toggleCnpj(i, "is_headquarters")} /><span style={{ fontSize: 13, fontWeight: 600 }}>{r.is_headquarters ? t("Matriz") : t("Filial")}</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (r.is_active ? " on" : "")} onClick={() => toggleCnpj(i, "is_active")} /><span style={{ fontSize: 13, fontWeight: 600 }}>{r.is_active ? t("Ativo") : t("Inativo")}</span></div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={rowBusy === String(i)} onClick={() => saveCnpj(i)}><span className="crasto-btn__label">{rowBusy === String(i) ? t("Salvando…") : t("Salvar")}</span></button>
                        <button className="icobtn rm" title={t("Excluir")} onClick={() => delCnpj(i)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ); })}
              </div>
            )}

            {tab === "socios" && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>{t("Sócios")}</h3>
                  <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addPartner}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo sócio")}</span></button>
                </div>
                {prows.length === 0 ? <div className="mt" style={{ padding: "8px 2px" }}>{t("Nenhum sócio cadastrado.")}</div> : prows.map((r, i) => (
                  <div className="card" style={{ marginTop: 12, background: "var(--crasto-bg-2)" }} key={r.id || `np${i}`}>
                    <div className="grid3">
                      <Field label="Nome completo"><input value={r.full_name || ""} onChange={(e) => setP(i, "full_name", e.target.value)} /></Field>
                      <Field label="CPF"><input value={r.cpf || ""} onChange={(e) => setP(i, "cpf", e.target.value)} placeholder="000.000.000-00" /></Field>
                      <Field label="Cargo"><input value={r.role_title || ""} onChange={(e) => setP(i, "role_title", e.target.value)} placeholder={t("Ex.: Sócio-administrador")} /></Field>
                    </div>
                    <div className="grid3">
                      <Field label="Participação (%)"><input type="number" min={0} max={100} value={r.ownership_percentage ?? ""} onChange={(e) => setP(i, "ownership_percentage", e.target.value)} /></Field>
                      <Field label="E-mail"><input value={r.email || ""} onChange={(e) => setP(i, "email", e.target.value)} /></Field>
                      <Field label="Telefone"><input value={r.mobile_phone || ""} onChange={(e) => setP(i, "mobile_phone", e.target.value)} /></Field>
                    </div>
                    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (r.is_ceo ? " on" : "")} onClick={() => togglePartner(i, "is_ceo")} /><span style={{ fontSize: 13, fontWeight: 600 }}>{t("Administrador")}</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (r.is_active ? " on" : "")} onClick={() => togglePartner(i, "is_active")} /><span style={{ fontSize: 13, fontWeight: 600 }}>{r.is_active ? t("Ativo") : t("Inativo")}</span></div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={pBusy === String(i)} onClick={() => savePartner(i)}><span className="crasto-btn__label">{pBusy === String(i) ? t("Salvando…") : t("Salvar")}</span></button>
                        <button className="icobtn rm" title={t("Excluir")} onClick={() => delPartner(i)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "docs" && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>{t("Documentos")}</h3>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={docKind} onChange={(e) => setDocKind(e.target.value)} className="selorg" style={{ width: 180 }}>
                      {["Contrato social", "Cartão CNPJ", "Documento do sócio", "Comprovante de endereço", "Outro"].map((k) => <option key={k} value={k}>{t(k)}</option>)}
                    </select>
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={docBusy} onClick={() => docInput.current?.click()}><span className="crasto-btn__icon"><Upload size={14} /></span><span className="crasto-btn__label">{docBusy ? t("Enviando…") : t("Enviar documento")}</span></button>
                    <input ref={docInput} type="file" hidden onChange={onDoc} />
                  </div>
                </div>
                {((docData as any[]) ?? []).length === 0 ? <div className="mt" style={{ padding: "8px 2px" }}>{t("Nenhum documento enviado.")}</div> : ((docData as any[]) ?? []).map((d) => (
                  <div className="crmrow" key={d.id}>
                    <span className="ico" style={{ background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)" }}><FileText size={16} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{d.file_name}</div><div className="mt">{d.kind} · {new Date(d.uploaded_at).toLocaleDateString("pt-BR")}</div></div>
                    <button className="icobtn" title={t("Baixar")} onClick={() => dlDoc(d.storage_path)}><Download size={14} /></button>
                    <button className="icobtn rm" title={t("Excluir")} onClick={() => delDoc(d)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {!isClient && sec !== "seguranca" && sec !== "conta" && (
            <div className="note"><span>{t("Admin da Crasto.AI — os dados cadastrais das empresas ficam na ficha de cada cliente (Clientes).")}</span></div>
          )}
        </div>
      </div>

      {/* Redefinir senha */}
      <Modal title={t("Redefinir senha")} open={pwOpen} onClose={() => setPwOpen(false)}
        footer={pwSent
          ? <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setPwOpen(false)}><span className="crasto-btn__label">{t("Fechar")}</span></button>
          : <><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={pwBusy} onClick={() => setPwOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={pwBusy} onClick={redefinirSenha}><span className="crasto-btn__label">{pwBusy ? t("Salvando…") : t("Redefinir")}</span></button></>}>
        {pwErr && <div className="formerr">{pwErr}</div>}
        {pwSent ? (
          <div className="note"><span>{t("Enviamos um e-mail para {e} com o link para redefinir a senha. Abra o e-mail e siga o passo a passo — é o mesmo fluxo de sempre.", { e: profile?.email || "" })}</span></div>
        ) : (
          <>
            <Field label={t("Senha atual")}><input type="password" autoComplete="current-password" value={pw.atual} onChange={(e) => setPw({ ...pw, atual: e.target.value })} placeholder={t("Sua senha de hoje")} /></Field>
            <div style={{ marginTop: -8, marginBottom: 10 }}>
              <button type="button" onClick={esqueciSenha} disabled={pwBusy} style={{ border: 0, background: "transparent", color: "var(--crasto-blue, #6E9CE8)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>{t("Esqueci minha senha")}</button>
            </div>
            <Field label={t("Nova senha")}><input type="password" autoComplete="new-password" value={pw.nova} onChange={(e) => setPw({ ...pw, nova: e.target.value })} placeholder={t("Mínimo de 8 caracteres")} /></Field>
            <Field label={t("Confirmar nova senha")}><input type="password" autoComplete="new-password" value={pw.conf} onChange={(e) => setPw({ ...pw, conf: e.target.value })} onKeyDown={(e) => e.key === "Enter" && redefinirSenha()} placeholder={t("Repita a nova senha")} /></Field>
          </>
        )}
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
