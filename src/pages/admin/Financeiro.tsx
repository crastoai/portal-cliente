import { Fragment, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Search, ChevronRight, ChevronDown, CheckCircle2, Repeat } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, Field, useSort, SortTh } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import DocField from "../../ui/DocField";
import CustoIA from "./CustoIA";

// Data de HOJE no fuso do Brasil (America/Sao_Paulo) em "YYYY-MM-DD". Usar toISOString()
// (UTC) fazia o dia "virar" 3h antes à noite — e as parcelas são datas de calendário BR.
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const A_EMPTY = {
  id: "", account_type: "payable",
  contact_name: "", contact_reference: "", organization_id: "", cnpj: "",
  description: "", services: [] as any[],
  contract_validity_value: "", contract_validity_unit: "months", contract_total: "", contract_signed_date: "",
  payment_installments: "", installment_amount: "", due_date: "", payment_day_of_month: "", payment_method: "PIX", payment_schedule: [] as any[],
  expense_type: "consumo", category: "", status: "pending", payment_reason: "",
  amount: "", amount_paid: "", payment_date: "", recurrence: "", invoice_number: "", notes: "",
};
const UNITS = [{ v: "days", l: "Dias" }, { v: "months", l: "Meses" }, { v: "years", l: "Anos" }];
const PAYMETHODS = ["PIX", "Boleto", "Cartão de crédito", "Cartão de débito", "Transferência", "Dinheiro", "Outro"];
// gera as parcelas (payment_schedule) a partir de nº parcelas + 1ª data + dia de vencimento + valor.
// Cada parcela guarda a ORIGEM (origin_date/origin_amount) = o que foi gerado/veio do contrato.
// Quando o operador editar date/amount à mão, a origem fica intacta → dá pra mostrar o "log".
function buildSchedule(n: number, first: string, day: any, val: number) {
  const out: any[] = [];
  if (!n || n < 1 || !first) return out;
  const base = new Date(first + "T00:00:00");
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, day ? Number(day) : base.getDate());
    const iso = d.toISOString().slice(0, 10), amt = Number(val || 0);
    out.push({ installment: i + 1, date: iso, amount: amt, status: "pending", origin_date: iso, origin_amount: amt, origin: "contrato",
      paid_date: "", proof_url: "", proof_note: "", penalty_amount: 0, penalty_waived: false });
  }
  return out;
}
// dd/mm/aaaa a partir de ISO (yyyy-mm-dd)
function brDate(iso?: string) { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
// diferença em dias: b − a (positivo = b depois de a)
function diasEntre(aIso?: string, bIso?: string): number | null {
  if (!aIso || !bIso) return null;
  return Math.round((new Date(bIso + "T00:00:00").getTime() - new Date(aIso + "T00:00:00").getTime()) / 86400000);
}
// VEREDITO da parcela = cruzamento previsão (vencimento) × realizado (comprovante) + multa.
// tone: ok(pago em dia) | warn(pago com atraso) | bad(vencida sem pagto) | pending(a vencer) | muted(cancelada)
function vereditoParcela(p: any, todayIso: string): { tone: string; icon: string; text: string } {
  if ((p.status || "pending") === "cancelled") return { tone: "muted", icon: "—", text: "cancelada" };
  const venc = p.date, pago = p.status === "paid" || !!p.paid_date;
  if (pago) {
    const paidDate = p.paid_date || venc;
    const atraso = diasEntre(venc, paidDate);
    if (atraso != null && atraso > 0) {
      const multa = Number(p.penalty_amount) > 0 ? `multa ${money(Number(p.penalty_amount))} aplicada`
        : p.penalty_waived ? "você decidiu não aplicar multa" : "sem multa lançada";
      return { tone: "warn", icon: "🟠", text: `pago dia ${brDate(paidDate)} · ${atraso} dia(s) de atraso · ${multa}` };
    }
    return { tone: "ok", icon: "🟢", text: p.paid_date ? `pago em dia (${brDate(p.paid_date)})` : "pago em dia" };
  }
  const atrasoHoje = diasEntre(venc, todayIso);
  if (venc && atrasoHoje != null && atrasoHoje > 0) return { tone: "bad", icon: "🔴", text: `sem pagamento · vencida há ${atrasoHoje} dia(s)` };
  return { tone: "pending", icon: "⏳", text: venc ? `a vencer em ${brDate(venc)}` : "a vencer" };
}
const TONE_COLOR: Record<string, string> = { ok: "#1F8A5B", warn: "#B54708", bad: "#B42318", pending: "#475467", muted: "#98A2B3" };
const C_EMPTY = { id: "", vendor_name: "", description: "", category: "", currency: "BRL", amount_original: "", exchange_rate: "1", amount_brl: "", recurrence: "mensal", cost_type: "fixo", cost_nature: "recorrente", next_payment_date: "", is_active: true, notes: "" };
const T_EMPTY = { id: "", type: "income", category: "", amount: "", description: "", status: "completed", transaction_date: "", contact_name: "", payment_method: "", notes: "" };

const TABS = [
  { key: "pagar", label: "A Pagar" }, { key: "receber", label: "A Receber" },
  { key: "cobranca", label: "Cobrança" }, { key: "conciliacao", label: "Conciliação" },
  { key: "nfs", label: "NFs" }, { key: "tesouraria", label: "Tesouraria" },
  { key: "custos-ia", label: "Custos de IA" },
  { key: "antecipacoes", label: "Antecipações" }, { key: "transacoes", label: "Transações" },
];

export default function Financeiro() {
  const t = useT();
  // Ordenação clicável (regra global de UI). Tesouraria: por data desc (registro financeiro).
  const { sort: txSort, toggle: txToggle, sorted: txSorted } = useSort("data", -1);
  // Grupos A Pagar/A Receber: preserva o padrão anterior (maior total primeiro).
  const { sort: gSort, toggle: gToggle, sorted: gSorted } = useSort("total", -1);
  const { data, loading, reload } = useAsync(async () => {
    const [pay, rec, costs, tx, orgs] = await Promise.all([
      services.finance.accounts.list("payable"), services.finance.accounts.list("receivable"), services.finance.costs.list(), services.finance.transactions.list(), services.identity.organizations.listBrief(),
    ]);
    return { pay: (pay as any[]) ?? [], rec: (rec as any[]) ?? [], costs: (costs as any[]) ?? [], tx: (tx as any[]) ?? [], orgs: (orgs as any[]) ?? [] };
  }, []);
  const pay = data?.pay ?? [], rec = data?.rec ?? [], costs = data?.costs ?? [], tx = data?.tx ?? [], orgs = data?.orgs ?? [];
  // sugestões de empresa: clientes cadastrados + nomes já usados em lançamentos
  const companySuggestions = Array.from(new Set([...orgs.map((o: any) => o.name), ...[...pay, ...rec].map((r: any) => r.contact_name).filter(Boolean)])).sort();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") || "pagar"); // permite abrir direto numa aba (ex.: ?tab=receber)
  // A Receber "visão de recorrentes": só as contas que formam o MRR (parceladas ou recorrência mensal/anual).
  // É pra onde o card MRR da Visão geral aponta (?tab=receber&rec=1) — traça o número até a origem.
  const [recOnly, setRecOnly] = useState(sp.get("rec") === "1");
  const toggleRecOnly = () => setRecOnly((v) => {
    const nv = !v; const next = new URLSearchParams(sp);
    if (nv) next.set("rec", "1"); else next.delete("rec");
    setSp(next, { replace: true });
    return nv;
  });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Edição INLINE de UMA parcela direto na lista (sem abrir o modal). {acc:idConta, inst:nºparcela}
  const [parcEdit, setParcEdit] = useState<{ acc: string; inst: number } | null>(null);
  const [parcDraft, setParcDraft] = useState<any>(null);
  const fLabel: any = { display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 600, color: "var(--crasto-text-muted)" };
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };
  const [aOpen, setAOpen] = useState(false); const [af, setAf] = useState<any>({ ...A_EMPTY });
  const [clienteBusy, setClienteBusy] = useState(false);
  // Ao escolher o cliente, PUXA o cadastro (razão social, CNPJ, contato) e preenche sozinho —
  // o Carlos só confere e digita o que é do CONTRATO (valor/parcelas). Sem cliente = limpa.
  async function selecionarCliente(orgId: string) {
    if (!orgId) { setAf((s: any) => ({ ...s, organization_id: "", cnpj: "" })); return; }
    const base = orgs.find((x: any) => x.id === orgId);
    setAf((s: any) => ({ ...s, organization_id: orgId, contact_name: base ? base.name : s.contact_name }));
    setClienteBusy(true);
    try {
      const o: any = await services.identity.organizations.getById(orgId).catch(() => null);
      const cnpjs: any[] = await services.identity.cnpjs.listByOrg(orgId).catch(() => []);
      const cnpj = (cnpjs && cnpjs[0]?.cnpj) || o?.cnpj || "";
      setAf((s: any) => ({
        ...s,
        contact_name: o?.name || base?.name || s.contact_name,
        cnpj,
        // contato: dono/responsável ou e-mail do cadastro (o que existir), sem sobrescrever se já digitou.
        contact_reference: s.contact_reference || o?.owner_name || o?.email || "",
        // descrição padrão se ainda vazia — economiza digitação.
        description: s.description || t("Contrato de prestação de serviços de IA — {n}", { n: o?.name || base?.name || "" }),
      }));
    } finally { setClienteBusy(false); }
  }
  const [cOpen, setCOpen] = useState(false); const [cf, setCf] = useState<any>({ ...C_EMPTY });
  const [tOpen, setTOpen] = useState(false); const [tf, setTf] = useState<any>({ ...T_EMPTY });

  const rem = (r: any) => Number(r.amount || 0) - Number(r.amount_paid || 0);
  // Normaliza qualquer data para "YYYY-MM-DD". O Postgres devolve `date` como timestamp ISO
  // no JSON; sem cortar, `x + "T00:00:00"` virava "Invalid Date" na tela.
  const ymd = (x: any) => (x ? String(x).slice(0, 10) : "");
  // Parcelas de uma conta (payment_schedule). Custo/conta sem parcelas → [].
  const parcelas = (i: any): any[] => (Array.isArray(i?.payment_schedule) ? i.payment_schedule : []);
  const parcRem = (p: any) => Number(p.amount || 0) - Number(p.amount_paid || 0);
  // Valor de um item que casa com um teste de data — SEMPRE por parcela. Uma conta parcelada
  // só está "vencida" nas parcelas NÃO pagas com data no passado, nunca no total do contrato
  // (era o bug: pagava a parcela em atraso e a conta seguia "Vencido" com o valor cheio).
  // Sem parcelas (custo/conta simples), cai na data/valor da própria conta.
  const valorPorData = (i: any, casa: (d: string, hoje: string) => boolean): number => {
    const hoje = today(), ps = parcelas(i);
    if (ps.length) return ps.filter((p) => p.status !== "paid" && ymd(p.date) && casa(ymd(p.date), hoje)).reduce((a, p) => a + parcRem(p), 0);
    return (i.status === "pending" || i.status === "partial") && ymd(i.due_date) && casa(ymd(i.due_date), hoje) ? rem(i) : 0;
  };
  const vencidoDe = (i: any) => valorPorData(i, (d, h) => d < h);
  const hojeDe = (i: any) => valorPorData(i, (d, h) => d === h);
  const avencerDe = (i: any) => valorPorData(i, (d, h) => d > h);
  const isOverdue = (i: any) => vencidoDe(i) > 0;
  // Próximo vencimento REAL: a parcela não paga mais próxima (ou a data da conta simples).
  // É o que a coluna Vencimento deve mostrar — não a 1ª parcela (que pode já ter sido paga).
  const proxVenc = (i: any): string | null => {
    const ps = parcelas(i);
    const ds = ps.length
      ? ps.filter((p) => p.status !== "paid" && ymd(p.date)).map((p) => ymd(p.date))
      : (i.status !== "paid" && i.status !== "cancelled" && ymd(i.due_date) ? [ymd(i.due_date)] : []);
    return ds.sort()[0] || null;
  };
  // KPIs topo
  const aPagar = pay.filter((r) => r.status !== "paid" && r.status !== "cancelled").reduce((a, r) => a + rem(r), 0);
  const aReceber = rec.filter((r) => r.status !== "paid" && r.status !== "cancelled").reduce((a, r) => a + rem(r), 0);
  const inadimplencia = rec.reduce((a, r) => a + vencidoDe(r), 0);
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
      const due = list.map(proxVenc).filter(Boolean).sort()[0] || null; // próximo venc. real (parcela não paga)
      const payd = list.map((i) => i.payment_date).filter(Boolean).sort().slice(-1)[0] || null;
      return { name, list, total, pago, restante: total - pago, tipo, status, due, payd };
    }).sort((a, b) => b.total - a.total);
  }
  const payItems = [...pay.map(acctToItem), ...costs.map(costToItem)];
  // Conta recorrente = a que compõe o MRR. Espelha `mensalDe` da Visão geral: parcelada, ou recorrência mensal/anual.
  const isRecurring = (a: any) => (Array.isArray(a?.payment_schedule) && a.payment_schedule.length > 0) || ["monthly", "mensal", "yearly", "anual"].includes(a?.recurrence);
  const recSource = tab === "receber" && recOnly ? rec.filter(isRecurring) : rec;
  const groups = tab === "pagar" ? buildGroups(payItems) : tab === "receber" ? buildGroups(recSource.map(acctToItem)) : [];

  // resumo A Pagar (custos)
  const activeCosts = costs.filter((c) => c.is_active);
  const totalMensal = activeCosts.filter((c) => c.recurrence === "mensal").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const totalAno = totalMensal * 12 + activeCosts.filter((c) => c.recurrence === "anual").reduce((a, c) => a + Number(c.amount_brl || 0), 0) + activeCosts.filter((c) => c.recurrence === "pontual").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const consumo = pay.filter((r) => r.expense_type === "consumo");
  const revenda = pay.filter((r) => r.expense_type === "revenda");
  // status cards (do lado ativo)
  const curItems = tab === "pagar" ? payItems : recSource.map(acctToItem);
  const stVencidos = curItems.reduce((a, i) => a + vencidoDe(i), 0);   // só as parcelas realmente vencidas
  const stHoje = curItems.reduce((a, i) => a + hojeDe(i), 0);
  const stAvencer = curItems.reduce((a, i) => a + avencerDe(i), 0);
  const stPagos = curItems.reduce((a, i) => a + Number(i.amount_paid || 0), 0);
  const stTotal = curItems.reduce((a, i) => a + Number(i.amount || 0), 0);

  const stLabel = (s: string) => (({ pending: t("Pendente"), partial: t("Parcial"), paid: t("Pago"), overdue: t("Vencido"), cancelled: t("Cancelada") } as any)[s] || s);
  const stTone = (s: string) => (s === "paid" ? "ok" : s === "overdue" ? "warn" : s === "cancelled" ? "mute" : "info");

  // handlers conta
  function newAccount(type: string) { setAf({ ...A_EMPTY, account_type: type, status: "pending" }); setAOpen(true); }
  function editItem(i: any) {
    if (i._kind === "cost") { const c = costs.find((x) => x.id === i.id); setCf({ id: c.id, vendor_name: c.vendor_name || "", description: c.description || "", category: c.category || "", currency: c.currency || "BRL", amount_original: String(c.amount_original ?? ""), exchange_rate: String(c.exchange_rate ?? "1"), amount_brl: String(c.amount_brl ?? ""), recurrence: c.recurrence || "mensal", cost_type: c.cost_type || "fixo", cost_nature: c.cost_nature || "recorrente", next_payment_date: ymd(c.next_payment_date), is_active: !!c.is_active, notes: c.notes || "" }); setCOpen(true); }
    else { setAf({
      id: i.id, account_type: i.account_type,
      contact_name: i.contact_name || "", contact_reference: i.contact_reference || "", organization_id: i.organization_id || "", cnpj: i.cnpj || "",
      description: i.description || "", services: Array.isArray(i.services) ? i.services : [],
      contract_validity_value: String(i.contract_validity_value ?? ""), contract_validity_unit: i.contract_validity_unit || "months", contract_total: String(i.contract_total ?? i.amount ?? ""), contract_signed_date: ymd(i.contract_signed_date),
      payment_installments: String(i.payment_installments ?? ""), installment_amount: String(Array.isArray(i.payment_schedule) && i.payment_schedule[0] ? i.payment_schedule[0].amount : ""),
      payment_schedule: Array.isArray(i.payment_schedule) ? i.payment_schedule.map((p: any) => ({ ...p, date: ymd(p.date), origin_date: p.origin_date ? ymd(p.origin_date) : ymd(p.date), paid_date: p.paid_date ? ymd(p.paid_date) : "", proof_url: p.proof_url || "", proof_note: p.proof_note || "", penalty_amount: Number(p.penalty_amount || 0), penalty_waived: !!p.penalty_waived })) : [],
      due_date: ymd(i.due_date) || (Array.isArray(i.payment_schedule) && i.payment_schedule[0] ? ymd(i.payment_schedule[0].date) : ""), payment_day_of_month: String(i.payment_day_of_month ?? ""), payment_method: i.payment_method || "PIX",
      expense_type: i.expense_type || "consumo", category: i.category || "", status: i.status || "pending", payment_reason: i.payment_reason || "",
      amount: String(i.amount ?? ""), amount_paid: String(i.amount_paid ?? ""), payment_date: i.payment_date || "", recurrence: i.recurrence || "", invoice_number: i.invoice_number || "", notes: i.notes || "",
    }); setAOpen(true); }
  }
  // serviços do fornecedor (lista repetível)
  const addService = () => setAf((s: any) => ({ ...s, services: [...(s.services || []), { name: "", description: "", list_price: "", special_price: "" }] }));
  const setService = (idx: number, patch: any) => setAf((s: any) => ({ ...s, services: s.services.map((sv: any, i: number) => i === idx ? { ...sv, ...patch } : sv) }));
  const rmService = (idx: number) => setAf((s: any) => ({ ...s, services: s.services.filter((_: any, i: number) => i !== idx) }));
  // recalcula valor da parcela quando muda total x nº de parcelas
  const setAcc = (patch: any) => setAf((s: any) => {
    const next = { ...s, ...patch };
    if (("contract_total" in patch || "payment_installments" in patch)) {
      const tot = Number(next.contract_total || 0), n = Number(next.payment_installments || 0);
      if (tot > 0 && n > 0) next.installment_amount = (tot / n).toFixed(2);
    }
    // Mexeu em algo que define as parcelas → REGERA a tabela editável (baseline = "contrato").
    if ("payment_installments" in patch || "installment_amount" in patch || "due_date" in patch || "payment_day_of_month" in patch || "contract_total" in patch) {
      next.payment_schedule = buildSchedule(Number(next.payment_installments || 0), next.due_date, next.payment_day_of_month, Number(next.installment_amount || 0));
    }
    return next;
  });
  // Edita UMA parcela à mão (data/valor/status). A origem (origin_date/origin_amount) fica intacta.
  const setSchedRow = (idx: number, patch: any) => setAf((s: any) => ({
    ...s, payment_schedule: (s.payment_schedule || []).map((p: any, i: number) => i === idx ? { ...p, ...patch } : p),
  }));
  const previewSchedule = buildSchedule(Number(af.payment_installments || 0), af.due_date, af.payment_day_of_month, Number(af.installment_amount || 0));
  async function saveAccount() {
    if (!af.contact_name.trim() && !af.description.trim()) { flash(t("Informe a empresa ou a descrição.")); return; }
    const inst = Number(af.payment_installments || 0), val = Number(af.installment_amount || 0);
    const total = Number(af.contract_total || 0) || (inst > 0 ? inst * val : val) || Number(af.amount || 0);
    if (!total) { flash(t("Informe o total do contrato ou o valor da parcela.")); return; }
    // Usa a tabela EDITADA (com as origens do contrato) se houver; senão gera do gerador.
    const schedule = (Array.isArray(af.payment_schedule) && af.payment_schedule.length)
      ? af.payment_schedule.map((p: any) => ({ ...p, amount: Number(p.amount || 0), penalty_amount: Number(p.penalty_amount || 0), penalty_waived: !!p.penalty_waived, paid_date: p.paid_date || "" }))
      : buildSchedule(inst, af.due_date, af.payment_day_of_month, val);
    // "Pago" = soma das parcelas marcadas pagas (se a tabela existe); senão o campo status.
    const paidFromSchedule = schedule.filter((p: any) => p.status === "paid").reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const paid = schedule.length ? paidFromSchedule : (af.status === "paid" ? total : Number(af.amount_paid || 0));
    setBusy(true);
    try {
      await services.finance.accounts.save({
        id: af.id, account_type: af.account_type, contact_name: af.contact_name, contact_reference: af.contact_reference, organization_id: af.organization_id, cnpj: af.cnpj,
        description: af.description, services: af.services || [], category: af.category, expense_type: af.expense_type, status: af.status,
        contract_validity_value: af.contract_validity_value, contract_validity_unit: af.contract_validity_unit, contract_total: total, contract_signed_date: af.contract_signed_date,
        payment_installments: af.payment_installments, payment_day_of_month: af.payment_day_of_month, payment_method: af.payment_method, payment_reason: af.payment_reason,
        due_date: af.due_date || (schedule[0]?.date ?? ""), payment_schedule: schedule, amount: total, amount_paid: paid, recurrence: af.recurrence, invoice_number: af.invoice_number, notes: af.notes,
      });
      setAOpen(false); reload(); flash(t("Conta salva ✓"));
    } catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
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
  // baixa/reabre uma parcela do payment_schedule e recomputa amount_paid + status da conta
  async function toggleInstallment(i: any, num: number) {
    const cur = Array.isArray(i.payment_schedule) ? i.payment_schedule : [];
    const sched = cur.map((p: any) => p.installment === num
      ? (p.status === "paid" ? { ...p, status: "pending", amount_paid: 0, paid_at: null } : { ...p, status: "paid", amount_paid: Number(p.amount || 0), paid_at: new Date().toISOString() })
      : p);
    const paid = sched.filter((p: any) => p.status === "paid").reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const total = Number(i.amount || 0) || sched.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const status = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "pending";
    const lastPaid = sched.filter((p: any) => p.status === "paid").map((p: any) => p.date).sort().slice(-1)[0] || null;
    setBusy(true);
    try { await services.finance.accounts.save({ id: i.id, payment_schedule: sched, amount_paid: paid, status, payment_date: status === "paid" ? (lastPaid || today()) : "" }); reload(); flash(t("Parcela atualizada ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  // abre o editor inline de uma parcela (clicando na linha) — carrega o rascunho
  function openParc(i: any, p: any) {
    setParcEdit({ acc: i.id, inst: p.installment });
    setParcDraft({ installment: p.installment, date: ymd(p.date), amount: String(p.amount ?? ""), status: p.status || "pending",
      paid_date: p.paid_date ? ymd(p.paid_date) : "", proof_note: p.proof_note || "", proof_url: p.proof_url || "",
      penalty_amount: String(p.penalty_amount ?? ""), penalty_waived: !!p.penalty_waived });
  }
  const setParc = (patch: any) => setParcDraft((d: any) => ({ ...d, ...patch }));
  // salva SÓ a parcela editada inline e recomputa a conta (mesma lógica do toggleInstallment)
  async function saveParcInline(i: any) {
    const d = parcDraft; if (!d) return;
    const cur = Array.isArray(i.payment_schedule) ? i.payment_schedule : [];
    const sched = cur.map((p: any) => p.installment === d.installment ? {
      ...p, date: d.date, amount: Number(d.amount || 0), status: d.status,
      paid_date: d.paid_date || "", proof_note: d.proof_note || "", proof_url: d.proof_url || "",
      penalty_amount: Number(d.penalty_amount || 0), penalty_waived: !!d.penalty_waived,
      amount_paid: d.status === "paid" ? Number(d.amount || 0) : 0,
      paid_at: d.status === "paid" ? (p.paid_at || new Date().toISOString()) : null,
    } : p);
    const paid = sched.filter((p: any) => p.status === "paid").reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const total = Number(i.amount || 0) || sched.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const status = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "pending";
    const lastPaid = sched.filter((p: any) => p.status === "paid").map((p: any) => p.paid_date || p.date).filter(Boolean).sort().slice(-1)[0] || null;
    setBusy(true);
    try { await services.finance.accounts.save({ id: i.id, payment_schedule: sched, amount_paid: paid, status, payment_date: status === "paid" ? (lastPaid || today()) : "" }); reload(); setParcEdit(null); setParcDraft(null); flash(t("Parcela atualizada ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }

  // handlers tesouraria
  function newTx(type: string) { setTf({ ...T_EMPTY, type, transaction_date: today() }); setTOpen(true); }
  function editTx(r: any) { setTf({ id: r.id, type: r.type, category: r.category || "", amount: String(r.amount ?? ""), description: r.description || "", status: r.status || "completed", transaction_date: ymd(r.transaction_date) || today(), contact_name: r.contact_name || "", payment_method: r.payment_method || "", notes: r.notes || "" }); setTOpen(true); }
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

      {loading && tab !== "custos-ia" ? <Empty>Carregando…</Empty> : tab === "custos-ia" ? (
        <CustoIA embedded />
      ) : tab === "tesouraria" ? (<>
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
            <thead><tr>
              <SortTh col="data" sort={txSort} toggle={txToggle}>{t("Data")}</SortTh>
              <SortTh col="descricao" sort={txSort} toggle={txToggle}>{t("Descrição")}</SortTh>
              <SortTh col="categoria" sort={txSort} toggle={txToggle}>{t("Categoria")}</SortTh>
              <SortTh col="tipo" sort={txSort} toggle={txToggle}>{t("Tipo")}</SortTh>
              <SortTh col="valor" sort={txSort} toggle={txToggle} right>{t("Valor")}</SortTh>
              <SortTh col="status" sort={txSort} toggle={txToggle}>{t("Status")}</SortTh>
              <th></th>
            </tr></thead>
            <tbody>
              {txFiltered.length === 0 ? <tr><td colSpan={7} style={{ color: "var(--crasto-text-muted)", padding: 14 }}>{t("Nada por aqui ainda.")}</td></tr> : txSorted(txFiltered, (r, col) => {
                switch (col) {
                  case "data": return ymd(r.transaction_date);
                  case "descricao": return r.description || "";
                  case "categoria": return r.category || "";
                  case "tipo": return r.type;
                  case "valor": return Number(r.amount || 0);
                  case "status": return r.status;
                  default: return ymd(r.transaction_date);
                }
              }).map((r) => (
                <tr key={r.id}>
                  <td className="tnum">{r.transaction_date ? new Date(ymd(r.transaction_date) + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
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
          {tab === "receber" && <button className={"crasto-btn crasto-btn--sm " + (recOnly ? "crasto-btn--primary" : "crasto-btn--ghost")} onClick={toggleRecOnly} title={t("Mostrar só as contas recorrentes — a origem do MRR")} aria-pressed={recOnly}><span className="crasto-btn__icon"><Repeat size={14} /></span><span className="crasto-btn__label">{t("Só recorrentes")}{recOnly ? " ✓" : ""}</span></button>}
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
            <thead><tr>
              <th></th>
              <SortTh col="name" sort={gSort} toggle={gToggle}>{t("Empresa")}</SortTh>
              <SortTh col="tipo" sort={gSort} toggle={gToggle}>{t("Tipo")}</SortTh>
              <SortTh col="due" sort={gSort} toggle={gToggle}>{t("Vencimento")}</SortTh>
              <SortTh col="total" sort={gSort} toggle={gToggle} right>{t("Total")}</SortTh>
              <SortTh col="pago" sort={gSort} toggle={gToggle} right>{t("Já Pago")}</SortTh>
              <SortTh col="restante" sort={gSort} toggle={gToggle} right>{t("Restante")}</SortTh>
              <SortTh col="status" sort={gSort} toggle={gToggle}>{t("Status")}</SortTh>
            </tr></thead>
            <tbody>
              {groups.length === 0 ? <tr><td colSpan={8} style={{ color: "var(--crasto-text-muted)", padding: 14 }}>{t("Nada por aqui ainda.")}</td></tr> : gSorted(groups, (g, col) => {
                switch (col) {
                  case "name": return g.name;
                  case "tipo": return g.tipo;
                  case "due": return g.due || "";
                  case "total": return g.total;
                  case "pago": return g.pago;
                  case "restante": return g.restante;
                  case "status": return g.status;
                  default: return g.total;
                }
              }).map((g) => (
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
                  {expanded[g.name] && g.list.map((i: any) => {
                    const parc = i._kind === "account" && Array.isArray(i.payment_schedule) ? i.payment_schedule : [];
                    const venc = proxVenc(i);
                    return (
                    <Fragment key={i.id}>
                    <tr className="finrow">
                      <td></td>
                      <td colSpan={2}><div className="nm" style={{ fontSize: 13 }}>{i.description || i.contact_name}</div><div className="mt">{[i.category, i._kind === "cost" ? t("Custo") : t("Conta"), parc.length ? t("{n} parcelas", { n: parc.length }) : ""].filter(Boolean).join(" · ")}</div></td>
                      <td className="tnum">{venc ? new Date(venc + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{money(Number(i.amount || 0))}</td>
                      <td className="tnum" style={{ textAlign: "right", color: "#1F8A5B" }}>{money(Number(i.amount_paid || 0))}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{money(rem(i))}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          {i.status !== "paid" && parc.length === 0 && <button className="icobtn" title={t("Marcar como paga")} onClick={(e) => { e.stopPropagation(); markPaid(i); }}><CheckCircle2 size={13} /></button>}
                          <button className="icobtn" title={t("Editar")} onClick={(e) => { e.stopPropagation(); editItem(i); }}><Pencil size={13} /></button>
                          <button className="icobtn rm" title={t("Excluir")} onClick={(e) => { e.stopPropagation(); delItem(i); }}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                    {parc.map((p: any) => {
                      const isEd = parcEdit != null && parcEdit.acc === i.id && parcEdit.inst === p.installment;
                      const v = vereditoParcela({ ...p, date: ymd(p.date), paid_date: p.paid_date ? ymd(p.paid_date) : "" }, new Date().toISOString().slice(0, 10));
                      return (
                      <Fragment key={i.id + "-p" + p.installment}>
                      <tr className={"finrow finparc" + (isEd ? " is-editing" : "")} style={{ cursor: "pointer" }} title={t("Clique para editar esta parcela")} onClick={() => (isEd ? (setParcEdit(null), setParcDraft(null)) : openParc(i, p))}>
                        <td></td>
                        <td colSpan={2}>
                          <div className="mt" style={{ paddingLeft: 12 }}>{t("Parcela {k}/{n}", { k: p.installment, n: parc.length })} <Pencil size={11} style={{ opacity: .4, verticalAlign: "-1px" }} /></div>
                          <div style={{ paddingLeft: 12, color: TONE_COLOR[v.tone], fontSize: 11, fontWeight: 600 }}>{v.icon} {v.text}</div>
                        </td>
                        <td className="tnum">{p.date ? new Date(ymd(p.date) + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="tnum" style={{ textAlign: "right" }}>{money(Number(p.amount || 0))}</td>
                        <td className="tnum" style={{ textAlign: "right", color: "#1F8A5B" }}>{money(p.status === "paid" ? Number(p.amount || 0) : 0)}</td>
                        <td className="tnum" style={{ textAlign: "right" }}>{money(p.status === "paid" ? 0 : Number(p.amount || 0))}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <Pill tone={p.status === "paid" ? "ok" : "info"}>{p.status === "paid" ? t("Paga") : t("Pendente")}</Pill>
                            <button className="icobtn" title={p.status === "paid" ? t("Reabrir parcela") : t("Baixar parcela")} onClick={(e) => { e.stopPropagation(); toggleInstallment(i, p.installment); }}><CheckCircle2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                      {isEd && parcDraft && (
                        <tr className="finparc-edit"><td></td><td colSpan={7} style={{ background: "var(--crasto-surface-2, #F7F9FC)", padding: "10px 12px", borderRadius: 8 }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                            <label style={fLabel}>{t("Vencimento")}<input type="date" value={parcDraft.date} onChange={(e) => setParc({ date: e.target.value })} /></label>
                            <label style={fLabel}>{t("Valor (R$)")}<input type="number" step="0.01" value={parcDraft.amount} onChange={(e) => setParc({ amount: e.target.value })} style={{ width: 110 }} /></label>
                            <label style={fLabel}>{t("Status")}<select value={parcDraft.status} onChange={(e) => setParc({ status: e.target.value })}><option value="pending">{t("Pendente")}</option><option value="paid">{t("Pago")}</option><option value="cancelled">{t("Cancelada")}</option></select></label>
                            <label style={fLabel}>{t("Data pagto")}<input type="date" value={parcDraft.paid_date} onChange={(e) => setParc({ paid_date: e.target.value })} /></label>
                            <label style={fLabel}>{t("Comprovante")}<DocField prefix="financeiro" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic" label={t("Anexar comprovante")}
                              path={parcDraft.proof_url} name={parcDraft.proof_note} onChange={(path, name) => setParc({ proof_url: path, proof_note: name })} /></label>
                            <label style={fLabel}>{t("Multa (R$)")}<input type="number" step="0.01" value={parcDraft.penalty_amount} onChange={(e) => setParc({ penalty_amount: e.target.value })} style={{ width: 90 }} /></label>
                            <label style={{ ...fLabel, flexDirection: "row", alignItems: "center", gap: 4 }}><input type="checkbox" checked={!!parcDraft.penalty_waived} onChange={(e) => setParc({ penalty_waived: e.target.checked })} /> {t("dispensar multa")}</label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={() => saveParcInline(i)}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button>
                              <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => { setParcEdit(null); setParcDraft(null); }}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
                            </div>
                          </div>
                          {/* preview do veredito enquanto edita */}
                          {(() => { const vv = vereditoParcela({ date: parcDraft.date, paid_date: parcDraft.paid_date, status: parcDraft.status, penalty_amount: parcDraft.penalty_amount, penalty_waived: parcDraft.penalty_waived }, new Date().toISOString().slice(0, 10)); return <div style={{ marginTop: 8, fontSize: 12, color: TONE_COLOR[vv.tone], fontWeight: 600 }}>{vv.icon} {vv.text}</div>; })()}
                        </td></tr>
                      )}
                      </Fragment>
                      );
                    })}
                    </Fragment>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {/* Modal conta (lançamento rico) */}
      <Modal title={(af.id ? t("Editar Lançamento") : t("Novo Lançamento")) + " — " + (af.account_type === "payable" ? t("A Pagar") : t("A Receber"))} open={aOpen} onClose={() => setAOpen(false)} wide fullscreen
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setAOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveAccount}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>

        {/* Identificação */}
        <div className="finsec">
          <div className="finsec-h">{af.account_type === "payable" ? t("Identificação do Fornecedor") : t("Identificação do Cliente")}</div>
          <Field label={t("Cliente cadastrado no sistema")}>
            <select value={af.organization_id} onChange={(e) => selecionarCliente(e.target.value)}>
              <option value="">{t("— avulso / não cadastrado —")}</option>
              {orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {clienteBusy && <small className="fhint">{t("Puxando o cadastro do cliente…")}</small>}
            {!clienteBusy && af.organization_id && (
              <small className="fhint">
                ✓ {t("Cadastro preenchido automaticamente")}{af.cnpj ? ` · CNPJ ${af.cnpj}` : ""}.
                {af.account_type === "receivable" ? " " + t("Esta cobrança aparece como fatura no portal do cliente.") : ""}
              </small>
            )}
            {!af.organization_id && af.account_type === "receivable" && <small className="fhint">{t("Sem cliente, a cobrança fica só no admin — não aparece em nenhum portal.")}</small>}
          </Field>
          <div className="grid2">
            <Field label={t("Razão Social / Empresa") + " *"}>
              <input list="fin-companies" value={af.contact_name} onChange={(e) => setAf({ ...af, contact_name: e.target.value })} placeholder={t("Digite para buscar (ex: SR)")} />
              <datalist id="fin-companies">{companySuggestions.map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field label={t("CNPJ")}>
              <input value={af.cnpj} onChange={(e) => setAf({ ...af, cnpj: e.target.value })} placeholder={t("Preenchido do cadastro")} />
            </Field>
          </div>
          <div className="grid2">
            <Field label={t("Contato / Referência")}>
              <input value={af.contact_reference} onChange={(e) => setAf({ ...af, contact_reference: e.target.value })} placeholder={t("Ex: Responsável, e-mail ou telefone")} />
            </Field>
            <Field label={t("Descrição dos Serviços")}><input value={af.description} onChange={(e) => setAf({ ...af, description: e.target.value })} placeholder={t("Resumo geral dos serviços contratados")} /></Field>
          </div>
        </div>

        {/* Serviços do fornecedor */}
        <div className="finsec">
          <div className="finsec-h">{t("Serviços do Fornecedor")}<button type="button" className="addlink" onClick={addService}><Plus size={13} /> {t("Adicionar serviço")}</button></div>
          {(af.services || []).length === 0 ? <div className="fhint" style={{ padding: "2px 0 4px" }}>{t("Nenhum serviço adicionado.")}</div> : (af.services || []).map((sv: any, idx: number) => (
            <div key={idx} className="svcline">
              <div className="grid2">
                <Field label={t("Serviço")}><input value={sv.name} onChange={(e) => setService(idx, { name: e.target.value })} /></Field>
                <Field label={t("Descrição")}><input value={sv.description} onChange={(e) => setService(idx, { description: e.target.value })} /></Field>
              </div>
              <div className="grid3">
                <Field label={t("Preço de tabela (R$)")}><input type="number" step="0.01" value={sv.list_price} onChange={(e) => setService(idx, { list_price: e.target.value })} /></Field>
                <Field label={t("Preço especial (R$)")}><input type="number" step="0.01" value={sv.special_price} onChange={(e) => setService(idx, { special_price: e.target.value })} /></Field>
                <div style={{ display: "flex", alignItems: "flex-end" }}><button type="button" className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => rmService(idx)}><span className="crasto-btn__icon"><Trash2 size={13} /></span><span className="crasto-btn__label">{t("Remover")}</span></button></div>
              </div>
            </div>
          ))}
        </div>

        {/* Vigência do contrato */}
        <div className="finsec">
          <div className="finsec-h">{t("Vigência do Contrato")}</div>
          <div className="grid3">
            <Field label={t("Data de assinatura do contrato")}><input type="date" value={af.contract_signed_date} onChange={(e) => setAf({ ...af, contract_signed_date: e.target.value })} /></Field>
            <Field label={t("Duração")}><input type="number" value={af.contract_validity_value} onChange={(e) => setAf({ ...af, contract_validity_value: e.target.value })} placeholder="12" /></Field>
            <Field label={t("Unidade")}><select value={af.contract_validity_unit} onChange={(e) => setAf({ ...af, contract_validity_unit: e.target.value })}>{UNITS.map((u) => <option key={u.v} value={u.v}>{t(u.l)}</option>)}</select></Field>
          </div>
          <div className="grid3">
            <Field label={t("Total do Contrato (R$)")}><input type="number" step="0.01" value={af.contract_total} onChange={(e) => setAcc({ contract_total: e.target.value })} /></Field>
            {af.contract_signed_date && <div className="fhint" style={{ alignSelf: "end", paddingBottom: 8 }}>{t("Contrato assinado em")} {brDate(af.contract_signed_date)} — {t("previsão de recebimento nas datas das parcelas abaixo.")}</div>}
          </div>
        </div>

        {/* Prazo de pagamento */}
        <div className="finsec">
          <div className="finsec-h">{t("Prazo de Pagamento")}</div>
          <div className="grid2">
            <Field label={t("Nº de Parcelas")}><input type="number" value={af.payment_installments} onChange={(e) => setAcc({ payment_installments: e.target.value })} placeholder="Ex: 5" /></Field>
            <Field label={t("Valor da Parcela (R$)")}><input type="number" step="0.01" value={af.installment_amount} onChange={(e) => setAf({ ...af, installment_amount: e.target.value })} /></Field>
          </div>
          <div className="grid3">
            <Field label={t("1ª Parcela (Vencimento)")}><input type="date" value={af.due_date} onChange={(e) => setAf({ ...af, due_date: e.target.value })} /></Field>
            <Field label={t("Dia de vencimento")}><input type="number" min="1" max="31" value={af.payment_day_of_month} onChange={(e) => setAf({ ...af, payment_day_of_month: e.target.value })} placeholder="Ex: 10" /></Field>
            <Field label={t("Forma de Pagamento")}><select value={af.payment_method} onChange={(e) => setAf({ ...af, payment_method: e.target.value })}>{PAYMETHODS.map((m) => <option key={m} value={m}>{t(m)}</option>)}</select></Field>
          </div>
          {/* TABELA DE PARCELAS — editável linha a linha. Cada parcela guarda a ORIGEM (o que veio
              do contrato); ao mudar data/valor à mão, aparece o "veio do contrato: X" (log). */}
          {(af.payment_schedule || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="finsec-h" style={{ fontSize: 13 }}>{t("Parcelas")} <span className="fhint" style={{ fontWeight: 400 }}>· {t("edite data, valor ou status de cada parcela. O que veio do contrato fica registrado.")}</span></div>
              <div className="tbl-wrap">
                <table className="tbl parc-tbl">
                  <thead><tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>{t("Vencimento")}</th>
                    <th style={{ textAlign: "right" }}>{t("Valor (R$)")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Data pagto")}</th>
                    <th>{t("Comprovante")}</th>
                    <th style={{ textAlign: "right" }}>{t("Multa (R$)")}</th>
                    <th style={{ minWidth: 230 }}>{t("Diagnóstico")}</th>
                  </tr></thead>
                  <tbody>
                    {(af.payment_schedule as any[]).map((p, idx) => {
                      const dataMudou = p.origin_date && p.date && p.date !== p.origin_date;
                      const valorMudou = p.origin_amount != null && Number(p.amount) !== Number(p.origin_amount);
                      const editado = dataMudou || valorMudou;
                      return (
                        <tr key={idx} style={editado ? { background: "rgba(181,71,8,.05)" } : undefined}>
                          <td className="tnum">{p.installment ?? idx + 1}ª</td>
                          <td><input type="date" value={p.date || ""} onChange={(e) => setSchedRow(idx, { date: e.target.value })} style={{ width: 150 }} /></td>
                          <td style={{ textAlign: "right" }}><input type="number" step="0.01" value={p.amount ?? ""} onChange={(e) => setSchedRow(idx, { amount: e.target.value })} style={{ width: 110, textAlign: "right" }} /></td>
                          <td>
                            <select value={p.status || "pending"} onChange={(e) => setSchedRow(idx, { status: e.target.value })}>
                              <option value="pending">{t("Pendente")}</option>
                              <option value="paid">{t("Pago")}</option>
                              <option value="cancelled">{t("Cancelada")}</option>
                            </select>
                          </td>
                          {/* COMPROVANTE: data real do pagamento + ANEXO do documento (R2) */}
                          <td><input type="date" value={p.paid_date || ""} onChange={(e) => setSchedRow(idx, { paid_date: e.target.value })} style={{ width: 140 }} /></td>
                          <td>
                            <DocField prefix="financeiro" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic" label={t("Anexar comprovante")}
                              path={p.proof_url} name={p.proof_note} onChange={(path, name) => setSchedRow(idx, { proof_url: path, proof_note: name })} />
                          </td>
                          {/* MULTA: valor + "dispensar" (houve atraso mas você decidiu não cobrar) */}
                          <td style={{ textAlign: "right" }}>
                            <input type="number" step="0.01" value={p.penalty_amount ?? ""} onChange={(e) => setSchedRow(idx, { penalty_amount: e.target.value })} placeholder="0" style={{ width: 84, textAlign: "right", display: "block", marginBottom: 3 }} />
                            <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}><input type="checkbox" checked={!!p.penalty_waived} onChange={(e) => setSchedRow(idx, { penalty_waived: e.target.checked })} /> {t("dispensar")}</label>
                          </td>
                          <td style={{ fontSize: 11, minWidth: 230 }}>
                            {(() => { const v = vereditoParcela(p, new Date().toISOString().slice(0, 10)); return (
                              <div style={{ color: TONE_COLOR[v.tone], fontWeight: 600 }}>{v.icon} {v.text}</div>
                            ); })()}
                            <div style={{ marginTop: 2 }}>
                              {editado ? (
                                <span style={{ color: "#B54708" }}>
                                  ✏️ {t("ajustado à mão")}. {t("Contrato:")} {dataMudou ? brDate(p.origin_date) : ""}{dataMudou && valorMudou ? " · " : ""}{valorMudou ? money(Number(p.origin_amount)) : ""}
                                </span>
                              ) : (
                                <span className="muted">📄 {t("conforme o contrato")}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* RESUMO DE CONCILIAÇÃO — previsto (contrato) × realizado (comprovantes) */}
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const sch = af.payment_schedule as any[];
                const pago = (p: any) => p.status === "paid" || !!p.paid_date;
                const previsto = sch.reduce((a, p) => a + Number(p.amount || 0), 0);
                const pagas = sch.filter(pago);
                const recebido = pagas.reduce((a, p) => a + Number(p.amount || 0), 0);
                const atrasadas = sch.filter((p) => !pago(p) && p.status !== "cancelled" && p.date && p.date < today);
                const emAtraso = atrasadas.reduce((a, p) => a + Number(p.amount || 0), 0);
                const aVencer = sch.filter((p) => !pago(p) && p.status !== "cancelled" && (!p.date || p.date >= today));
                const multaAplicada = sch.reduce((a, p) => a + Number(p.penalty_amount || 0), 0);
                const dispensadas = pagas.filter((p) => { const at = diasEntre(p.date, p.paid_date || p.date); return at != null && at > 0 && p.penalty_waived; }).length;
                return (
                  <div className="fhint" style={{ paddingTop: 6, lineHeight: 1.7 }}>
                    {af.contract_signed_date && <>📄 {t("Contrato assinado em")} <b>{brDate(af.contract_signed_date)}</b> · </>}
                    {t("{n} parcelas", { n: sch.length })} · {t("previsto")} <b>{money(previsto)}</b> · <span style={{ color: TONE_COLOR.ok }}>{t("recebido")} {money(recebido)} ({pagas.length})</span>
                    {atrasadas.length > 0 && <> · <span style={{ color: TONE_COLOR.bad, fontWeight: 600 }}>{t("em atraso")} {atrasadas.length} ({money(emAtraso)})</span></>}
                    {aVencer.length > 0 && <> · <span style={{ color: TONE_COLOR.pending }}>{t("a vencer")} {aVencer.length}</span></>}
                    {multaAplicada > 0 && <> · {t("multas aplicadas")} {money(multaAplicada)}</>}
                    {dispensadas > 0 && <> · <span style={{ color: TONE_COLOR.warn }}>{t("multas dispensadas")} {dispensadas}</span></>}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Classificação */}
        <div className="grid3">
          {af.account_type === "payable"
            ? <Field label={t("Tipo de Despesa")}><select value={af.expense_type} onChange={(e) => setAf({ ...af, expense_type: e.target.value })}><option value="consumo">{t("Consumo")}</option><option value="revenda">{t("Revenda")}</option></select></Field>
            : <Field label={t("Nº da nota")}><input value={af.invoice_number} onChange={(e) => setAf({ ...af, invoice_number: e.target.value })} /></Field>}
          <Field label={t("Categoria")}><input value={af.category} onChange={(e) => setAf({ ...af, category: e.target.value })} /></Field>
          <Field label={t("Status")}><select value={af.status} onChange={(e) => setAf({ ...af, status: e.target.value })}><option value="pending">{t("Pendente")}</option><option value="partial">{t("Parcial")}</option><option value="paid">{t("Pago")}</option><option value="cancelled">{t("Cancelada")}</option></select></Field>
        </div>
        <Field label={t("Motivo do Pagamento")}><input value={af.payment_reason} onChange={(e) => setAf({ ...af, payment_reason: e.target.value })} placeholder={t("Ex: Parcela 1 de 5 — Implantação")} /></Field>
        <Field label={t("Observações")}><textarea value={af.notes} onChange={(e) => setAf({ ...af, notes: e.target.value })} /></Field>
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
