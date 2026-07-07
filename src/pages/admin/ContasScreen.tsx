import { useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2, Search } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { id: "", description: "", contact_name: "", category: "", amount: "", due_date: "", payment_method: "", recurrence: "", invoice_number: "", notes: "", status: "pending", expense_type: "" };

export function ContasScreen({ type }: { type: "payable" | "receivable" }) {
  const t = useT();
  const payable = type === "payable";
  const { data, loading, reload } = useAsync(() => services.finance.accounts.list(type), [type]);
  const rows = (data as any[]) ?? [];
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...EMPTY });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };

  const isOverdue = (r: any) => (r.status === "pending" || r.status === "partial") && r.due_date && r.due_date < today();
  const dstatus = (r: any) => (isOverdue(r) ? "overdue" : r.status);
  const stLabel = (s: string) => (({ pending: t("Pendente"), partial: t("Parcial"), paid: t("Pago"), cancelled: t("Cancelada"), overdue: t("Vencida") } as any)[s] || s);
  const stTone = (s: string) => (s === "paid" ? "ok" : s === "overdue" ? "warn" : s === "partial" ? "warn" : s === "cancelled" ? "mute" : "info");

  // resumo
  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const pago = rows.reduce((a, r) => a + Number(r.amount_paid || 0), 0);
  const aberto = rows.filter((r) => r.status !== "paid" && r.status !== "cancelled").reduce((a, r) => a + (Number(r.amount || 0) - Number(r.amount_paid || 0)), 0);
  const vencido = rows.filter(isOverdue).reduce((a, r) => a + (Number(r.amount || 0) - Number(r.amount_paid || 0)), 0);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    const ds = dstatus(r);
    if (statusF && ds !== statusF) return false;
    if (q && !`${r.description} ${r.contact_name || ""} ${r.category || ""} ${r.invoice_number || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const stCount: Record<string, number> = {};
  rows.forEach((r) => { const s = dstatus(r); stCount[s] = (stCount[s] || 0) + 1; });

  function openNew() { setF({ ...EMPTY, status: "pending" }); setOpen(true); }
  function openEdit(r: any) { setF({ id: r.id, description: r.description || "", contact_name: r.contact_name || "", category: r.category || "", amount: String(r.amount ?? ""), due_date: r.due_date || "", payment_method: r.payment_method || "", recurrence: r.recurrence || "", invoice_number: r.invoice_number || "", notes: r.notes || "", status: r.status || "pending", expense_type: r.expense_type || "" }); setOpen(true); }
  async function save() {
    if (!f.description.trim() || !f.amount) { flash(t("Informe a descrição e o valor.")); return; }
    setBusy(true);
    try { await services.finance.accounts.save({ ...f, account_type: type, amount: f.amount || 0 }); setOpen(false); reload(); flash(t("Conta salva ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function markPaid(r: any) {
    setBusy(true);
    try { await services.finance.accounts.save({ id: r.id, account_type: type, status: "paid", payment_date: today(), amount_paid: r.amount }); reload(); flash(t("Marcada como paga ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function del(r: any) { if (!confirm(t("Excluir esta conta?"))) return; await services.finance.accounts.remove(r.id); reload(); }

  return (
    <div>
      <PageHead eyebrow="Painel Admin · Financeiro" title={payable ? "Contas a Pagar" : "Contas a Receber"} sub={payable ? "O que a Crasto.AI tem a pagar (fornecedores, ferramentas, infra)." : "O que a Crasto.AI tem a receber dos clientes."}
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={openNew}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{payable ? t("Nova conta a pagar") : t("Nova conta a receber")}</span></button>} />

      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi"><div className="lab">{t("Total")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(total)}</div></div>
        <div className="kpi g"><div className="lab">{payable ? t("Pago") : t("Recebido")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(pago)}</div></div>
        <div className="kpi"><div className="lab">{payable ? t("A pagar") : t("A receber")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(aberto)}</div></div>
        <div className="kpi"><div className="lab">{t("Vencido")}</div><div className="val tnum" style={{ fontSize: 22, color: vencido > 0 ? "#B54708" : undefined }}>{money(vencido)}</div></div>
      </div>

      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>{t("Nada por aqui ainda.")}</strong> {t("Clique em \"Nova conta\" para começar.")}</p></Empty> : (<>
        <div className="catsearch">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Buscar por descrição, fornecedor/cliente, nota…")} />
          <span className="mt" style={{ whiteSpace: "nowrap" }}>{t("{n} de {total}", { n: filtered.length, total: rows.length })}</span>
        </div>
        <div className="cattabs">
          <button className={"cattab" + (!statusF ? " is-active" : "")} onClick={() => setStatusF("")}>{t("Todas")}<span className="cnt">{rows.length}</span></button>
          {["overdue", "pending", "partial", "paid", "cancelled"].filter((s) => stCount[s]).map((s) => (
            <button key={s} className={"cattab" + (statusF === s ? " is-active" : "")} onClick={() => setStatusF(s)}>{stLabel(s)}<span className="cnt">{stCount[s]}</span></button>
          ))}
        </div>

        {filtered.length === 0 ? <Empty>{t("Nada encontrado com esses filtros.")}</Empty> : filtered.map((r) => (
          <div className="card" style={{ marginBottom: 10 }} key={r.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Pill tone={stTone(dstatus(r)) as any}>{stLabel(dstatus(r))}</Pill>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="nm" style={{ fontWeight: 700 }}>{r.description}</div>
                <div className="mt">{[r.contact_name, r.category, r.due_date ? `${t("vence")} ${new Date(r.due_date + "T00:00:00").toLocaleDateString("pt-BR")}` : null].filter(Boolean).join(" · ")}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 110 }}>
                <div className="nm tnum" style={{ fontWeight: 700, fontSize: 16, color: payable ? "#B54708" : "#1F8A5B" }}>{money(Number(r.amount || 0))}</div>
                {Number(r.amount_paid || 0) > 0 && Number(r.amount_paid) < Number(r.amount) && <div className="mt tnum">{t("pago")}: {money(Number(r.amount_paid))}</div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {r.status !== "paid" && r.status !== "cancelled" && <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={() => markPaid(r)} title={payable ? t("Marcar como paga") : t("Marcar como recebida")}><span className="crasto-btn__icon"><CheckCircle2 size={14} /></span></button>}
                <button className="icobtn" title={t("Editar")} onClick={() => openEdit(r)}><Pencil size={14} /></button>
                <button className="icobtn rm" title={t("Excluir")} onClick={() => del(r)}><Trash2 size={14} /></button>
              </div>
            </div>
            {r.notes && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 12.5, color: "var(--crasto-text-muted)" }}>{r.notes}</div>}
          </div>
        ))}
      </>)}

      <Modal title={f.id ? t("Editar conta") : (payable ? t("Nova conta a pagar") : t("Nova conta a receber"))} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <Field label="Descrição *"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={payable ? t("Ex.: Claude.AI — Plano Max") : t("Ex.: Mensalidade — Cliente X")} /></Field>
        <div className="grid2">
          <Field label={payable ? "Fornecedor" : "Cliente"}><input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></Field>
          <Field label="Categoria"><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder={t("Ex.: Tecnologia")} /></Field>
        </div>
        <div className="grid2">
          <Field label="Valor (R$) *"><input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Vencimento"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        </div>
        <div className="grid2">
          <Field label="Forma de pagamento"><input value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })} placeholder="Pix, Cartão…" /></Field>
          <Field label="Recorrência"><select value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}><option value="">{t("Sem recorrência")}</option><option value="monthly">{t("Mensal")}</option><option value="yearly">{t("Anual")}</option></select></Field>
        </div>
        <div className="grid2">
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="pending">{t("Pendente")}</option><option value="partial">{t("Parcial")}</option><option value="paid">{t("Pago")}</option><option value="cancelled">{t("Cancelada")}</option></select></Field>
          {payable
            ? <Field label="Tipo de despesa"><select value={f.expense_type} onChange={(e) => setF({ ...f, expense_type: e.target.value })}><option value="">{t("(nenhum)")}</option><option value="consumo">{t("Consumo")}</option><option value="revenda">{t("Revenda")}</option></select></Field>
            : <Field label="Nº da nota"><input value={f.invoice_number} onChange={(e) => setF({ ...f, invoice_number: e.target.value })} /></Field>}
        </div>
        <Field label="Observações"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
