import { useState } from "react";
import { Plus, Pencil, Trash2, Search, ChevronRight, ChevronDown, CheckCircle2 } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

const today = () => new Date().toISOString().slice(0, 10);
const A_EMPTY = { id: "", account_type: "payable", description: "", contact_name: "", category: "", amount: "", amount_paid: "", due_date: "", payment_date: "", payment_method: "", recurrence: "", invoice_number: "", notes: "", status: "pending", expense_type: "" };
const C_EMPTY = { id: "", vendor_name: "", description: "", category: "", currency: "BRL", amount_original: "", exchange_rate: "1", amount_brl: "", recurrence: "mensal", cost_type: "fixo", cost_nature: "recorrente", next_payment_date: "", is_active: true, notes: "" };
const T_EMPTY = { id: "", type: "income", category: "", amount: "", description: "", status: "completed", transaction_date: "", contact_name: "", payment_method: "", notes: "" };

const TABS = [
  { key: "pagar", label: "A Pagar" }, { key: "receber", label: "A Receber" },
  { key: "cobranca", label: "Cobrança" }, { key: "conciliacao", label: "Conciliação" },
  { key: "nfs", label: "NFs" }, { key: "tesouraria", label: "Tesouraria" },
  { key: "antecipacoes", label: "Antecipações" }, { key: "transacoes", label: "Transações" },
];

export default function Financeiro() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [pay, rec, costs, tx] = await Promise.all([
      services.finance.accounts.list("payable"), services.finance.accounts.list("receivable"), services.finance.costs.list(), services.finance.transactions.list(),
    ]);
    return { pay: (pay as any[]) ?? [], rec: (rec as any[]) ?? [], costs: (costs as any[]) ?? [], tx: (tx as any[]) ?? [] };
  }, []);
  const pay = data?.pay ?? [], rec = data?.rec ?? [], costs = data?.costs ?? [], tx = data?.tx ?? [];
  const [tab, setTab] = useState("pagar");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };
  const [aOpen, setAOpen] = useState(false); const [af, setAf] = useState<any>({ ...A_EMPTY });
  const [cOpen, setCOpen] = useState(false); const [cf, setCf] = useState<any>({ ...C_EMPTY });
  const [tOpen, setTOpen] = useState(false); const [tf, setTf] = useState<any>({ ...T_EMPTY });

  const rem = (r: any) => Number(r.amount || 0) - Number(r.amount_paid || 0);
  const isOverdue = (r: any) => (r.status === "pending" || r.status === "partial") && r.due_date && r.due_date < today();
  // KPIs topo
  const aPagar = pay.filter((r) => r.status !== "paid" && r.status !== "cancelled").reduce((a, r) => a + rem(r), 0);
  const aReceber = rec.filter((r) => r.status !== "paid" && r.status !== "cancelled").reduce((a, r) => a + rem(r), 0);
  const inadimplencia = rec.filter(isOverdue).reduce((a, r) => a + rem(r), 0);
  // Tesouraria (fluxo de caixa)
  const txSum = (type: string, status?: string) => tx.filter((r) => r.type === type && (!status || r.status === status)).reduce((a, r) => a + Number(r.amount || 0), 0);
  const entradasReal = txSum("income", "completed"), saidasReal = txSum("expense", "completed");
  const saldoCaixa = entradasReal - saidasReal;
  const entradasPrev = txSum("income", "pending"), saidasPrev = txSum("expense", "pending");

  // custo → "lançamento" a pagar (histórico pago se inativo; ativo = pendente)
  const costToItem = (c: any) => ({ id: c.id, _kind: "cost", description: c.description, contact_name: c.vendor_name, category: c.category, amount: Number(c.amount_brl || 0), amount_paid: c.is_active ? 0 : Number(c.amount_brl || 0), due_date: c.next_payment_date, payment_date: c.is_active ? null : c.reference_date, status: c.is_active ? "pending" : "paid", recurrence: c.recurrence });
  const acctToItem = (r: any) => ({ ...r, _kind: "account" });

  // === grupos por empresa (A Pagar = contas payable + custos) ===
  function buildGroups(items: any[]) {
    const q = query.trim().toLowerCase();
    const fil = items.filter((i) => !q || `${i.contact_name || ""} ${i.description || ""} ${i.category || ""}`.toLowerCase().includes(q));
    const g: Record<string, any[]> = {};
    fil.forEach((i) => { const k = i.contact_name || t("(sem empresa)"); (g[k] ||= []).push(i); });
    return Object.entries(g).map(([name, list]) => {
      const total = list.reduce((a, i) => a + Number(i.amount || 0), 0);
      const pago = list.reduce((a, i) => a + Number(i.amount_paid || 0), 0);
      const kinds = new Set(list.map((i) => i._kind));
      const tipo = kinds.size > 1 ? t("Misto") : kinds.has("cost") ? t("Custo") : t("Conta");
      const status = pago >= total ? "paid" : list.some(isOverdue) ? "overdue" : "pending";
      const due = list.map((i) => i.due_date).filter(Boolean).sort()[0] || null;
      const payd = list.map((i) => i.payment_date).filter(Boolean).sort().slice(-1)[0] || null;
      return { name, list, total, pago, restante: total - pago, tipo, status, due, payd };
    }).sort((a, b) => b.total - a.total);
  }
  const payItems = [...pay.map(acctToItem), ...costs.map(costToItem)];
  const groups = tab === "pagar" ? buildGroups(payItems) : tab === "receber" ? buildGroups(rec.map(acctToItem)) : [];

  // resumo A Pagar (custos)
  const activeCosts = costs.filter((c) => c.is_active);
  const totalMensal = activeCosts.filter((c) => c.recurrence === "mensal").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const totalAno = totalMensal * 12 + activeCosts.filter((c) => c.recurrence === "anual").reduce((a, c) => a + Number(c.amount_brl || 0), 0) + activeCosts.filter((c) => c.recurrence === "pontual").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const consumo = pay.filter((r) => r.expense_type === "consumo");
  const revenda = pay.filter((r) => r.expense_type === "revenda");
  // status cards (do lado ativo)
  const curItems = tab === "pagar" ? payItems : rec.map(acctToItem);
  const stVencidos = curItems.filter(isOverdue).reduce((a, i) => a + rem(i), 0);
  const stHoje = curItems.filter((i) => (i.status === "pending" || i.status === "partial") && i.due_date === today()).reduce((a, i) => a + rem(i), 0);
  const stAvencer = curItems.filter((i) => (i.status === "pending" || i.status === "partial") && i.due_date && i.due_date > today()).reduce((a, i) => a + rem(i), 0);
  const stPagos = curItems.reduce((a, i) => a + Number(i.amount_paid || 0), 0);
  const stTotal = curItems.reduce((a, i) => a + Number(i.amount || 0), 0);

  const stLabel = (s: string) => (({ pending: t("Pendente"), partial: t("Parcial"), paid: t("Pago"), overdue: t("Vencido"), cancelled: t("Cancelada") } as any)[s] || s);
  const stTone = (s: string) => (s === "paid" ? "ok" : s === "overdue" ? "warn" : s === "cancelled" ? "mute" : "info");

  // handlers conta
  function newAccount(type: string) { setAf({ ...A_EMPTY, account_type: type, status: "pending" }); setAOpen(true); }
  function editItem(i: any) {
    if (i._kind === "cost") { const c = costs.find((x) => x.id === i.id); setCf({ id: c.id, vendor_name: c.vendor_name || "", description: c.description || "", category: c.category || "", currency: c.currency || "BRL", amount_original: String(c.amount_original ?? ""), exchange_rate: String(c.exchange_rate ?? "1"), amount_brl: String(c.amount_brl ?? ""), recurrence: c.recurrence || "mensal", cost_type: c.cost_type || "fixo", cost_nature: c.cost_nature || "recorrente", next_payment_date: c.next_payment_date || "", is_active: !!c.is_active, notes: c.notes || "" }); setCOpen(true); }
    else { setAf({ id: i.id, account_type: i.account_type, description: i.description || "", contact_name: i.contact_name || "", category: i.category || "", amount: String(i.amount ?? ""), amount_paid: String(i.amount_paid ?? ""), due_date: i.due_date || "", payment_date: i.payment_date || "", payment_method: i.payment_method || "", recurrence: i.recurrence || "", invoice_number: i.invoice_number || "", notes: i.notes || "", status: i.status || "pending", expense_type: i.expense_type || "" }); setAOpen(true); }
  }
  async function saveAccount() {
    if (!af.description.trim() || !af.amount) { flash(t("Informe a descrição e o valor.")); return; }
    setBusy(true);
    try { await services.finance.accounts.save({ ...af, amount: af.amount || 0, amount_paid: af.amount_paid || 0 }); setAOpen(false); reload(); flash(t("Conta salva ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  function recalc(next: any) { const o = Number(next.amount_original || 0); const r = next.currency === "BRL" ? 1 : Number(next.exchange_rate || 1); return { ...next, exchange_rate: next.currency === "BRL" ? "1" : next.exchange_rate, amount_brl: (o * r).toFixed(2) }; }
  const setC = (patch: any) => setCf((s: any) => recalc({ ...s, ...patch }));
  async function saveCost() {
    if (!cf.description.trim()) { flash(t("Informe a descrição.")); return; }
    setBusy(true);
    try { await services.finance.costs.save({ ...cf, amount_original: cf.amount_original || 0, exchange_rate: cf.exchange_rate || 1, amount_brl: cf.amount_brl || 0 }); setCOpen(false); reload(); flash(t("Custo salvo ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function markPaid(i: any) {
    setBusy(true);
    try {
      if (i._kind === "cost") await services.finance.costs.save({ id: i.id, is_active: false });
      else await services.finance.accounts.save({ id: i.id, account_type: i.account_type, status: "paid", payment_date: today(), amount_paid: i.amount });
      reload(); flash(t("Marcada como paga ✓"));
    } catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function delItem(i: any) { if (!confirm(t("Excluir este lançamento?"))) return; if (i._kind === "cost") await services.finance.costs.remove(i.id); else await services.finance.accounts.remove(i.id); reload(); }

  // handlers tesouraria
  function newTx(type: string) { setTf({ ...T_EMPTY, type, transaction_date: today() }); setTOpen(true); }
  function editTx(r: any) { setTf({ id: r.id, type: r.type, category: r.category || "", amount: String(r.amount ?? ""), description: r.description || "", status: r.status || "completed", transaction_date: r.transaction_date || today(), contact_name: r.contact_name || "", payment_method: r.payment_method || "", notes: r.notes || "" }); setTOpen(true); }
  async function saveTx() {
    if (!tf.description.trim() || !tf.amount) { flash(t("Informe a descrição e o valor.")); return; }
    setBusy(true);
    try { await services.finance.transactions.save({ ...tf, amount: tf.amount || 0 }); setTOpen(false); reload(); flash(t("Lançamento salvo ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  async function markTxDone(r: any) { setBusy(true); try { await services.finance.transactions.save({ ...r, status: "completed" }); reload(); flash(t("Marcado como realizado ✓")); } catch (e) { flash(errorMessage(e)); } finally { setBusy(false); } }
  async function delTx(r: any) { if (!confirm(t("Excluir este lançamento?"))) return; await services.finance.transactions.remove(r.id); reload(); }
  const txFiltered = tx.filter((r) => { const q = query.trim().toLowerCase(); return !q || `${r.description || ""} ${r.category || ""} ${r.contact_name || ""}`.toLowerCase().includes(q); });

  const built = tab === "pagar" || tab === "receber";

  return (
    <div>
      <PageHead eyebrow="Painel Admin · Financeiro 🔒" title="Financeiro" sub="Gestão financeira completa da Crasto.AI." />

      {/* KPIs topo */}
      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab">{t("A Pagar")}</div><div className="val tnum" style={{ fontSize: 22, color: "#B54708" }}>{money(aPagar)}</div></div>
        <div className="kpi g"><div className="lab">{t("A Receber")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(aReceber)}</div></div>
        <div className="kpi"><div className="lab">{t("Saldo em Caixa")}</div><div className="val tnum" style={{ fontSize: 22, color: saldoCaixa < 0 ? "#B54708" : "#1F8A5B" }}>{money(saldoCaixa)}</div><div className="delta">{t("entradas − saídas realizadas")}</div></div>
        <div className="kpi"><div className="lab">{t("Inadimplência")}</div><div className="val tnum" style={{ fontSize: 22, color: inadimplencia > 0 ? "#B54708" : undefined }}>{money(inadimplencia)}</div></div>
      </div>

      <div className="ptabs">
        {TABS.map((tb) => <button key={tb.key} className={"ptab" + (tab === tb.key ? " is-active" : "")} onClick={() => setTab(tb.key)}>{t(tb.label)}</button>)}
      </div>

      {loading ? <Empty>Carregando…</Empty> : tab === "tesouraria" ? (<>
        {/* barra de ação tesouraria */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div className="catsearch" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Pesquisar…")} />
          </div>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => newTx("income")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Nova entrada")}</span></button>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => newTx("expense")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Nova saída")}</span></button>
        </div>

        {/* resumo tesouraria */}
        <div className="kpis" style={{ marginBottom: 14 }}>
          <div className="kpi g"><div className="lab">{t("Entradas realizadas")}</div><div className="val tnum" style={{ fontSize: 20, color: "#1F8A5B" }}>{money(entradasReal)}</div></div>
          <div className="kpi"><div className="lab">{t("Saídas realizadas")}</div><div className="val tnum" style={{ fontSize: 20, color: "#B54708" }}>{money(saidasReal)}</div></div>
          <div className="kpi"><div className="lab">{t("Saldo em Caixa")}</div><div className="val tnum" style={{ fontSize: 20, color: saldoCaixa < 0 ? "#B54708" : "#1F8A5B" }}>{money(saldoCaixa)}</div></div>
          <div className="kpi"><div className="lab">{t("Previsto (entradas − saídas)")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(entradasPrev - saidasPrev)}</div><div className="delta">{t("lançamentos pendentes")}</div></div>
        </div>

        {/* movimentos */}
        <div className="tbl-wrap" style={{ marginTop: 6 }}>
          <table className="tbl">
            <thead><tr><th>{t("Data")}</th><th>{t("Descrição")}</th><th>{t("Categoria")}</th><th>{t("Tipo")}</th><th style={{ textAlign: "right" }}>{t("Valor")}</th><th>{t("Status")}</th><th></th></tr></thead>
            <tbody>
              {txFiltered.length === 0 ? <tr><td colSpan={7} style={{ color: "var(--crasto-text-muted)", padding: 14 }}>{t("Nada por aqui ainda.")}</td></tr> : txFiltered.map((r) => (
                <tr key={r.id}>
                  <td className="tnum">{r.transaction_date ? new Date(r.transaction_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td><div className="nm">{r.description}</div>{r.contact_name && <div className="mt">{r.contact_name}</div>}</td>
                  <td>{r.category || "—"}</td>
                  <td><Pill tone={r.type === "income" ? "ok" : "warn"}>{r.type === "income" ? t("Entrada") : t("Saída")}</Pill></td>
                  <td className="tnum" style={{ textAlign: "right", fontWeight: 700, color: r.type === "income" ? "#1F8A5B" : "#B54708" }}>{r.type === "income" ? "+" : "−"}{money(Number(r.amount || 0))}</td>
                  <td><Pill tone={r.status === "completed" ? "ok" : r.status === "cancelled" ? "mute" : "info"}>{r.status === "completed" ? t("Realizado") : r.status === "cancelled" ? t("Cancelada") : t("Pendente")}</Pill></td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {r.status !== "completed" && <button className="icobtn" title={t("Marcar como realizado")} onClick={() => markTxDone(r)}><CheckCircle2 size={13} /></button>}
                      <button className="icobtn" title={t("Editar")} onClick={() => editTx(r)}><Pencil size={13} /></button>
                      <button className="icobtn rm" title={t("Excluir")} onClick={() => delTx(r)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>) : !built ? (
        <div className="card"><Empty><p><strong>{t("Em breve.")}</strong> {t("Esta aba está em construção — em breve você poderá gerenciar isso por aqui.")}</p></Empty></div>
      ) : (<>
        {/* barra de ação */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div className="catsearch" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Pesquisar…")} />
          </div>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => newAccount(tab === "pagar" ? "payable" : "receivable")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo lançamento")}</span></button>
          {tab === "pagar" && <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { setCf({ ...C_EMPTY }); setCOpen(true); }}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo custo")}</span></button>}
        </div>

        {/* resumo (só A Pagar tem os cards de custo) */}
        {tab === "pagar" && (
          <div className="kpis" style={{ marginBottom: 14 }}>
            <div className="kpi g"><div className="lab">{t("Total Mensal")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(totalMensal)}</div><div className="delta">{t("custos recorrentes do mês")}</div></div>
            <div className="kpi"><div className="lab">{t("Total Ano")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(totalAno)}</div><div className="delta">{t("Mensal×12 + Anual + Pontual")}</div></div>
            <div className="kpi"><div className="lab">{t("Despesas de Consumo")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(consumo.reduce((a, r) => a + Number(r.amount || 0), 0))}</div><div className="delta">{t("{n} lançamentos", { n: consumo.length })}</div></div>
            <div className="kpi"><div className="lab">{t("Despesas de Revenda")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(revenda.reduce((a, r) => a + Number(r.amount || 0), 0))}</div><div className="delta">{t("{n} lançamentos", { n: revenda.length })}</div></div>
          </div>
        )}

        {/* status cards */}
        <div className="finstatus">
          <div className="fs red"><span>{t("Vencidos")}</span><b>{money(stVencidos)}</b></div>
          <div className="fs amber"><span>{t("Vencem hoje")}</span><b>{money(stHoje)}</b></div>
          <div className="fs blue"><span>{t("A vencer")}</span><b>{money(stAvencer)}</b></div>
          <div className="fs green"><span>{tab === "pagar" ? t("Pagos") : t("Recebidos")}</span><b>{money(stPagos)}</b></div>
          <div className="fs"><span>{t("Total período")}</span><b>{money(stTotal)}</b></div>
        </div>

        {/* tabela agrupada por empresa */}
        <div className="tbl-wrap" style={{ marginTop: 6 }}>
          <table className="tbl fintbl">
            <thead><tr><th></th><th>{t("Empresa")}</th><th>{t("Tipo")}</th><th>{t("Vencimento")}</th><th style={{ textAlign: "right" }}>{t("Total")}</th><th style={{ textAlign: "right" }}>{t("Já Pago")}</th><th style={{ textAlign: "right" }}>{t("Restante")}</th><th>{t("Status")}</th></tr></thead>
            <tbody>
              {groups.length === 0 ? <tr><td colSpan={8} style={{ color: "var(--crasto-text-muted)", padding: 14 }}>{t("Nada por aqui ainda.")}</td></tr> : groups.map((g) => (
                <>
                  <tr key={g.name} className="fingroup" onClick={() => setExpanded((s) => ({ ...s, [g.name]: !s[g.name] }))} style={{ cursor: "pointer" }}>
                    <td>{expanded[g.name] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td><div className="nm" style={{ fontWeight: 700 }}>{g.name}</div><div className="mt">{t("{n} lançamentos", { n: g.list.length })}</div></td>
                    <td><Pill tone="mute">{g.tipo}</Pill></td>
                    <td className="tnum">{g.due ? new Date(g.due + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="tnum" style={{ textAlign: "right", fontWeight: 700 }}>{money(g.total)}</td>
                    <td className="tnum" style={{ textAlign: "right", color: "#1F8A5B" }}>{money(g.pago)}</td>
                    <td className="tnum" style={{ textAlign: "right", color: g.restante > 0 ? "#B54708" : "var(--crasto-text-muted)" }}>{money(g.restante)}</td>
                    <td><Pill tone={stTone(g.status) as any}>{stLabel(g.status)}</Pill></td>
                  </tr>
                  {expanded[g.name] && g.list.map((i: any) => (
                    <tr key={i.id} className="finrow">
                      <td></td>
                      <td colSpan={2}><div className="nm" style={{ fontSize: 13 }}>{i.description}</div><div className="mt">{[i.category, i._kind === "cost" ? t("Custo") : t("Conta")].filter(Boolean).join(" · ")}</div></td>
                      <td className="tnum">{i.due_date ? new Date(i.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{money(Number(i.amount || 0))}</td>
                      <td className="tnum" style={{ textAlign: "right", color: "#1F8A5B" }}>{money(Number(i.amount_paid || 0))}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{money(rem(i))}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          {i.status !== "paid" && <button className="icobtn" title={t("Marcar como paga")} onClick={(e) => { e.stopPropagation(); markPaid(i); }}><CheckCircle2 size={13} /></button>}
                          <button className="icobtn" title={t("Editar")} onClick={(e) => { e.stopPropagation(); editItem(i); }}><Pencil size={13} /></button>
                          <button className="icobtn rm" title={t("Excluir")} onClick={(e) => { e.stopPropagation(); delItem(i); }}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {/* Modal conta */}
      <Modal title={af.id ? t("Editar conta") : (af.account_type === "payable" ? t("Nova conta a pagar") : t("Nova conta a receber"))} open={aOpen} onClose={() => setAOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setAOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveAccount}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <Field label="Descrição *"><input value={af.description} onChange={(e) => setAf({ ...af, description: e.target.value })} /></Field>
        <div className="grid2">
          <Field label={af.account_type === "payable" ? "Fornecedor" : "Cliente"}><input value={af.contact_name} onChange={(e) => setAf({ ...af, contact_name: e.target.value })} /></Field>
          <Field label="Categoria"><input value={af.category} onChange={(e) => setAf({ ...af, category: e.target.value })} /></Field>
        </div>
        <div className="grid3">
          <Field label="Valor (R$) *"><input type="number" step="0.01" value={af.amount} onChange={(e) => setAf({ ...af, amount: e.target.value })} /></Field>
          <Field label="Já pago (R$)"><input type="number" step="0.01" value={af.amount_paid} onChange={(e) => setAf({ ...af, amount_paid: e.target.value })} /></Field>
          <Field label="Vencimento"><input type="date" value={af.due_date} onChange={(e) => setAf({ ...af, due_date: e.target.value })} /></Field>
        </div>
        <div className="grid3">
          <Field label="Status"><select value={af.status} onChange={(e) => setAf({ ...af, status: e.target.value })}><option value="pending">{t("Pendente")}</option><option value="partial">{t("Parcial")}</option><option value="paid">{t("Pago")}</option><option value="cancelled">{t("Cancelada")}</option></select></Field>
          <Field label="Recorrência"><select value={af.recurrence} onChange={(e) => setAf({ ...af, recurrence: e.target.value })}><option value="">{t("Sem recorrência")}</option><option value="monthly">{t("Mensal")}</option><option value="yearly">{t("Anual")}</option></select></Field>
          {af.account_type === "payable"
            ? <Field label="Tipo de despesa"><select value={af.expense_type} onChange={(e) => setAf({ ...af, expense_type: e.target.value })}><option value="">{t("(nenhum)")}</option><option value="consumo">{t("Consumo")}</option><option value="revenda">{t("Revenda")}</option></select></Field>
            : <Field label="Nº da nota"><input value={af.invoice_number} onChange={(e) => setAf({ ...af, invoice_number: e.target.value })} /></Field>}
        </div>
        <Field label="Observações"><textarea value={af.notes} onChange={(e) => setAf({ ...af, notes: e.target.value })} /></Field>
      </Modal>

      {/* Modal custo */}
      <Modal title={cf.id ? t("Editar custo") : t("Novo custo")} open={cOpen} onClose={() => setCOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setCOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveCost}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <div className="grid2">
          <Field label="Fornecedor"><input value={cf.vendor_name} onChange={(e) => setCf({ ...cf, vendor_name: e.target.value })} /></Field>
          <Field label="Categoria"><input value={cf.category} onChange={(e) => setCf({ ...cf, category: e.target.value })} /></Field>
        </div>
        <Field label="Descrição *"><input value={cf.description} onChange={(e) => setCf({ ...cf, description: e.target.value })} /></Field>
        <div className="grid3">
          <Field label="Moeda"><select value={cf.currency} onChange={(e) => setC({ currency: e.target.value })}>{["BRL", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Valor (moeda)"><input type="number" step="0.01" value={cf.amount_original} onChange={(e) => setC({ amount_original: e.target.value })} /></Field>
          <Field label="Câmbio"><input type="number" step="0.0001" value={cf.exchange_rate} onChange={(e) => setC({ exchange_rate: e.target.value })} disabled={cf.currency === "BRL"} /></Field>
        </div>
        <div className="grid3">
          <Field label="Valor em R$"><input type="number" step="0.01" value={cf.amount_brl} onChange={(e) => setCf({ ...cf, amount_brl: e.target.value })} /></Field>
          <Field label="Recorrência"><select value={cf.recurrence} onChange={(e) => setCf({ ...cf, recurrence: e.target.value })}><option value="mensal">{t("Mensal")}</option><option value="anual">{t("Anual")}</option><option value="pontual">{t("Pontual")}</option></select></Field>
          <label className="frow"><span>{t("Ativo")}</span><span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}><button type="button" className={"sw" + (cf.is_active ? " on" : "")} onClick={() => setCf({ ...cf, is_active: !cf.is_active })} /><span style={{ fontSize: 13 }}>{cf.is_active ? t("Ativo") : t("Inativo")}</span></span></label>
        </div>
        <Field label="Observações"><textarea value={cf.notes} onChange={(e) => setCf({ ...cf, notes: e.target.value })} /></Field>
      </Modal>

      {/* Modal tesouraria */}
      <Modal title={tf.id ? t("Editar lançamento") : (tf.type === "income" ? t("Nova entrada") : t("Nova saída"))} open={tOpen} onClose={() => setTOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setTOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveTx}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <Field label="Descrição *"><input value={tf.description} onChange={(e) => setTf({ ...tf, description: e.target.value })} /></Field>
        <div className="grid3">
          <Field label="Tipo"><select value={tf.type} onChange={(e) => setTf({ ...tf, type: e.target.value })}><option value="income">{t("Entrada")}</option><option value="expense">{t("Saída")}</option></select></Field>
          <Field label="Valor (R$) *"><input type="number" step="0.01" value={tf.amount} onChange={(e) => setTf({ ...tf, amount: e.target.value })} /></Field>
          <Field label="Data"><input type="date" value={tf.transaction_date} onChange={(e) => setTf({ ...tf, transaction_date: e.target.value })} /></Field>
        </div>
        <div className="grid3">
          <Field label="Status"><select value={tf.status} onChange={(e) => setTf({ ...tf, status: e.target.value })}><option value="completed">{t("Realizado")}</option><option value="pending">{t("Pendente")}</option><option value="cancelled">{t("Cancelada")}</option></select></Field>
          <Field label="Categoria"><input value={tf.category} onChange={(e) => setTf({ ...tf, category: e.target.value })} /></Field>
          <Field label="Contato / origem"><input value={tf.contact_name} onChange={(e) => setTf({ ...tf, contact_name: e.target.value })} /></Field>
        </div>
        <Field label="Forma de pagamento"><input value={tf.payment_method} onChange={(e) => setTf({ ...tf, payment_method: e.target.value })} /></Field>
        <Field label="Observações"><textarea value={tf.notes} onChange={(e) => setTf({ ...tf, notes: e.target.value })} /></Field>
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
