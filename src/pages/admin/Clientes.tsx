import { useMemo, useState } from "react";
import { UserPlus, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { services as api, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, money, initials, Field, Pill } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { useT } from "../../lib/i18n";
import { fetchClients, timeAgo } from "../../lib/adminData";
import { COUNTRIES, countryOf, STAGES, stageOf, DIAL_CODES } from "../../lib/countries";

const EMPTY = { name: "", stage: "prospecto", country: "BR", tax_id: "", founded_on: "", website: "", owner_name: "", whatsapp: "", ddi: "+55", plan: "", email: "", contact_name: "" };

export default function Clientes() {
  const t = useT();
  const { data, loading, reload } = useAsync(fetchClients, []);
  const all = data ?? [];
  const [tab, setTab] = useState<string>("todos");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: all.length };
    STAGES.forEach((s) => (c[s.key] = all.filter((x) => x.stage === s.key).length));
    return c;
  }, [all]);

  const rows = all.filter((c) => (tab === "todos" || c.stage === tab) &&
    (!query || [c.name, c.tax_id, c.email, c.owner_name].some((v) => (v || "").toLowerCase().includes(query.toLowerCase()))));

  async function submit() {
    if (!f.name.trim()) { setErr(t("Informe o nome da empresa.")); return; }
    setBusy(true); setErr("");
    const co = countryOf(f.country);
    let org: { id: string; name: string };
    try {
      org = await api.identity.organizations.create({
        name: f.name.trim(), stage: f.stage, country: f.country, tax_id: f.tax_id || null, tax_id_type: co.idType,
        founded_on: f.founded_on || null, website: f.website || null, owner_name: f.owner_name || null, plan: f.plan || null,
      });
    } catch (e) { setErr(t("Erro ao criar:") + " " + errorMessage(e)); setBusy(false); return; }
    if (f.whatsapp.trim()) {
      try { await api.crm.phones.add({ organization_id: org.id, label: "WhatsApp", country_code: f.ddi, number: f.whatsapp.trim(), is_primary: true }); } catch { /* telefone é opcional — não bloqueia */ }
    }
    let msg = t("\"{n}\" cadastrado como {s}.", { n: f.name, s: t(stageOf(f.stage).label) });
    if (f.email.trim()) {
      // Sem senha: nem o admin define nem vê a senha do cliente. Vai um link e ele escolhe a dele.
      const r = await api.identity.users.create({ email: f.email.trim(), full_name: f.contact_name || f.owner_name || f.name, organization_id: org.id, role: "client_owner" });
      if (!r.ok) msg += " " + t("(login não criado: {e})", { e: r.error || "erro" });
      else if (r.email_sent) msg += "  " + t("✉️ Convite enviado para {e} — ele define a própria senha.", { e: r.email ?? f.email.trim() });
      else msg += "  " + t("(convite não enviado: {err})", { err: r.email_error || "erro" });
    }
    setBusy(false); setOpen(false); setF({ ...EMPTY }); setToast(msg); setTimeout(() => setToast(""), 16000); reload();
  }

  const co = countryOf(f.country);
  const nav = useNavigate();

  return (
    <div className="crmpage">
      <PageHead eyebrow="Painel Admin · CRM" title="Contatos & Clientes" sub="Pipeline: prospecto → lead → oportunidade → cliente."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { setF({ ...EMPTY }); setErr(""); setOpen(true); }}><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">{t("Novo contato")}</span></button>} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {[{ key: "todos", label: "Todos" }, ...STAGES].map((s) => (
          <button key={s.key} className={"stagetab" + (tab === s.key ? " on" : "")} onClick={() => setTab(s.key)}>{t(s.label)} <b>{counts[s.key] ?? 0}</b></button>
        ))}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 10, color: "var(--crasto-text-faint)" }} />
          <input className="inp" style={{ paddingLeft: 34, minWidth: 240 }} placeholder={t("Buscar por nome, identidade, e-mail…")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>{t("Nada por aqui.")}</strong> {t("Clique em \"Novo contato\" para começar o pipeline.")}</p></Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Empresa")}</th><th>{t("Status")}</th><th>{t("País")}</th><th>{t("Identidade")}</th><th>{t("Últ. atividade")}</th><th>{t("MRR")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const st = stageOf(c.stage); const country = countryOf(c.country);
                return (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => nav(`/admin/cliente/${c.id}`)}>
                    <td><div className="cust"><div className="logo">{initials(c.name)}</div><div><div className="nm">{c.name}</div><div className="em">{c.owner_name || c.email || "—"}</div></div></div></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Pill tone={st.tone}>{t(st.label)}</Pill>
                        {c.source === "mapa_site" && <span className="chip" style={{ background: "var(--crasto-navy-05)", color: "var(--crasto-text-primary)" }} title={t("Veio do diagnóstico do site")}>Mapa</span>}
                        {c.last_maturity != null && <span className="chip" title={t("Maturidade do diagnóstico")}>{c.last_maturity}/100</span>}
                        {c.intent_signal === "alto" && <span className="chip" style={{ background: "#FCE9E7", color: "#B42318" }} title={t("Sinal de intenção")}>🔥</span>}
                      </div>
                    </td>
                    <td>{country.flag} {country.code}</td>
                    <td className="tnum" style={{ color: "var(--crasto-text-body)" }}>{c.tax_id || "—"}</td>
                    <td style={{ color: "var(--crasto-text-muted)" }}>{c.last_activity ? timeAgo(c.last_activity) : (c.last_access ? timeAgo(c.last_access) : "—")}</td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-text-primary)" }}>{money(c.mrr)}</td>
                    <td><Link className="sec-h link" to={`/admin/cliente/${c.id}`} onClick={(e) => e.stopPropagation()}>{t("Ver detalhe")}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={t("Novo contato / empresa")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Cadastrar")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Status no pipeline"><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>{STAGES.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}</select></Field>
          <Field label="País"><select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value, ddi: countryOf(e.target.value).ddi })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select></Field>
        </div>
        <Field label="Nome da empresa *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("Ex.: Connect Solar Ltda")} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={co.idLabel}><input value={f.tax_id} onChange={(e) => setF({ ...f, tax_id: e.target.value })} placeholder={co.idLabel} /></Field>
          <Field label="Fundação da empresa"><input type="date" value={f.founded_on} onChange={(e) => setF({ ...f, founded_on: e.target.value })} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Dono / Presidente"><input value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} placeholder={t("Nome")} /></Field>
          <Field label="Website"><input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://…" /></Field>
        </div>
        <Field label="WhatsApp do cliente">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={f.ddi} onChange={(e) => setF({ ...f, ddi: e.target.value })} style={{ width: 116, flex: "none" }}>
              {DIAL_CODES.map((d, i) => <option key={i} value={d.ddi}>{d.flag} {d.ddi}</option>)}
            </select>
            <input style={{ flex: 1 }} value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder={t("(11) 91234-5678")} />
          </div>
        </Field>
        <div style={{ borderTop: "1px solid var(--crasto-border-soft)", margin: "8px 0 12px", paddingTop: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--crasto-text-muted)", marginBottom: 8 }}>{t("Acesso ao portal (opcional)")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="E-mail do responsável"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={t("cria login se preenchido")} /></Field>
            <Field label="Nome do responsável"><input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} placeholder={t("Nome")} /></Field>
          </div>
          <div className="note" style={{ marginTop: 4 }}><span>{t("Ao cadastrar com e-mail, o cliente recebe automaticamente um e-mail de boas-vindas da Crasto.AI com o link do portal e os dados de acesso.")}</span></div>
        </div>
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
