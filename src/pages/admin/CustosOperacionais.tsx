import { useState } from "react";
import { Plus, Pencil, Trash2, Search, Coins } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, money, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

const CURR = ["BRL", "USD", "EUR"];
const EMPTY = { id: "", vendor_name: "", description: "", category: "", currency: "BRL", amount_original: "", exchange_rate: "1", amount_brl: "", cost_type: "fixo", cost_nature: "recorrente", recurrence: "mensal", reference_date: "", next_payment_date: "", payment_method: "", website: "", is_active: true, notes: "" };

export default function CustosOperacionais() {
  const t = useT();
  const { data, loading, reload } = useAsync(() => services.finance.costs.list(), []);
  const rows = (data as any[]) ?? [];
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };

  const active = rows.filter((r) => r.is_active);
  const mensal = active.filter((r) => r.recurrence === "mensal").reduce((a, r) => a + Number(r.amount_brl || 0), 0);
  const anual = active.filter((r) => r.recurrence === "anual").reduce((a, r) => a + Number(r.amount_brl || 0), 0);
  const mensalizado = mensal + anual / 12;
  const totalReg = rows.reduce((a, r) => a + Number(r.amount_brl || 0), 0);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => (!onlyActive || r.is_active) && (!q || `${r.vendor_name || ""} ${r.description} ${r.category || ""}`.toLowerCase().includes(q)));

  function openNew() { setF({ ...EMPTY }); setOpen(true); }
  function openEdit(r: any) { setF({ id: r.id, vendor_name: r.vendor_name || "", description: r.description || "", category: r.category || "", currency: r.currency || "BRL", amount_original: String(r.amount_original ?? ""), exchange_rate: String(r.exchange_rate ?? "1"), amount_brl: String(r.amount_brl ?? ""), cost_type: r.cost_type || "fixo", cost_nature: r.cost_nature || "recorrente", recurrence: r.recurrence || "mensal", reference_date: r.reference_date || "", next_payment_date: r.next_payment_date || "", payment_method: r.payment_method || "", website: r.website || "", is_active: !!r.is_active, notes: r.notes || "" }); setOpen(true); }
  function recalc(next: any) {
    const orig = Number(next.amount_original || 0); const rate = next.currency === "BRL" ? 1 : Number(next.exchange_rate || 1);
    return { ...next, exchange_rate: next.currency === "BRL" ? "1" : next.exchange_rate, amount_brl: (orig * rate).toFixed(2) };
  }
  const setC = (patch: any) => setF((s: any) => recalc({ ...s, ...patch }));

  async function save() {
    if (!f.description.trim()) { flash(t("Informe a descrição.")); return; }
    setBusy(true);
    try { await services.finance.costs.save({ ...f, amount_original: f.amount_original || 0, exchange_rate: f.exchange_rate || 1, amount_brl: f.amount_brl || 0 }); setOpen(false); reload(); flash(t("Custo salvo ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function toggleActive(r: any) { try { await services.finance.costs.save({ id: r.id, is_active: !r.is_active }); reload(); } catch (e) { flash(errorMessage(e)); } }
  async function del(r: any) { if (!confirm(t("Excluir este custo?"))) return; await services.finance.costs.remove(r.id); reload(); }

  return (
    <div>
      <PageHead eyebrow="Painel Admin · Financeiro 🔒" title="Custos Operacionais" sub="Ferramentas, infraestrutura e assinaturas da Crasto.AI (câmbio → R$)."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{t("Novo custo")}</span></button>} />

      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi g"><div className="lab">{t("Custo mensal (ativo)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(mensalizado)}</div><div className="delta">{t("mensalizado (anual÷12)")}</div></div>
        <div className="kpi"><div className="lab">{t("Só mensais")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(mensal)}</div></div>
        <div className="kpi"><div className="lab">{t("Só anuais")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(anual)}</div></div>
        <div className="kpi"><div className="lab">{t("Ativos")}</div><div className="val" style={{ fontSize: 22 }}>{active.length}<small> / {rows.length}</small></div><div className="delta">{t("total registrado")} {money(totalReg)}</div></div>
      </div>

      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>{t("Nada por aqui ainda.")}</strong> {t("Clique em \"Novo custo\" para começar.")}</p></Empty> : (<>
        <div className="catsearch">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Buscar por fornecedor, descrição, categoria…")} />
          <span className="mt" style={{ whiteSpace: "nowrap" }}>{t("{n} de {total}", { n: filtered.length, total: rows.length })}</span>
        </div>
        <div className="cattabs">
          <button className={"cattab" + (!onlyActive ? " is-active" : "")} onClick={() => setOnlyActive(false)}>{t("Todos")}<span className="cnt">{rows.length}</span></button>
          <button className={"cattab" + (onlyActive ? " is-active" : "")} onClick={() => setOnlyActive(true)}>{t("Ativos")}<span className="cnt">{active.length}</span></button>
        </div>

        {filtered.map((r) => (
          <div className="card" style={{ marginBottom: 10 }} key={r.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="logo" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)", display: "grid", placeItems: "center", flexShrink: 0 }}><Coins size={16} /></span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="nm" style={{ fontWeight: 700 }}>{r.vendor_name || r.description}</div>
                <div className="mt">{[r.vendor_name ? r.description : null, r.category, r.recurrence].filter(Boolean).join(" · ")}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 120 }}>
                <div className="nm tnum" style={{ fontWeight: 700, fontSize: 16 }}>{money(Number(r.amount_brl || 0))}</div>
                {r.currency !== "BRL" && <div className="mt tnum">{r.currency} {Number(r.amount_original || 0).toFixed(2)} × {Number(r.exchange_rate || 1).toFixed(2)}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" className={"sw" + (r.is_active ? " on" : "")} title={r.is_active ? t("Ativo") : t("Inativo")} onClick={() => toggleActive(r)} />
                <button className="icobtn" title={t("Editar")} onClick={() => openEdit(r)}><Pencil size={14} /></button>
                <button className="icobtn rm" title={t("Excluir")} onClick={() => del(r)}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </>)}

      <Modal title={f.id ? t("Editar custo") : t("Novo custo")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <div className="grid2">
          <Field label="Fornecedor"><input value={f.vendor_name} onChange={(e) => setF({ ...f, vendor_name: e.target.value })} placeholder={t("Ex.: Lovable Labs")} /></Field>
          <Field label="Categoria"><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="software, ia_models…" /></Field>
        </div>
        <Field label="Descrição *"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid3">
          <Field label="Moeda"><select value={f.currency} onChange={(e) => setC({ currency: e.target.value })}>{CURR.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Valor (moeda)"><input type="number" step="0.01" value={f.amount_original} onChange={(e) => setC({ amount_original: e.target.value })} /></Field>
          <Field label="Câmbio"><input type="number" step="0.0001" value={f.exchange_rate} onChange={(e) => setC({ exchange_rate: e.target.value })} disabled={f.currency === "BRL"} /></Field>
        </div>
        <div className="grid3">
          <Field label="Valor em R$"><input type="number" step="0.01" value={f.amount_brl} onChange={(e) => setF({ ...f, amount_brl: e.target.value })} /></Field>
          <Field label="Recorrência"><select value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}><option value="mensal">{t("Mensal")}</option><option value="anual">{t("Anual")}</option><option value="pontual">{t("Pontual")}</option></select></Field>
          <Field label="Tipo"><select value={f.cost_type} onChange={(e) => setF({ ...f, cost_type: e.target.value })}><option value="fixo">{t("Fixo")}</option><option value="variavel">{t("Variável")}</option><option value="unico">{t("Único")}</option></select></Field>
        </div>
        <div className="grid3">
          <Field label="Referência"><input type="date" value={f.reference_date} onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
          <Field label="Próximo pagamento"><input type="date" value={f.next_payment_date} onChange={(e) => setF({ ...f, next_payment_date: e.target.value })} /></Field>
          <Field label="Forma de pagamento"><input value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })} /></Field>
        </div>
        <div className="grid2">
          <Field label="Website"><input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://…" /></Field>
          <label className="frow"><span>{t("Ativo")}</span><span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}><button type="button" className={"sw" + (f.is_active ? " on" : "")} onClick={() => setF({ ...f, is_active: !f.is_active })} /><span style={{ fontSize: 13 }}>{f.is_active ? t("Ativo") : t("Inativo")}</span></span></label>
        </div>
        <Field label="Observações"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
