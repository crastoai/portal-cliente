import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { services, errorMessage } from "../services";
import { useAuth } from "../lib/auth";
import { PageHead, Field, Empty, useAsync, initials } from "../ui/ui";
import { useT } from "../lib/i18n";
import { DIAL_CODES } from "../lib/countries";

export default function Perfil() {
  const t = useT();
  const { profile, refreshProfile } = useAuth();
  const isClient = !!profile?.organization_id;
  const isOwner = profile?.role === "client_owner";
  const avInput = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };

  // --- Meu perfil (usuário) ---
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

  // --- Dados da empresa (só cliente) ---
  const { data, loading: orgLoading, reload: reloadOrg } = useAsync(
    async () => {
      if (!isClient) return { org: null, contact: null };
      const [org, contact] = await Promise.all([
        services.identity.organizations.getById(profile!.organization_id!),
        services.identity.organizations.myContact(),
      ]);
      return { org, contact };
    },
    [profile?.organization_id]
  );
  const org = data?.org;
  const [of, setOf] = useState({ name: "", tax_id: "", founded_on: "", website: "", owner_name: "", wa_ddi: "+55", wa_number: "" });
  const [busyO, setBusyO] = useState(false);
  useEffect(() => {
    if (!data) return;
    const o = data.org as any, c = data.contact as any;
    setOf({ name: o?.name || "", tax_id: o?.tax_id || "", founded_on: o?.founded_on || "", website: o?.website || "", owner_name: o?.owner_name || "", wa_ddi: c?.ddi || "+55", wa_number: c?.number || "" });
  }, [data]);
  async function saveOrg() {
    setBusyO(true);
    try { await services.identity.organizations.updateMine({ name: of.name, tax_id: of.tax_id, founded_on: of.founded_on || null, website: of.website, owner_name: of.owner_name, wa_ddi: of.wa_ddi, wa_number: of.wa_number }); await reloadOrg(); flash(t("Dados da empresa salvos ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusyO(false); }
  }

  return (
    <div>
      <PageHead eyebrow={isClient ? "Portal do Cliente" : "Painel Admin"} title="Meus dados" sub={isClient ? "Seu perfil e os dados cadastrais da sua empresa." : "Seu perfil no portal."} />

      {/* Meu perfil */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>{t("Meu perfil")}</h3>
        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "14px 0 6px" }}>
          <button type="button" className="su-av su-av--btn" style={{ width: 68, height: 68, borderRadius: 18, fontSize: 24 }} disabled={avBusy} onClick={() => avInput.current?.click()} title={t("Trocar foto de perfil")}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.full_name || profile?.email)}
            <span className="su-av__cam"><Camera size={18} /></span>
          </button>
          <input ref={avInput} type="file" accept="image/*" hidden onChange={onAvatar} />
          <div className="mt">{t("Clique na foto para trocar.")}</div>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label="Nome completo"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Seu nome")} /></Field>
          <Field label="E-mail (login)"><input value={profile?.email || ""} disabled /></Field>
        </div>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginTop: 10 }} disabled={busyU} onClick={saveUser}><span className="crasto-btn__label">{busyU ? t("Salvando…") : t("Salvar")}</span></button>
      </div>

      {/* Dados da empresa */}
      {isClient && (
        <div className="card">
          <h3>{t("Dados da empresa")}</h3>
          {orgLoading ? <Empty>Carregando…</Empty> : (
            <>
              <div className="grid2" style={{ marginTop: 10 }}>
                <Field label="Nome da empresa"><input value={of.name} onChange={(e) => setOf({ ...of, name: e.target.value })} disabled={!isOwner} /></Field>
                <Field label="CNPJ"><input value={of.tax_id} onChange={(e) => setOf({ ...of, tax_id: e.target.value })} disabled={!isOwner} placeholder="00.000.000/0000-00" /></Field>
              </div>
              <div className="grid2">
                <Field label="Fundação da empresa"><input type="date" value={of.founded_on} onChange={(e) => setOf({ ...of, founded_on: e.target.value })} disabled={!isOwner} /></Field>
                <Field label="Website"><input value={of.website} onChange={(e) => setOf({ ...of, website: e.target.value })} disabled={!isOwner} placeholder="https://…" /></Field>
              </div>
              <div className="grid2">
                <Field label="Dono / Presidente"><input value={of.owner_name} onChange={(e) => setOf({ ...of, owner_name: e.target.value })} disabled={!isOwner} placeholder={t("Nome")} /></Field>
                <Field label="WhatsApp de contato">
                  <div style={{ display: "flex", gap: 8 }}>
                    <select value={of.wa_ddi} onChange={(e) => setOf({ ...of, wa_ddi: e.target.value })} disabled={!isOwner} style={{ width: 112, flex: "none" }}>{DIAL_CODES.map((d, i) => <option key={i} value={d.ddi}>{d.flag} {d.ddi}</option>)}</select>
                    <input style={{ flex: 1 }} value={of.wa_number} onChange={(e) => setOf({ ...of, wa_number: e.target.value })} disabled={!isOwner} placeholder={t("(11) 91234-5678")} />
                  </div>
                </Field>
              </div>
              {isOwner ? (
                <>
                  <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginTop: 10 }} disabled={busyO} onClick={saveOrg}><span className="crasto-btn__label">{busyO ? t("Salvando…") : t("Salvar dados da empresa")}</span></button>
                  <div className="note" style={{ marginTop: 12 }}><span>{t("O que você atualizar aqui também atualiza o seu cadastro na Crasto.AI.")}</span></div>
                </>
              ) : (
                <div className="note" style={{ marginTop: 12 }}><span>{t("Só o responsável (dono) da conta pode editar os dados da empresa.")}</span></div>
              )}
            </>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
