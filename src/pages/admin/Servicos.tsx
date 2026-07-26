import { useState } from "react";
import { Plus, Upload, Pencil, Trash2, Lock, Search, Filter, ChevronDown, X, Link2 } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, money, Field } from "../../ui/ui";
import { taxOf, fmtRate } from "../../lib/config";
import { useSettings } from "../../lib/settings";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

type S = { id: string; name: string; category: string | null; unit: string; price_table: number; price_min: number | null; price_max: number | null; base_commission: number; internal: boolean; notes: string | null; business_category?: string | null; cost_allocation?: string | null; usage_included?: number | null; usage_unit?: string | null; overage_price?: number | null; desconto_max?: number | null; variants_count?: number };
// Comissão-base começa em 10% (padrão novo do Crasto: 10%, podendo chegar a 30%).
const EMPTY = { id: "", name: "", category: "", unit: "mensal", price_table: "", price_min: "", price_max: "", base_commission: "10", internal: false, notes: "", business_category: "", cost_allocation: "absorvido", usage_included: "", usage_unit: "", overage_price: "", desconto_max: "" };
const BIZ_CATS = [{ v: "consultoria_ia", l: "Consultoria de IA" }, { v: "instalacao", l: "Instalação / implantação" }, { v: "saas_produto", l: "SaaS / produto" }, { v: "suporte", l: "Suporte" }, { v: "addon", l: "Add-on" }, { v: "outro", l: "Outro" }];

export default function Servicos() {
  const { taxRate } = useSettings();
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await api.catalog.services.list()) as unknown as S[], []);
  const allRows = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [query, setQuery] = useState("");
  const [fUnidade, setFUnidade] = useState("");
  const [fInterno, setFInterno] = useState("");
  const [fComissao, setFComissao] = useState("");
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [variants, setVariants] = useState<any[]>([]);
  const [vf, setVf] = useState({ nome: "", ai_model: "", price_table: "" });
  const editing = !!f.id;

  async function loadVariants(id: string) { try { setVariants((await api.catalog.services.variants(id)) as any[]); } catch { setVariants([]); } }
  async function addVariant() { if (!f.id || !vf.nome.trim()) return; await api.catalog.services.addVariant(f.id, { nome: vf.nome.trim(), ai_model: vf.ai_model || null, price_table: Number(vf.price_table) || 0 }); setVf({ nome: "", ai_model: "", price_table: "" }); loadVariants(f.id); }
  async function delVariant(vid: string) { await api.catalog.services.removeVariant(vid); loadVariants(f.id); }

  // Categorias vêm do próprio banco (serviços já cadastrados) — controlar/filtrar por elas.
  const cats = Array.from(new Set(allRows.map((r) => (r.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt"));
  const filtrosAtivos = !!(fUnidade || fInterno || fComissao);
  function limparFiltros() { setFUnidade(""); setFInterno(""); setFComissao(""); }
  const q = query.trim().toLowerCase();
  const rows = allRows.filter((r) =>
    (!catFilter || (r.category || "") === catFilter) &&
    (!fUnidade || r.unit === fUnidade) &&
    (!fInterno || (fInterno === "sim" ? r.internal : !r.internal)) &&
    (!fComissao || (fComissao === "com" ? r.base_commission > 0 : r.base_commission === 0)) &&
    (!q || `${r.name} ${r.category || ""} ${r.notes || ""}`.toLowerCase().includes(q)));

  function openNew() { setF({ ...EMPTY }); setVariants([]); setErr(""); setOpen(true); }
  function openEdit(s: S) { setF({ id: s.id, name: s.name, category: s.category ?? "", unit: s.unit, price_table: String(s.price_table), price_min: s.price_min != null ? String(s.price_min) : "", price_max: s.price_max != null ? String(s.price_max) : "", base_commission: String(s.base_commission), internal: !!s.internal, notes: s.notes ?? "", business_category: s.business_category ?? "", cost_allocation: s.cost_allocation ?? "absorvido", usage_included: s.usage_included != null ? String(s.usage_included) : "", usage_unit: s.usage_unit ?? "", overage_price: s.overage_price != null ? String(s.overage_price) : "", desconto_max: s.desconto_max != null ? String(s.desconto_max) : "" }); setVariants([]); loadVariants(s.id); setErr(""); setOpen(true); }

  async function submit() {
    if (!f.name.trim()) { setErr(t("Informe o nome do serviço.")); return; }
    setBusy(true); setErr("");
    const price = Number(f.price_table) || 0;
    const payload = {
      name: f.name.trim(), category: f.category || null, unit: f.unit,
      price_table: price,
      price_min: f.price_min !== "" ? Number(f.price_min) : price,
      price_max: f.price_max !== "" ? Number(f.price_max) : price,
      base_commission: Number(f.base_commission) || 0,
      internal: !!f.internal, notes: f.notes || null,
      business_category: f.business_category || null,
      cost_allocation: f.cost_allocation || "absorvido",
      usage_included: f.usage_included !== "" ? Number(f.usage_included) : null,
      usage_unit: f.usage_unit || null,
      overage_price: f.overage_price !== "" ? Number(f.overage_price) : null,
      desconto_max: f.desconto_max !== "" ? Number(f.desconto_max) : null,
    };
    try {
      if (editing) await api.catalog.services.update(f.id, payload);
      else await api.catalog.services.create(payload);
      setOpen(false); reload();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function del(s: S) {
    if (!confirm(t("Excluir o serviço \"{n}\"?", { n: s.name }))) return;
    try { await api.catalog.services.remove(s.id); reload(); }
    catch { setToast(t("Não foi possível excluir.")); setTimeout(() => setToast(""), 5000); }
  }

  const range = (r: S) => (r.price_min != null && r.price_max != null && r.price_min !== r.price_max) ? `${money(r.price_min)}–${money(r.price_max)}` : null;

  return (
    <div className="svcpage">
      <PageHead eyebrow="Painel Admin" title="Catálogo de serviços" sub="Base oficial de preços da Crasto.AI. Preço-âncora + faixa (mín–máx); imposto padrão exibido à parte."
        right={<><button className="crasto-btn crasto-btn--secondary crasto-btn--sm"><span className="crasto-btn__icon"><Upload size={15} /></span><span className="crasto-btn__label">{t("Importar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{t("Novo serviço")}</span></button></>} />
      {!loading && cats.length > 0 && (
        <div className="svc-filter">
          <button className={"cattab" + (!catFilter ? " is-active" : "")} onClick={() => setCatFilter("")}>{t("Todas")}<span className="cnt">{allRows.length}</span></button>
          {cats.map((c) => (
            <button key={c} className={"cattab" + (catFilter === c ? " is-active" : "")} onClick={() => setCatFilter(c)}>{c}<span className="cnt">{allRows.filter((r) => (r.category || "") === c).length}</span></button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "4px 0 14px" }}>
        <div style={{ position: "relative" }}>
          <button className="chip" onClick={() => setFiltrosOpen((o) => !o)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid " + (filtrosAtivos ? "transparent" : "var(--crasto-border-soft)"), background: filtrosAtivos ? "var(--crasto-navy-05)" : "transparent", color: "var(--crasto-text-body)" }}>
            <Filter size={13} />{t("Filtros")}<ChevronDown size={12} />
          </button>
          {filtrosOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, background: "var(--crasto-surface)", border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-md)", boxShadow: "var(--crasto-shadow-md)", padding: 14, width: 260 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><b style={{ fontSize: 13 }}>{t("Filtros")}</b><button className="icobtn" onClick={() => setFiltrosOpen(false)}><X size={14} /></button></div>
              <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginBottom: 4 }}>{t("Unidade")}</div>
              <select className="inp" style={{ width: "100%", boxSizing: "border-box" }} value={fUnidade} onChange={(e) => setFUnidade(e.target.value)}>
                <option value="">{t("Todas")}</option><option value="mensal">{t("Mensal")}</option><option value="hora">{t("Hora")}</option><option value="projeto">{t("Projeto")}</option><option value="setup_unico">{t("Setup único")}</option>
              </select>
              <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", margin: "12px 0 4px" }}>{t("Comissão")}</div>
              <select className="inp" style={{ width: "100%", boxSizing: "border-box" }} value={fComissao} onChange={(e) => setFComissao(e.target.value)}>
                <option value="">{t("Todas")}</option><option value="com">{t("Com comissão")}</option><option value="sem">{t("Sem comissão")}</option>
              </select>
              <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", margin: "12px 0 4px" }}>{t("Origem")}</div>
              <select className="inp" style={{ width: "100%", boxSizing: "border-box" }} value={fInterno} onChange={(e) => setFInterno(e.target.value)}>
                <option value="">{t("Todos")}</option><option value="nao">{t("Próprio (cliente vê)")}</option><option value="sim">{t("Interno (remix VdI)")}</option>
              </select>
              <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" style={{ marginTop: 12 }} onClick={limparFiltros}><span className="crasto-btn__label">{t("Limpar filtros")}</span></button>
            </div>
          )}
        </div>
        {filtrosAtivos && <button className="chip" onClick={limparFiltros} style={{ cursor: "pointer", border: "none", color: "var(--crasto-blue)" }}>{t("Limpar filtros")}</button>}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 10, color: "var(--crasto-text-faint)" }} />
          <input className="inp" style={{ paddingLeft: 34, minWidth: 220 }} placeholder={t("Buscar serviço…")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>{catFilter || filtrosAtivos || q ? t("Nenhum serviço com esses filtros.") : t("Nenhum serviço.")}</strong> {catFilter || filtrosAtivos || q ? t("Ajuste ou limpe os filtros.") : t("Clique em \"Novo serviço\".")}</p></Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Serviço")}</th><th>{t("Categoria")}</th><th>{t("Unidade")}</th><th>{t("Preço-âncora")}</th><th>{t("Faixa")}</th><th title={t("Vinculado à configuração global de imposto")}>{t("Imposto")} ({fmtRate(taxRate)}%) <Link2 size={11} style={{ verticalAlign: -1, opacity: 0.55 }} /></th><th>{t("Líquido")}</th><th>{t("Comissão")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const imp = taxOf(r.price_table, taxRate);
                return (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openEdit(r)} title={t("Clique para editar")}>
                    <td style={{ fontWeight: 600, color: "var(--crasto-text-primary)" }}>{r.name}{r.internal && <Lock size={12} title={t("Interno (remix VdI)")} style={{ verticalAlign: -1, marginLeft: 6, color: "var(--crasto-text-muted)" }} />}</td>
                    <td><span className="chip">{r.category}</span>{(r.variants_count ?? 0) > 0 && <span className="chip" style={{ marginLeft: 4, background: "#EEEDFE", color: "#26215C" }} title={t("Variações por inteligência")}>{r.variants_count} var.</span>}</td>
                    <td>{r.unit.replace("_", " ")}</td>
                    <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{money(r.price_table)}</td>
                    <td className="tnum" style={{ color: "var(--crasto-text-muted)", fontSize: 12 }}>{range(r) || "—"}</td>
                    <td className="tnum" style={{ color: "var(--crasto-danger)" }}>{money(imp)}</td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-success)" }}>{money(r.price_table - imp)}</td>
                    <td className="tnum">{r.base_commission}%</td>
                    <td onClick={(e) => e.stopPropagation()}><div style={{ display: "flex", gap: 6 }}><button className="icobtn" title={t("Editar")} onClick={() => openEdit(r)}><Pencil size={14} /></button><button className="icobtn" title={t("Excluir")} onClick={() => del(r)}><Trash2 size={14} /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* legenda: campos vinculados + o que é alocação de custo */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontSize: 11.5, color: "var(--crasto-text-muted)" }}>
        <span><Link2 size={12} style={{ verticalAlign: -2, marginRight: 4, opacity: 0.6 }} />{t("campo com este ícone puxa valor de outra config (ex.: imposto vem da config global)")}</span>
        <span><b style={{ color: "var(--crasto-text-body)" }}>{t("Crasto absorve")}</b> = {t("a Crasto.AI paga o custo de IA desse item")}</span>
        <span><b style={{ color: "var(--crasto-text-body)" }}>{t("Cliente paga (BYO)")}</b> = {t("o cliente usa a própria conta/API (ex.: WhatsApp) e arca com o custo")}</span>
      </div>
      <Modal wide title={editing ? t("Editar serviço") : t("Novo serviço")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}

        {/* Identificação */}
        <div className="svc-sec-label">{t("Identificação")}</div>
        <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("Ex.: Implantação WhatsApp CRM")} /></Field>
        <div className="svc-grid2">
          <Field label="Categoria">
            {/* Combobox: clique na seta abre as categorias já cadastradas; ou digite uma nova. */}
            <input list="svc-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder={t("Escolha na seta ou digite uma nova…")} autoComplete="off" />
            <datalist id="svc-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Unidade"><select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option value="mensal">{t("Mensal")}</option><option value="hora">{t("Hora")}</option><option value="projeto">{t("Projeto")}</option><option value="setup_unico">{t("Setup único")}</option></select></Field>
        </div>

        {/* Preços & faixa */}
        <div className="svc-sec-label">{t("Preços & faixa")}</div>
        <div className="svc-grid3">
          <Field label="Preço-âncora (R$)"><input type="number" value={f.price_table} onChange={(e) => setF({ ...f, price_table: e.target.value })} placeholder="0" /></Field>
          <Field label="Preço mínimo (R$)"><input type="number" value={f.price_min} onChange={(e) => setF({ ...f, price_min: e.target.value })} placeholder={t("= âncora se vazio")} /></Field>
          <Field label="Preço máximo (R$)"><input type="number" value={f.price_max} onChange={(e) => setF({ ...f, price_max: e.target.value })} placeholder={t("= âncora se vazio")} /></Field>
        </div>
        {f.price_table !== "" && <div className="note" style={{ marginTop: 2 }}><span><Link2 size={12} style={{ verticalAlign: -2, opacity: 0.6, marginRight: 4 }} title={t("Taxa vinculada à configuração global de imposto")} />{t("Imposto")} ({fmtRate(taxRate)}%): <b>{money(taxOf(Number(f.price_table), taxRate))}</b> · {t("Líquido")}: <b>{money((Number(f.price_table) || 0) - taxOf(Number(f.price_table), taxRate))}</b> <span style={{ opacity: 0.7 }}>· {t("a taxa vem da config global (🔗)")}</span></span></div>}

        {/* Negócio, uso & custo */}
        <div className="svc-sec-label">{t("Negócio, uso & custo")}</div>
        <div className="svc-grid2">
          <Field label="Categoria de negócio"><select value={f.business_category} onChange={(e) => setF({ ...f, business_category: e.target.value })}><option value="">{t("—")}</option>{BIZ_CATS.map((b) => <option key={b.v} value={b.v}>{t(b.l)}</option>)}</select></Field>
          <Field label="Custo de IA (padrão)"><select value={f.cost_allocation} onChange={(e) => setF({ ...f, cost_allocation: e.target.value })}><option value="absorvido">{t("Crasto absorve")}</option><option value="byo_cliente">{t("Cliente paga (conta própria)")}</option></select><span className="svc-hint">{t("padrão; ajustável por cliente no detalhe")}</span></Field>
        </div>
        <div className="svc-grid3">
          <Field label="Franquia incluída"><input type="number" value={f.usage_included} onChange={(e) => setF({ ...f, usage_included: e.target.value })} placeholder={t("ex.: 1000")} /></Field>
          <Field label="Unidade de uso"><input value={f.usage_unit} onChange={(e) => setF({ ...f, usage_unit: e.target.value })} placeholder={t("ex.: mensagens")} /></Field>
          <Field label="Excedente (R$/un.)"><input type="number" value={f.overage_price} onChange={(e) => setF({ ...f, overage_price: e.target.value })} placeholder="0" /></Field>
        </div>
        <Field label="Desconto máximo do serviço (%)"><input type="number" value={f.desconto_max} onChange={(e) => setF({ ...f, desconto_max: e.target.value })} placeholder={t("vazio = teto global (10% livre / 50% com aprovação do Crasto)")} /></Field>

        {/* Variações por inteligência */}
        <div className="svc-sec-label">{t("Variações por inteligência")}</div>
        {!editing ? <div className="note"><span>{t("Salve o serviço primeiro para adicionar variações por modelo de IA.")}</span></div> : (<>
          {variants.map((v) => (
            <div className="crmrow" key={v.id}>
              <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{v.nome} {v.ai_model && <span className="chip" style={{ marginLeft: 6 }}>{v.ai_model}</span>}</div></div>
              <div className="tnum" style={{ fontWeight: 600 }}>{money(v.price_table)}</div>
              <button className="icobtn" title={t("Excluir variação")} onClick={() => delVariant(v.id)}><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="addrow">
            <input placeholder={t("Nome (ex.: Avançado)")} value={vf.nome} onChange={(e) => setVf({ ...vf, nome: e.target.value })} style={{ flex: 1, minWidth: 110 }} />
            <input placeholder={t("Modelo de IA (ex.: Sonnet 5)")} value={vf.ai_model} onChange={(e) => setVf({ ...vf, ai_model: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
            <input type="number" placeholder={t("Preço R$")} value={vf.price_table} onChange={(e) => setVf({ ...vf, price_table: e.target.value })} style={{ width: 100 }} />
            <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={addVariant}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Adicionar")}</span></button>
          </div>
        </>)}

        {/* Comissão & observações */}
        <div className="svc-sec-label">{t("Comissão & observações")}</div>
        <div className="svc-grid2">
          <Field label="Comissão-base (%)"><input type="number" value={f.base_commission} onChange={(e) => setF({ ...f, base_commission: e.target.value })} placeholder="10" /><span className="svc-hint">{t("Padrão 10% · até 30%")}</span></Field>
          <label className="frow svc-internal" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={f.internal} onChange={(e) => setF({ ...f, internal: e.target.checked })} style={{ width: "auto" }} />
            <span style={{ margin: 0 }}>{t("🔒 Interno (remix do Viver de IA — o cliente nunca vê a origem)")}</span>
          </label>
        </div>
        <Field label="Notas (opcional)"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} placeholder={t("Observações internas (ex.: fora do horário comercial R$ 650/h; inclui trabalho de bastidores de skills/contexto que consome tokens da Crasto.AI).")} /></Field>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
