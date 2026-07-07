import { useEffect, useRef, useState } from "react";
import { Camera, Plus, Search, Building2, FileText, Image as ImageIcon, Users, Upload, Trash2 } from "lucide-react";
import { services, errorMessage } from "../services";
import { useAuth } from "../lib/auth";
import { PageHead, Field, Empty, Pill, useAsync, initials } from "../ui/ui";
import { useT } from "../lib/i18n";

const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Isento / Outro"];
const EMPTY = { name: "", legal_name: "", tax_id: "", state_registration: "", municipal_registration: "", tax_regime: "", owner_name: "", founded_on: "", zip: "", state: "", city: "", address: "", address_number: "", district: "", address_complement: "", emails: [] as string[], phones: [] as string[], websites: [] as string[] };

export default function Perfil() {
  const t = useT();
  const { profile, refreshProfile } = useAuth();
  const isClient = !!profile?.organization_id;
  const isOwner = profile?.role === "client_owner";
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };
  const [tab, setTab] = useState("empresa");

  // --- Meu perfil (usuário) ---
  const avInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile?.full_name || "");
  const [avBusy, setAvBusy] = useState(false);
  const [busyU, setBusyU] = useState(false);
  useEffect(() => { setName(profile?.full_name || ""); }, [profile?.full_name]);
  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !profile?.id || !file.type.startsWith("image/")) return;
    setAvBusy(true);
    try { await services.identity.profiles.uploadAvatar(profile.id, file); await refreshProfile(); flash(t("Foto atualizada ✓")); }
    catch (err) { flash(errorMessage(err)); } finally { setAvBusy(false); }
  }
  async function saveUser() {
    if (!profile?.id) return;
    setBusyU(true);
    try { await services.identity.profiles.update(profile.id, { full_name: name.trim() || null }); await refreshProfile(); flash(t("Perfil salvo ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusyU(false); }
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

  // multi-valor (e-mails/telefones/sites) — função que retorna JSX (sem remontar inputs)
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
  function addCnpj() { setRows((r) => [...r, { cnpj: "", trade_name: "", legal_name: "", is_headquarters: r.length === 0, is_active: true }]); }
  async function saveCnpj(i: number) {
    setRowBusy(String(i));
    try { await services.identity.cnpjs.save(rows[i]); await reloadCnpjs(); flash(t("CNPJ salvo ✓")); }
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

  const TABS = [
    { key: "empresa", icon: Building2, label: "Dados da Empresa" },
    { key: "cnpjs", icon: FileText, label: "CNPJs" },
    { key: "identidade", icon: ImageIcon, label: "Identidade Visual" },
    { key: "socios", icon: Users, label: "Sócios" },
    { key: "docs", icon: Upload, label: "Documentos" },
  ];

  return (
    <div>
      <PageHead eyebrow={isClient ? "Portal do Cliente" : "Painel Admin"} title="Configurações do Perfil e Empresa"
        sub="Gerencie seu perfil, dados cadastrais e informações da sua empresa."
        right={<Pill tone="info">{isClient ? (isOwner ? t("Dono") : t("Membro")) : t("Admin")}</Pill>} />

      {/* Meu perfil */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>{t("Meu perfil")}</h3>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" className="su-av su-av--btn" style={{ width: 68, height: 68, borderRadius: 18, fontSize: 24 }} disabled={avBusy} onClick={() => avInput.current?.click()} title={t("Trocar foto de perfil")}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.full_name || profile?.email)}
            <span className="su-av__cam"><Camera size={18} /></span>
          </button>
          <input ref={avInput} type="file" accept="image/*" hidden onChange={onAvatar} />
          <div className="grid2" style={{ flex: 1, minWidth: 260 }}>
            <Field label="Nome completo"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Seu nome")} /></Field>
            <Field label="E-mail (login)"><input value={profile?.email || ""} disabled /></Field>
          </div>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busyU} onClick={saveUser}><span className="crasto-btn__label">{busyU ? t("Salvando…") : t("Salvar")}</span></button>
        </div>
      </div>

      {!isClient ? (
        <div className="note"><span>{t("Admin da Crasto.AI — os dados cadastrais das empresas ficam na ficha de cada cliente (Clientes).")}</span></div>
      ) : (
        <>
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
                {isOwner && <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busyO} onClick={saveOrg}><span className="crasto-btn__label">{busyO ? t("Salvando…") : t("Salvar")}</span></button>}
              </div>
              {orgLoading ? <Empty>Carregando…</Empty> : (
                <div style={{ marginTop: 14 }}>
                  <div className="grid3">
                    <Field label="Razão social"><input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Nome fantasia"><input value={f.name} onChange={(e) => set("name", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="CNPJ"><input value={f.tax_id} onChange={(e) => set("tax_id", e.target.value)} disabled={!isOwner} placeholder="00.000.000/0000-00" /></Field>
                  </div>
                  <div className="grid3">
                    <Field label="Inscrição estadual"><input value={f.state_registration} onChange={(e) => set("state_registration", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Inscrição municipal"><input value={f.municipal_registration} onChange={(e) => set("municipal_registration", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Regime tributário"><select value={f.tax_regime} onChange={(e) => set("tax_regime", e.target.value)} disabled={!isOwner}><option value="">{t("Selecione")}</option>{REGIMES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field>
                  </div>
                  <div className="grid3">
                    <Field label="Responsável"><input value={f.owner_name} onChange={(e) => set("owner_name", e.target.value)} disabled={!isOwner} placeholder={t("Nome")} /></Field>
                    {multi("E-mail(s)", "emails", "email@empresa.com")}
                    {multi("Telefone(s)", "phones", "(11) 99999-0000")}
                  </div>
                  <div className="grid3">
                    <Field label="CEP"><div style={{ display: "flex", gap: 6 }}><input style={{ flex: 1 }} value={f.zip} onChange={(e) => set("zip", e.target.value)} onBlur={lookupCep} disabled={!isOwner} placeholder="00000-000" /><button type="button" className="icobtn" title={t("Buscar CEP")} disabled={!isOwner || cepBusy} onClick={lookupCep}><Search size={14} /></button></div></Field>
                    <Field label="Estado"><input value={f.state} onChange={(e) => set("state", e.target.value)} disabled={!isOwner} placeholder="UF" /></Field>
                    <Field label="Cidade"><input value={f.city} onChange={(e) => set("city", e.target.value)} disabled={!isOwner} /></Field>
                  </div>
                  <div className="grid3">
                    <Field label="Endereço"><input value={f.address} onChange={(e) => set("address", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Número"><input value={f.address_number} onChange={(e) => set("address_number", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Bairro"><input value={f.district} onChange={(e) => set("district", e.target.value)} disabled={!isOwner} /></Field>
                  </div>
                  <div className="grid2">
                    <Field label="Complemento"><input value={f.address_complement} onChange={(e) => set("address_complement", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Fundação da empresa"><input type="date" value={f.founded_on} onChange={(e) => set("founded_on", e.target.value)} disabled={!isOwner} /></Field>
                  </div>
                  {multi("Website(s)", "websites", "https://www.empresa.com.br")}
                  {isOwner
                    ? <div className="note" style={{ marginTop: 14 }}><span>{t("O que você atualizar aqui também atualiza o seu cadastro na Crasto.AI.")}</span></div>
                    : <div className="note" style={{ marginTop: 14 }}><span>{t("Só o responsável (dono) da conta pode editar os dados da empresa.")}</span></div>}
                </div>
              )}
            </div>
          )}

          {tab === "cnpjs" && (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>{t("CNPJs Cadastrados")}</h3>
                {isOwner && <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addCnpj}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo CNPJ")}</span></button>}
              </div>
              {rows.length === 0 ? <div className="mt" style={{ padding: "8px 2px" }}>{t("Nenhum CNPJ cadastrado.")}</div> : rows.map((r, i) => (
                <div className="card" style={{ marginTop: 12, background: "var(--crasto-bg-2)" }} key={r.id || `new${i}`}>
                  <div className="grid3">
                    <Field label="CNPJ"><input value={r.cnpj || ""} onChange={(e) => setRow(i, "cnpj", e.target.value)} disabled={!isOwner} placeholder="00.000.000/0000-00" /></Field>
                    <Field label="Nome fantasia"><input value={r.trade_name || ""} onChange={(e) => setRow(i, "trade_name", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Razão social"><input value={r.legal_name || ""} onChange={(e) => setRow(i, "legal_name", e.target.value)} disabled={!isOwner} /></Field>
                  </div>
                  <div className="grid3">
                    <Field label="Inscrição estadual"><input value={r.inscricao_estadual || ""} onChange={(e) => setRow(i, "inscricao_estadual", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Inscrição municipal"><input value={r.inscricao_municipal || ""} onChange={(e) => setRow(i, "inscricao_municipal", e.target.value)} disabled={!isOwner} /></Field>
                    <Field label="Regime tributário"><select value={r.regime_tributario || ""} onChange={(e) => setRow(i, "regime_tributario", e.target.value)} disabled={!isOwner}><option value="">{t("Selecione")}</option>{REGIMES.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
                  </div>
                  <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (r.is_headquarters ? " on" : "")} disabled={!isOwner} onClick={() => toggleCnpj(i, "is_headquarters")} /><span style={{ fontSize: 13, fontWeight: 600 }}>{r.is_headquarters ? t("Matriz") : t("Filial")}</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className={"sw" + (r.is_active ? " on" : "")} disabled={!isOwner} onClick={() => toggleCnpj(i, "is_active")} /><span style={{ fontSize: 13, fontWeight: 600 }}>{r.is_active ? t("Ativo") : t("Inativo")}</span></div>
                    {isOwner && <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={rowBusy === String(i)} onClick={() => saveCnpj(i)}><span className="crasto-btn__label">{rowBusy === String(i) ? t("Salvando…") : t("Salvar")}</span></button>
                      <button className="icobtn rm" title={t("Excluir")} onClick={() => delCnpj(i)}><Trash2 size={14} /></button>
                    </div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab !== "empresa" && tab !== "cnpjs" && (
            <div className="card"><Empty><p><strong>{t("Em breve.")}</strong> {t("Esta aba está em construção — em breve você poderá gerenciar isso por aqui.")}</p></Empty></div>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
