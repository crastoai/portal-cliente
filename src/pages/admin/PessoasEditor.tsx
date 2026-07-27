// ============================================================================
// PessoasEditor — editor de CONTATOS da empresa (compartilhado por Lead e Cliente).
// Persona/CRM completo p/ avatar de campanhas: nome, cargo, função, nascimento,
// gênero (M/F), orientação, estado civil, filhos, interesses; e-mail e telefone
// TRABALHO + PESSOAL; redes sociais (várias); e FAMILIARES (parentesco/sexo/idade).
// Contato principal + "Adicionar contato secundário". Grava via crm.people /
// crm.phones / crm.family (migração 023). Escopo por org via RLS.
// ============================================================================
import { useState } from "react";
import { Plus, Pencil, Trash2, Save, X, Phone as PhoneIcon, Users2 } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, Empty, initials, prettyName, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { DIAL_CODES } from "../../lib/countries";

const EMPTY = { full_name: "", role: "", funcao: "", email: "", email_pessoal: "", birthday: "", is_primary: false,
  genero: "", orientacao: "", estado_civil: "", tem_filhos: "", num_filhos: "", interesses: "", disc_tipo: "", notes: "",
  socials: [] as { rede: string; handle: string }[] };

function age(b?: string | null): number | null {
  if (!b) return null;
  const d = new Date(b); if (isNaN(+d)) return null;
  const n = new Date(); let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}
const ECIVIL = [["", "—"], ["solteiro", "Solteiro(a)"], ["casado", "Casado(a)"], ["uniao", "União estável"], ["divorciado", "Divorciado(a)"], ["viuvo", "Viúvo(a)"]];
const RELACAO = [["conjuge", "Cônjuge"], ["filho", "Filho(a)"], ["pai", "Pai/Mãe"], ["socio", "Sócio(a)"], ["outro", "Outro"]];

export default function PessoasEditor({ orgId }: { orgId: string }) {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [people, phones, fam] = await Promise.all([
      api.crm.people.listByOrg(orgId).catch(() => []),
      api.crm.phones.listByOrg(orgId).catch(() => []),
      api.crm.family.listByOrg(orgId).catch(() => []),
    ]);
    return { people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], fam: (fam as any[]) ?? [] };
  }, [orgId]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };

  const people = data?.people ?? [];
  const phones = data?.phones ?? [];
  const famBy = (pid: string) => (data?.fam ?? []).filter((x) => x.person_id === pid);
  const phonesBy = (pid: string) => phones.filter((x) => x.person_id === pid);

  function startEdit(p: any) {
    setAdding(false); setOpenId(p.id);
    setF({ full_name: p.full_name || "", role: p.role || "", funcao: p.funcao || "", email: p.email || "", email_pessoal: p.email_pessoal || "",
      birthday: p.birthday ? String(p.birthday).slice(0, 10) : "", is_primary: !!p.is_primary, genero: p.genero || "", orientacao: p.orientacao || "",
      estado_civil: p.estado_civil || "", tem_filhos: p.tem_filhos === true ? "sim" : p.tem_filhos === false ? "nao" : "", num_filhos: p.num_filhos ?? "",
      interesses: p.interesses || "", disc_tipo: p.disc_tipo || "", notes: p.notes || "", socials: Array.isArray(p.socials) ? p.socials : [] });
  }
  function startAdd() { setAdding(true); setOpenId(null); setF({ ...EMPTY, is_primary: people.length === 0 }); }
  function close() { setAdding(false); setOpenId(null); }

  function payload() {
    return {
      full_name: f.full_name.trim(), role: f.role || null, funcao: f.funcao || null, email: f.email || null, email_pessoal: f.email_pessoal || null,
      birthday: f.birthday || null, is_primary: !!f.is_primary, genero: f.genero || null, orientacao: f.orientacao || null,
      estado_civil: f.estado_civil || null, tem_filhos: f.tem_filhos === "sim" ? true : f.tem_filhos === "nao" ? false : null,
      num_filhos: f.num_filhos === "" ? null : Number(f.num_filhos), interesses: f.interesses || null, disc_tipo: f.disc_tipo || null,
      notes: f.notes || null, socials: JSON.stringify((f.socials || []).filter((s: any) => s.rede || s.handle)),
    };
  }
  async function save() {
    if (!f.full_name.trim()) { flash(t("Informe o nome do contato.")); return; }
    setBusy(true);
    try {
      if (adding) await api.crm.people.add({ organization_id: orgId, ...payload() });
      else if (openId) await api.crm.people.update(openId, payload());
      flash(t("Contato salvo ✓")); close(); await reload();
    } catch { flash(t("Erro ao salvar o contato.")); } finally { setBusy(false); }
  }
  async function delPerson(id: string) { if (!confirm(t("Remover este contato?"))) return; await api.crm.removeRow("people", id); await reload(); }

  // familiares / telefones / redes (ações imediatas)
  const [fam, setFam] = useState({ name: "", relation: "filho", sex: "", birthday: "" });
  async function addFam(personId: string) {
    if (!fam.name.trim()) return;
    await api.crm.family.add({ organization_id: orgId, person_id: personId, name: fam.name.trim(), relation: fam.relation, sex: fam.sex || null, birthday: fam.birthday || null });
    setFam({ name: "", relation: "filho", sex: "", birthday: "" }); await reload();
  }
  async function delFam(id: string) { await api.crm.family.remove(id); await reload(); }

  const [ph, setPh] = useState({ label: "trabalho", country_code: "+55", number: "" });
  async function addPhone(personId: string) {
    if (!ph.number.trim()) return;
    await api.crm.phones.add({ organization_id: orgId, person_id: personId, label: ph.label, country_code: ph.country_code, number: ph.number.trim() });
    setPh({ label: "trabalho", country_code: "+55", number: "" }); await reload();
  }
  async function delPhone(id: string) { await api.crm.removeRow("phones", id); await reload(); }

  const setSocial = (i: number, k: string, v: string) => setF((s: any) => ({ ...s, socials: s.socials.map((x: any, j: number) => j === i ? { ...x, [k]: v } : x) }));
  const addSocial = () => setF((s: any) => ({ ...s, socials: [...(s.socials || []), { rede: "Instagram", handle: "" }] }));
  const rmSocial = (i: number) => setF((s: any) => ({ ...s, socials: s.socials.filter((_: any, j: number) => j !== i) }));

  const form = (
    <div className="card" style={{ background: "var(--crasto-bg-2)", marginTop: 10, padding: 16 }}>
      <div className="grid2">
        <Field label="Nome completo *"><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder={t("Nome e sobrenome")} /></Field>
        <Field label="Cargo"><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder={t("ex.: Sócio Diretor")} /></Field>
        <Field label="Função"><input value={f.funcao} onChange={(e) => setF({ ...f, funcao: e.target.value })} placeholder={t("ex.: decisor")} /></Field>
        <Field label="Data de nascimento 🎂"><input type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></Field>
        <Field label="Gênero (nascimento)"><select value={f.genero} onChange={(e) => setF({ ...f, genero: e.target.value })}><option value="">{t("—")}</option><option value="M">{t("Masculino")}</option><option value="F">{t("Feminino")}</option></select></Field>
        <Field label="Preferência sexual"><select value={f.orientacao} onChange={(e) => setF({ ...f, orientacao: e.target.value })}><option value="">{t("—")}</option><option value="hetero">{t("Heterossexual")}</option><option value="homo">{t("Homossexual")}</option></select></Field>
        <Field label="Estado civil"><select value={f.estado_civil} onChange={(e) => setF({ ...f, estado_civil: e.target.value })}>{ECIVIL.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></Field>
        <Field label="Filhos"><div style={{ display: "flex", gap: 8 }}><select value={f.tem_filhos} onChange={(e) => setF({ ...f, tem_filhos: e.target.value })} style={{ flex: 1 }}><option value="">{t("—")}</option><option value="sim">{t("Tem")}</option><option value="nao">{t("Não tem")}</option></select>{f.tem_filhos === "sim" && <input type="number" min="0" value={f.num_filhos} onChange={(e) => setF({ ...f, num_filhos: e.target.value })} placeholder={t("qtde")} style={{ width: 80 }} />}</div></Field>
        <Field label="DISC"><select value={f.disc_tipo} onChange={(e) => setF({ ...f, disc_tipo: e.target.value })}><option value="">{t("—")}</option><option value="D">D — Dominância</option><option value="I">I — Influência</option><option value="S">S — Estabilidade</option><option value="C">C — Conformidade</option></select></Field>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <Field label="E-mail (trabalho)"><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nome@empresa.com" /></Field>
        <Field label="E-mail (pessoal)"><input value={f.email_pessoal} onChange={(e) => setF({ ...f, email_pessoal: e.target.value })} placeholder={t("p/ não perder o contato se trocar de empresa")} /></Field>
      </div>

      <Field label="Interesses / hobby / time (CRM)"><input value={f.interesses} onChange={(e) => setF({ ...f, interesses: e.target.value })} placeholder={t("ex.: São Paulo FC, corrida, vinhos…")} /></Field>

      <div style={{ marginTop: 10 }}>
        <div className="mt" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{t("Redes sociais")}</div>
        {(f.socials || []).map((s: any, i: number) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <select value={s.rede} onChange={(e) => setSocial(i, "rede", e.target.value)} style={{ width: 150 }}><option>Instagram</option><option>LinkedIn</option><option>Facebook</option><option>X / Twitter</option><option>TikTok</option><option>YouTube</option></select>
            <input value={s.handle} onChange={(e) => setSocial(i, "handle", e.target.value)} placeholder={t("@usuário ou link")} style={{ flex: 1 }} />
            <button className="icobtn rm" onClick={() => rmSocial(i)}><X size={14} /></button>
          </div>
        ))}
        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={addSocial}><span className="crasto-btn__label">{t("+ rede social")}</span></button>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} style={{ width: "auto" }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t("Contato principal")}</span>
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__icon"><Save size={14} /></span><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar contato")}</span></button>
        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={close}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
      </div>
    </div>
  );

  return (
    <div>
      {loading ? <Empty>Carregando…</Empty> : (
        <>
          {people.length === 0 && !adding ? <div className="mt" style={{ padding: "4px 2px" }}>{t("Nenhum contato ainda.")}</div> : null}
          {people.map((p) => {
            const nm = prettyName(p.full_name);
            const isOpen = openId === p.id;
            const fs = famBy(p.id);
            const phs = phonesBy(p.id);
            return (
              <div className="card" style={{ marginBottom: 10, padding: 14 }} key={p.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="logo" style={{ width: 38, height: 38, borderRadius: 10, background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{initials(nm)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{nm}
                      {p.is_primary ? <span className="chip" style={{ marginLeft: 6, background: "var(--crasto-navy-05)", color: "var(--crasto-text-primary)" }}>{t("principal")}</span> : <span className="chip" style={{ marginLeft: 6 }}>{t("secundário")}</span>}
                      {p.disc_tipo && <span className="chip" style={{ marginLeft: 6, background: "#EEEDFE", color: "#26215C" }}>DISC {p.disc_tipo}</span>}
                    </div>
                    <div style={{ color: "var(--crasto-text-primary)", fontSize: 13 }}>{[p.role, p.email].filter(Boolean).join("  ·  ") || "—"}
                      {p.birthday ? `  ·  🎂 ${new Date(p.birthday).toLocaleDateString("pt-BR")}` : ""}
                      {p.estado_civil ? `  ·  ${t((ECIVIL.find(([v]) => v === p.estado_civil) || ["", ""])[1])}` : ""}
                      {p.genero ? `  ·  ${p.genero === "M" ? "♂" : "♀"}` : ""}</div>
                  </div>
                  <button className="icobtn" title={t("Editar")} onClick={() => (isOpen ? close() : startEdit(p))}><Pencil size={14} /></button>
                  <button className="icobtn rm" title={t("Remover")} onClick={() => delPerson(p.id)}><Trash2 size={14} /></button>
                </div>

                {/* telefones do contato (trabalho/pessoal) */}
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {phs.map((x) => (
                    <span key={x.id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <PhoneIcon size={12} /> <b style={{ fontWeight: 600 }}>{t(x.label || "tel")}</b> <span className="tnum">{x.country_code} {x.number}</span>
                      <button className="icobtn rm" style={{ width: 18, height: 18 }} onClick={() => delPhone(x.id)}><X size={11} /></button>
                    </span>
                  ))}
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <select value={ph.label} onChange={(e) => setPh({ ...ph, label: e.target.value })} style={{ width: 110 }}><option value="trabalho">{t("Trabalho")}</option><option value="pessoal">{t("Pessoal")}</option><option value="whatsapp">WhatsApp</option></select>
                    <select value={ph.country_code} onChange={(e) => setPh({ ...ph, country_code: e.target.value })} style={{ width: 92 }}>{DIAL_CODES.map((d, i) => <option key={i} value={d.ddi}>{d.flag} {d.ddi}</option>)}</select>
                    <input value={ph.number} onChange={(e) => setPh({ ...ph, number: e.target.value })} placeholder={t("Número")} style={{ width: 130 }} />
                    <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => addPhone(p.id)}><span className="crasto-btn__label">{t("+ telefone")}</span></button>
                  </span>
                </div>

                {/* familiares */}
                <div style={{ marginTop: 12, borderTop: "1px dashed var(--crasto-border-soft)", paddingTop: 10 }}>
                  <div className="mt" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}><Users2 size={13} /> {t("Familiares")}</div>
                  {fs.map((m) => { const a = age(m.birthday); return (
                    <div className="crmrow" key={m.id} style={{ padding: "6px 0" }}>
                      <span className="chip">{t((RELACAO.find(([v]) => v === m.relation) || ["", m.relation])[1])}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><div className="nm" style={{ fontSize: 13.5 }}>{m.name}{m.sex ? ` ${m.sex === "M" ? "♂" : "♀"}` : ""}</div>
                        <div className="mt">{m.birthday ? new Date(m.birthday).toLocaleDateString("pt-BR") : "—"}{a != null ? ` · ${a} anos` : ""}</div></div>
                      <button className="icobtn rm" onClick={() => delFam(m.id)}><Trash2 size={13} /></button>
                    </div>
                  ); })}
                  <div className="addrow" style={{ marginTop: 6 }}>
                    <input value={fam.name} onChange={(e) => setFam({ ...fam, name: e.target.value })} placeholder={t("Nome do familiar")} style={{ flex: 2, minWidth: 130 }} />
                    <select value={fam.relation} onChange={(e) => setFam({ ...fam, relation: e.target.value })}>{RELACAO.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
                    <select value={fam.sex} onChange={(e) => setFam({ ...fam, sex: e.target.value })} title={t("Sexo")}><option value="">{t("Sexo")}</option><option value="M">♂ {t("Masc.")}</option><option value="F">♀ {t("Fem.")}</option></select>
                    <input type="date" value={fam.birthday} onChange={(e) => setFam({ ...fam, birthday: e.target.value })} title={t("Nascimento")} />
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => addFam(p.id)}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Adicionar")}</span></button>
                  </div>
                </div>

                {isOpen && form}
              </div>
            );
          })}

          {adding ? form : <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" style={{ marginTop: 4 }} onClick={startAdd}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{people.length === 0 ? t("Adicionar contato") : t("Adicionar contato secundário")}</span></button>}
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
