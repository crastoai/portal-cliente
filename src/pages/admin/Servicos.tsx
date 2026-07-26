import { useState } from "react";
import { Plus, Upload, Pencil, Trash2, Lock } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, money, Field } from "../../ui/ui";
import { taxOf, fmtRate } from "../../lib/config";
import { useSettings } from "../../lib/settings";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

type S = { id: string; name: string; category: string | null; unit: string; price_table: number; price_min: number | null; price_max: number | null; base_commission: number; internal: boolean; notes: string | null };
// Comissão-base começa em 10% (padrão novo do Crasto: 10%, podendo chegar a 30%).
const EMPTY = { id: "", name: "", category: "", unit: "mensal", price_table: "", price_min: "", price_max: "", base_commission: "10", internal: false, notes: "" };

export default function Servicos() {
  const { taxRate } = useSettings();
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await api.catalog.services.list()) as unknown as S[], []);
  const allRows = data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const editing = !!f.id;

  // Categorias vêm do próprio banco (serviços já cadastrados) — controlar/filtrar por elas.
  const cats = Array.from(new Set(allRows.map((r) => (r.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt"));
  const rows = catFilter ? allRows.filter((r) => (r.category || "") === catFilter) : allRows;

  function openNew() { setF({ ...EMPTY }); setErr(""); setOpen(true); }
  function openEdit(s: S) { setF({ id: s.id, name: s.name, category: s.category ?? "", unit: s.unit, price_table: String(s.price_table), price_min: s.price_min != null ? String(s.price_min) : "", price_max: s.price_max != null ? String(s.price_max) : "", base_commission: String(s.base_commission), internal: !!s.internal, notes: s.notes ?? "" }); setErr(""); setOpen(true); }

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
      <PageHead eyebrow="Painel Admin" title="Serviços & preços" sub="Base oficial de preços da Crasto.AI. Preço-âncora + faixa (mín–máx); imposto padrão exibido à parte."
        right={<><button className="crasto-btn crasto-btn--secondary crasto-btn--sm"><span className="crasto-btn__icon"><Upload size={15} /></span><span className="crasto-btn__label">{t("Importar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{t("Novo serviço")}</span></button></>} />
      {!loading && cats.length > 0 && (
        <div className="svc-filter">
          <button className={"cattab" + (!catFilter ? " is-active" : "")} onClick={() => setCatFilter("")}>{t("Todas")}<span className="cnt">{allRows.length}</span></button>
          {cats.map((c) => (
            <button key={c} className={"cattab" + (catFilter === c ? " is-active" : "")} onClick={() => setCatFilter(c)}>{c}<span className="cnt">{allRows.filter((r) => (r.category || "") === c).length}</span></button>
          ))}
        </div>
      )}
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>{catFilter ? t("Nenhum serviço nesta categoria.") : t("Nenhum serviço.")}</strong> {catFilter ? "" : t("Clique em \"Novo serviço\".")}</p></Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Serviço")}</th><th>{t("Categoria")}</th><th>{t("Unidade")}</th><th>{t("Preço-âncora")}</th><th>{t("Faixa")}</th><th>{t("Imposto")} ({fmtRate(taxRate)}%)</th><th>{t("Líquido")}</th><th>{t("Comissão")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const imp = taxOf(r.price_table, taxRate);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: "var(--crasto-text-primary)" }}>{r.name}{r.internal && <Lock size={12} title={t("Interno (remix VdI)")} style={{ verticalAlign: -1, marginLeft: 6, color: "var(--crasto-text-muted)" }} />}</td>
                    <td><span className="chip">{r.category}</span></td>
                    <td>{r.unit.replace("_", " ")}</td>
                    <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{money(r.price_table)}</td>
                    <td className="tnum" style={{ color: "var(--crasto-text-muted)", fontSize: 12 }}>{range(r) || "—"}</td>
                    <td className="tnum" style={{ color: "var(--crasto-danger)" }}>{money(imp)}</td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-success)" }}>{money(r.price_table - imp)}</td>
                    <td className="tnum">{r.base_commission}%</td>
                    <td><div style={{ display: "flex", gap: 6 }}><button className="icobtn" title={t("Editar")} onClick={() => openEdit(r)}><Pencil size={14} /></button><button className="icobtn" title={t("Excluir")} onClick={() => del(r)}><Trash2 size={14} /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
        {f.price_table !== "" && <div className="note" style={{ marginTop: 2 }}><span>{t("Imposto")} ({fmtRate(taxRate)}%): <b>{money(taxOf(Number(f.price_table), taxRate))}</b> · {t("Líquido")}: <b>{money((Number(f.price_table) || 0) - taxOf(Number(f.price_table), taxRate))}</b></span></div>}

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
