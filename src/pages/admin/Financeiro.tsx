import { Fragment, useState, useEffect, useRef } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Search, ChevronRight, ChevronDown, CheckCircle2, Repeat, ArrowRight, Filter, X } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, Field, useSort, SortTh, Farol } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import DocField from "../../ui/DocField";
import CustoIA from "./CustoIA";
import Conciliacao from "./Conciliacao";
import FinanceiroAPagarV3 from "./FinanceiroAPagarV3";
import FinanceiroAReceberV3 from "./FinanceiroAReceberV3";

// Data de HOJE no fuso do Brasil (America/Sao_Paulo) em "YYYY-MM-DD". Usar toISOString()
// (UTC) fazia o dia "virar" 3h antes à noite — e as parcelas são datas de calendário BR.
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
// Carimbo de tempo AUDITÁVEL (data+hora+seg, fuso BR -03:00) — usado ao registrar uma baixa.
const nowStamp = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00";
const A_EMPTY = {
  id: "", account_type: "payable",
  contact_name: "", contact_reference: "", organization_id: "", cnpj: "",
  description: "", services: [] as any[],
  contract_validity_value: "", contract_validity_unit: "months", contract_total: "", contract_signed_date: "",
  payment_installments: "", installment_amount: "", due_date: "", payment_day_of_month: "", payment_method: "PIX", payment_schedule: [] as any[],
  expense_type: "consumo", category: "", status: "pending", payment_reason: "", vinculo: "",
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

// ===== Painel: análise de gasto de IA por período (fica em A Pagar) =====
const isoDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
const monthsInRange = (a: string, b: string) => { const [ay, am] = a.split("-").map(Number); const [by, bm] = b.split("-").map(Number); return Math.max(1, (by * 12 + bm) - (ay * 12 + am) + 1); };
const daysInRange = (a: string, b: string) => Math.max(1, Math.round((+new Date(b) - +new Date(a)) / 86400000) + 1);
function aiPeriods() {
  const now = new Date(), y = now.getFullYear();
  return [
    { key: "desde25", label: "Desde 2025", from: "2025-01-01", to: isoDay(now) },
    { key: "ano", label: "Este ano", from: `${y}-01-01`, to: isoDay(now) },
    { key: "12m", label: "Últimos 12 meses", from: isoDay(new Date(y, now.getMonth() - 11, 1)), to: isoDay(now) },
    { key: "2025", label: "2025", from: "2025-01-01", to: "2025-12-31" },
    { key: "2026", label: "2026", from: "2026-01-01", to: "2026-12-31" },
  ];
}
// Atalhos de período (fluxo): últimos 30 dias (padrão) / 1m / 3m / 6m / 1 ano.
function finQuickPeriods() {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const backDays = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n + 1); return iso(d); };
  const backMonths = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return iso(d); };
  const to = iso(now);
  return [
    { key: "30d", label: "30 dias", from: backDays(30), to },
    { key: "1m", label: "1 mês", from: backMonths(1), to },
    { key: "3m", label: "3 meses", from: backMonths(3), to },
    { key: "6m", label: "6 meses", from: backMonths(6), to },
    { key: "1a", label: "1 ano", from: backMonths(12), to },
  ];
}
// Total gasto em IA no período + média por mês/semana (toggle) + comparativo 2025×2026.
// Calendário sempre visível (personalizável) e atalhos de período. Usa services.finance.aiCost.panel.
function AiSpendPanel() {
  const t = useT();
  const now = new Date();
  const presets = aiPeriods();
  const [from, setFrom] = useState("2025-01-01");
  const [to, setTo] = useState(isoDay(now));
  const [unit, setUnit] = useState<"mes" | "semana">("mes");
  const [open, setOpen] = useState(false); // recolhido por padrão — não poluir o A Pagar no dia a dia
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.key || "custom";
  const { data, loading } = useAsync(async () => {
    const [range, p25, p26] = await Promise.all([
      services.finance.aiCost.panel(from, to),
      services.finance.aiCost.panel("2025-01-01", "2025-12-31").catch(() => null),
      services.finance.aiCost.panel("2026-01-01", isoDay(now)).catch(() => null),
    ]);
    return { total: Number((range as any)?.summary?.total || 0), y25: Number((p25 as any)?.summary?.total || 0), y26: Number((p26 as any)?.summary?.total || 0) };
  }, [from, to]);
  const total = data?.total || 0, y25 = data?.y25 || 0, y26 = data?.y26 || 0;
  const months = monthsInRange(from, to), weeks = daysInRange(from, to) / 7;
  const avg = unit === "mes" ? total / months : total / weeks;
  const m25 = y25 / 12; // 2025 fechado (12 meses)
  const me26 = now.getFullYear() > 2026 ? 12 : now.getFullYear() < 2026 ? 1 : now.getMonth() + 1;
  const m26 = y26 / me26; // 2026 até hoje
  const seg = (on: boolean) => ({ border: 0, padding: "3px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, background: on ? "var(--crasto-navy, #010E26)" : "transparent", color: on ? "#fff" : "var(--crasto-text-muted, #667085)" });
  const dateInp = { padding: "7px 10px", borderRadius: 8, border: "1px solid var(--crasto-border-soft,#e5e7eb)", fontSize: 13 };
  const dateLab = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12, fontWeight: 600, color: "var(--crasto-text-muted,#667085)" };
  return (
    <div className="card" style={{ padding: open ? 16 : "10px 16px", marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 10, background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}>
        <strong style={{ fontSize: 14 }}>📊 {t("Gasto de IA por período")}</strong>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--crasto-text-muted,#667085)" }}>
          {!open && <span className="tnum" style={{ fontWeight: 700 }}>{loading ? "…" : money(total)}</span>}
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 12, marginBottom: 12 }}>
        {presets.map((p) => <button key={p.key} className={"crasto-btn crasto-btn--sm " + (activePreset === p.key ? "crasto-btn--primary" : "crasto-btn--ghost")} onClick={() => { setFrom(p.from); setTo(p.to); }}><span className="crasto-btn__label">{t(p.label)}</span></button>)}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <label style={dateLab}>{t("De")}<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={dateInp} /></label>
        <span style={{ paddingBottom: 8, color: "var(--crasto-text-muted,#667085)" }}>→</span>
        <label style={dateLab}>{t("Até")}<input type="date" value={to} min={from} max={isoDay(now)} onChange={(e) => setTo(e.target.value)} style={dateInp} /></label>
        {activePreset === "custom" && <span style={{ paddingBottom: 9, fontSize: 12, color: "var(--crasto-navy,#010E26)", fontWeight: 700 }}>• {t("Personalizado")}</span>}
      </div>
      <div className="kpis">
        <div className="kpi g"><div className="lab">{t("Total no período")}</div><div className="val tnum" style={{ fontSize: 24 }}>{loading ? "…" : money(total)}</div><div className="delta">{new Date(from + "T00:00:00").toLocaleDateString("pt-BR")} → {new Date(to + "T00:00:00").toLocaleDateString("pt-BR")} · {months} {t("meses")}</div></div>
        <div className="kpi"><div className="lab" style={{ display: "flex", alignItems: "center", gap: 8 }}>{t("Média")}
          <span style={{ display: "inline-flex", border: "1px solid var(--crasto-border-soft, #e5e7eb)", borderRadius: 999, overflow: "hidden" }}>
            <button style={seg(unit === "mes")} onClick={() => setUnit("mes")}>{t("mês")}</button>
            <button style={seg(unit === "semana")} onClick={() => setUnit("semana")}>{t("semana")}</button>
          </span></div><div className="val tnum" style={{ fontSize: 24 }}>{loading ? "…" : money(avg)}</div><div className="delta">{unit === "mes" ? t("por mês no período") : t("por semana no período")}</div></div>
        <div className="kpi"><div className="lab">{t("Média/mês · 2025")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "…" : money(m25)}</div><div className="delta">{t("total")} {money(y25)}</div></div>
        <div className="kpi"><div className="lab">{t("Média/mês · 2026")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "…" : money(m26)}</div><div className="delta">{t("total")} {money(y26)}</div></div>
      </div>
      </>}
    </div>
  );
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
const TONE_COLOR: Record<string, string> = { ok: "var(--fin-green)", warn: "var(--fin-orange)", bad: "var(--fin-red)", pending: "#475467", muted: "#98A2B3" };
const C_EMPTY = { id: "", vendor_name: "", description: "", category: "", currency: "BRL", amount_original: "", exchange_rate: "1", amount_brl: "", recurrence: "mensal", cost_type: "fixo", cost_nature: "recorrente", next_payment_date: "", is_active: true, notes: "", vinculo: "", prev_monthly: "" };
const T_EMPTY = { id: "", type: "income", category: "", amount: "", description: "", status: "completed", transaction_date: "", contact_name: "", payment_method: "", notes: "" };

const TABS = [
  { key: "pagar", label: "A Pagar" }, { key: "receber", label: "A Receber" },
  { key: "cobranca", label: "Cobrança" }, { key: "conciliacao", label: "Conciliação" },
  { key: "tesouraria", label: "Tesouraria" },
  // "Custos de IA" deixou de ser aba (2026-08-27): consolidado DENTRO de A Pagar (CustoIA embedded).
];
// As áreas viraram TELAS INDIVIDUAIS no menu-árvore do sidebar (2026-08-28, rumo ao white-label):
// cada seção é uma rota /admin/financeiro/<slug>; a raiz /admin/financeiro é o COCKPIT (visão geral).
const SEG_TO_TAB: Record<string, string> = {
  "a-pagar": "pagar", "a-receber": "receber", "cobranca": "cobranca",
  "conciliacao": "conciliacao", "tesouraria": "tesouraria",
};
const TAB_TO_SEG: Record<string, string> = { pagar: "a-pagar", receber: "a-receber", cobranca: "cobranca", conciliacao: "conciliacao", tesouraria: "tesouraria" };
const TITULO_SECAO: Record<string, string> = {
  cockpit: "Cockpit", pagar: "A Pagar", receber: "A Receber",
  cobranca: "Cobrança", conciliacao: "Conciliação", tesouraria: "Tesouraria",
};
type FarolS = "verde" | "amarelo" | "vermelho";

// Filtros da aba Cobrança (painel de recebimentos por parcela) — "pagas sem comprovante" é o gap real.
const COB_FILTROS = [
  { key: "todas", label: "Todas" }, { key: "avencer", label: "A vencer" },
  { key: "vencidas", label: "Vencidas" }, { key: "hoje", label: "Vencem hoje" },
  { key: "sem_comprovante", label: "Pagas s/ comprovante" }, { key: "pagas", label: "Pagas" },
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
  const { secao } = useParams();
  const navigate = useNavigate();
  // A aba ATIVA vem da ROTA (tela individual), não mais de estado interno. Raiz = Cockpit.
  // `?tab=` antigo (deep-links da Visão Geral) segue funcionando como fallback.
  const tab = SEG_TO_TAB[secao || ""] || sp.get("tab") || "cockpit";
  const isCockpit = tab === "cockpit";
  // setTab agora NAVEGA para a tela da seção (mantém todos os cliques de card do cockpit).
  const setTab = (k: string) => navigate("/admin/financeiro" + (TAB_TO_SEG[k] ? "/" + TAB_TO_SEG[k] : ""));
  // A Receber "visão de recorrentes": só as contas que formam o MRR (parceladas ou recorrência mensal/anual).
  // É pra onde o card MRR da Visão geral aponta (?tab=receber&rec=1) — traça o número até a origem.
  const [recOnly, setRecOnly] = useState(sp.get("rec") === "1");
  const [cobFiltro, setCobFiltro] = useState("todas"); // aba Cobrança: recorte por vencimento/comprovante
  // Cards de baixo (A Pagar/A Receber) filtram a LISTA: chips de status + Despesas por tipo. Os totais limpam.
  const [statusF, setStatusF] = useState<"todos" | "vencidos" | "hoje" | "avencer" | "pagos">("todos");
  const [catF, setCatF] = useState<string | null>(null); // A Pagar: filtro por categoria (ferramenta/infraestrutura/servico/salario)
  const [drill, setDrill] = useState<any>(null); // pop-up de detalhes de um card (drill-down)
  const [per, setPer] = useState<{ from: string; to: string; label: string } | null>(() => { const q = finQuickPeriods()[0]; return { from: q.from, to: q.to, label: q.label }; }); // default: últimos 30 dias
  const [perOpen, setPerOpen] = useState(false); // popover do filtro personalizado
  useEffect(() => { setStatusF("todos"); setCatF(null); }, [tab]); // trocar de aba zera os filtros dos cards de baixo
  const toggleRecOnly = () => setRecOnly((v) => {
    const nv = !v; const next = new URLSearchParams(sp);
    if (nv) next.set("rec", "1"); else next.delete("rec");
    setSp(next, { replace: true });
    return nv;
  });
  const [query, setQuery] = useState("");
  const [pdfRef, setPdfRef] = useState(today()); // data de referência p/ o PDF de A Pagar
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
  // Tesouraria — filtro por ANO (histórico 2015 → hoje) + impostos pagos
  const txYears = Array.from(new Set(tx.map((r: any) => (ymd(r.transaction_date) || "").slice(0, 4)).filter(Boolean))).sort().reverse();
  // Padrão = ANO VIGENTE (fuso SP), não "Todos" — o dono quer ver o ano corrente ao abrir.
  // Dinâmico: vira 2027 sozinho na virada. (Trocar por "todos" só se o usuário clicar.)
  const [txYear, setTxYear] = useState("todos");
  const [txBank, setTxBank] = useState("todos");
  const [txFrom, setTxFrom] = useState(() => finQuickPeriods()[0].from); // default: últimos 30 dias
  const [txTo, setTxTo] = useState(() => finQuickPeriods()[0].to);
  const txInYear = (r: any) => txYear === "todos" || (ymd(r.transaction_date) || "").slice(0, 4) === txYear;
  const txInRange = (r: any) => { const d = ymd(r.transaction_date) || ""; if (!d) return !txFrom && !txTo; if (txFrom && d < txFrom) return false; if (txTo && d > txTo) return false; return true; };
  const pillYear = (y: string) => { setTxYear(y); setTxFrom(""); setTxTo(""); }; // atalho de ano limpa o intervalo
  const mmdd = (d: string) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "…");
  const perTag = (txFrom || txTo) ? " · " + mmdd(txFrom) + " → " + mmdd(txTo) : (txYear !== "todos" ? " · " + txYear : "");
  // Banco de origem do lançamento — separa Nubank × Itaú (extratos oficiais) e Faturamento (resumo anual não-caixa).
  const bankOf = (r: any) => { const b = String(r.bank_account || ""); if (/nubank|nu empresas/i.test(b)) return "Nubank"; if (/ita[uú]/i.test(b)) return "Itaú"; if (/resumo anual/i.test(b)) return "Faturamento"; return "Outro"; };
  const txInBank = (r: any) => txBank === "todos" || bankOf(r) === txBank;
  const txBanks = ["Nubank", "Itaú", "Faturamento"].filter((b) => tx.some((r: any) => bankOf(r) === b));
  // Interna = transferência entre contas próprias / aplicação-resgate / distribuição ao sócio → NÃO entra no resultado operacional (evita duplicar receita/despesa com o outro extrato).
  const isInterna = (r: any) => /^interna\b/i.test(String(r.category || ""));
  const isFaturamento = (r: any) => bankOf(r) === "Faturamento";
  // Tributos = classificados pela CATEGORIA auditada ("Despesa - Impostos/Guias"); regex amplo dava falso-positivo (ex.: "iss" casava "comISSao").
  const isImposto = (r: any) => r.type === "expense" && /impost|tribut/i.test(r.category || "");
  const txPer = tx.filter((r: any) => txInYear(r) && txInBank(r) && txInRange(r));
  const txOp = txPer.filter((r: any) => !isInterna(r) && !isFaturamento(r)); // operacional (regime de caixa)
  const pEntradas = txOp.filter((r: any) => r.type === "income").reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const pSaidas = txOp.filter((r: any) => r.type === "expense").reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const internasList = txPer.filter(isInterna).sort((a: any, b: any) => (ymd(b.transaction_date) > ymd(a.transaction_date) ? 1 : -1));
  const pInternas = internasList.reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const fatList = txPer.filter(isFaturamento);
  const pFaturamento = fatList.reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const impostosList = txOp.filter(isImposto).sort((a: any, b: any) => (ymd(b.transaction_date) > ymd(a.transaction_date) ? 1 : -1));
  const pImpostos = impostosList.reduce((a: number, r: any) => a + Number(r.amount || 0), 0);

  // Parcelamento REAL de um custo (ex.: Viver de IA 12x no cartão). Só mensal com "Nx" (N>1) no texto.
  // Assinatura recorrente de valor fixo NÃO é parcelada → sem parcelas (linha recorrente, igual avulso de A Receber).
  const addMonthsISO = (iso: string, k: number) => { const d = new Date(iso + "T00:00:00"); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 10); };
  const costSchedule = (c: any): any[] => {
    const per = Number(c.amount_brl || 0);
    if (!per || String(c.recurrence || "").toLowerCase() !== "mensal") return [];
    const mx = String(c.notes || "").match(/(\d{1,3})\s*x\b/i);
    const count = mx ? Number(mx[1]) : 0;
    if (count < 2) return [];
    const start = ymd(c.reference_date) || addMonthsISO(today(), -(count - 1));
    const base = start.slice(0, 7) + "-" + (start.slice(8, 10) || "01");
    const hoje = today();
    return Array.from({ length: count }, (_, k) => {
      const date = addMonthsISO(base, k);
      const paid = date <= hoje;
      return { installment: k + 1, date, amount: per, status: paid ? "paid" : "pending", paid_date: paid ? date : "", amount_paid: paid ? per : 0, origin: "parcelamento", penalty_amount: 0, penalty_waived: false, _virtual: true };
    });
  };
  // custo → "lançamento" a pagar. Parcelado (Viver de IA) abre em parcelas, igual A Receber;
  // recorrente/pontual segue linha única (histórico pago se inativo; ativo = pendente).
  const costToItem = (c: any) => {
    const ps = costSchedule(c);
    if (ps.length) {
      const total = ps.reduce((a, p) => a + Number(p.amount || 0), 0);
      const pago = ps.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount || 0), 0);
      return { id: c.id, _kind: "cost", description: c.description, contact_name: c.vendor_name, category: c.category, amount: total, amount_paid: pago, due_date: ps.find((p) => p.status !== "paid")?.date || c.next_payment_date, payment_date: null, status: pago >= total ? "paid" : "partial", recurrence: c.recurrence, payment_schedule: ps };
    }
    return { id: c.id, _kind: "cost", description: c.description, contact_name: c.vendor_name, category: c.category, amount: Number(c.amount_brl || 0), amount_paid: c.is_active ? 0 : Number(c.amount_brl || 0), due_date: c.next_payment_date, payment_date: c.is_active ? null : c.reference_date, status: c.is_active ? "pending" : "paid", recurrence: c.recurrence };
  };
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
  // Conta recorrente = ASSINATURA de verdade (campo recurrence), NÃO "tem parcelas". Um deal pontual
  // parcelado (workshop, projeto one-off) não é recorrente. Espelha `mensalDe` da Visão geral. (Crasto 12/08)
  const isRecurring = (a: any) => ["monthly", "mensal", "yearly", "anual"].includes(String(a?.recurrence || "").toLowerCase());
  const recSource = tab === "receber" && recOnly ? rec.filter(isRecurring) : rec;
  // Filtro dos cards de baixo aplicado à LISTA (os totais/chips seguem mostrando o valor cheio).
  const passStatus = (i: any) => statusF === "todos" ? true : statusF === "vencidos" ? vencidoDe(i) > 0 : statusF === "hoje" ? hojeDe(i) > 0 : statusF === "avencer" ? avencerDe(i) > 0 : Number(i.amount_paid || 0) > 0;
  const passCat = (i: any) => tab !== "pagar" || !catF || i.category === catF;
  const rawItems = tab === "pagar" ? payItems : tab === "receber" ? recSource.map(acctToItem) : [];
  const groups = buildGroups(rawItems.filter((i) => passStatus(i) && passCat(i)));

  // Export PDF — lista COMPLETA do filtro atual (todos os grupos/itens), com a data de referência
  // escolhida. Abre uma janela self-contained (sem tocar o CSS do app) e chama print → "Salvar como PDF".
  // Toda data sai no padrão auditável dd/mm/aaaa; o carimbo "Gerado em" traz data + hora + segundos.
  const exportPagarPDF = () => {
    const bd = (iso?: string) => (iso ? new Date(String(iso).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—");
    const rows = groups.flatMap((g: any) => g.list.map((i: any) => ({
      empresa: g.name, item: i.description || i.contact_name || "", categoria: i.category || "",
      tipo: i._kind === "cost" ? t("Custo") : t("Conta"), venc: proxVenc(i) || i.due_date || "",
      total: Number(i.amount || 0), pago: Number(i.amount_paid || 0), restante: rem(i), status: stLabel(i.status),
    })));
    let tot = 0, pg = 0, rs = 0; rows.forEach((r) => { tot += r.total; pg += r.pago; rs += r.restante; });
    const refTxt = pdfRef ? bd(pdfRef) : "—";
    const gen = new Date().toLocaleString("pt-BR"); // dd/mm/aaaa hh:mm:ss (auditável)
    const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c]);
    const body = rows.map((r) => `<tr><td>${esc(r.empresa)}</td><td>${esc(r.item)}</td><td>${esc(r.categoria)}</td><td>${esc(r.tipo)}</td><td>${bd(r.venc)}</td><td class=r>${money(r.total)}</td><td class=r>${money(r.pago)}</td><td class=r>${money(r.restante)}</td><td>${esc(r.status)}</td></tr>`).join("");
    const html = `<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>Contas a Pagar — Crasto.AI</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}h2{margin:0 0 2px}.meta{font-size:12px;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-top:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f2f2f2}.r{text-align:right}tfoot td{font-weight:700;border-top:2px solid #999}@media print{@page{size:A4 landscape;margin:12mm}}</style></head><body><h2>Contas a Pagar — Crasto.AI</h2><div class=meta>Data de referência: <b>${refTxt}</b> · Gerado em ${gen} · ${rows.length} lançamento(s) · filtro atual aplicado</div><table><thead><tr><th>Empresa</th><th>Item</th><th>Categoria</th><th>Tipo</th><th>Vencimento</th><th class=r>Total</th><th class=r>Já pago</th><th class=r>Restante</th><th>Status</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan=5 class=r>TOTAIS</td><td class=r>${money(tot)}</td><td class=r>${money(pg)}</td><td class=r>${money(rs)}</td><td></td></tr></tfoot></table><scr` + `ipt>window.onload=function(){setTimeout(function(){window.print();},120);}</scr` + `ipt></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { flash(t("Permita pop-ups para exportar o PDF.")); return; }
    w.document.write(html); w.document.close();
  };

  // Recebíveis RECORRENTES (contratos) — base dos cards da aba A Receber (Fatia 1).
  // `mensalDe` espelha a Visão geral: parcela = a mensalidade; recorrência mensal = valor;
  // anual = valor/12. Como não-recorrente dá 0, o MRR aqui bate com o da Visão geral.
  const mensalDe = (a: any) => { const r = String(a?.recurrence || "").toLowerCase(); if (r === "mensal" || r === "monthly") { const p = parcelas(a); return p.length ? Number(p[0]?.amount || 0) : Number(a.amount || 0); } if (r === "anual" || r === "yearly") return Number(a.amount || 0) / 12; return 0; };
  const recContratos = rec.filter((r) => r.status !== "cancelled" && isRecurring(r));
  const mrrMensal = recContratos.reduce((a, r) => a + mensalDe(r), 0);
  const nContratos = recContratos.length;
  const saldoRecorrente = recContratos.reduce((a, r) => a + rem(r), 0); // quanto ainda falta receber dos contratos
  // Mensalidade equivalente (pedido do Crasto 12/08): TODO contrato de cliente anualizado ÷12, mesmo
  // pago adiantado (ex.: Carneiro 10k em 5× → 10k÷12 = 833). Exclui avulso/workshop. Difere do MRR (que
  // é só assinatura recorrente): aqui projetos pontuais parcelados entram como fração mensal do contrato.
  const isAvulso = (a: any) => /avulso|workshop/i.test(String(a?.category || "") + " " + String(a?.description || ""));
  const mensalEquiv = rec.filter((r) => r.status !== "cancelled" && !isAvulso(r)).reduce((a, r) => a + Number(r.contract_total || r.amount || 0) / 12, 0);

  // ── Aba Cobrança: achata TODA parcela a receber numa linha (ou a conta simples, se sem parcelas).
  const cobRowsAll = rec.filter((r) => r.status !== "cancelled").flatMap((r) => {
    const ps = parcelas(r);
    if (ps.length) return ps.filter((p) => p.status !== "cancelled").map((p, k) => ({ r, inst: p.installment ?? k + 1, total: ps.length, venc: ymd(p.date), valor: Number(p.amount || 0), status: p.status || "pending", paid_date: p.paid_date || "", proof_url: p.proof_url || "", proof_note: p.proof_note || "", parcelada: true }));
    return [{ r, inst: 0, total: 1, venc: ymd(r.due_date), valor: Number(r.amount || 0), status: r.status || "pending", paid_date: r.payment_date || "", proof_url: "", proof_note: "", parcelada: false }];
  });
  const cobClass = (row: any) => row.status === "paid" ? "pago" : (row.venc && row.venc < today()) ? "vencida" : (row.venc === today()) ? "hoje" : "avencer";
  const cobMatch = (row: any, key: string) => {
    const c = cobClass(row);
    if (key === "avencer") return c === "avencer";
    if (key === "vencidas") return c === "vencida";
    if (key === "hoje") return c === "hoje";
    if (key === "pagas") return row.status === "paid";
    if (key === "sem_comprovante") return row.status === "paid" && !row.proof_url;
    return true; // todas
  };
  const cobCount = (key: string) => cobRowsAll.filter((r) => cobMatch(r, key)).length;
  const cobRows = cobRowsAll
    .filter((row) => { const q = query.trim().toLowerCase(); return !q || (row.r.contact_name || "").toLowerCase().includes(q); })
    .filter((row) => cobMatch(row, cobFiltro))
    .sort((a, b) => (a.venc || "").localeCompare(b.venc || ""));

  // resumo A Pagar (custos)
  const activeCosts = costs.filter((c) => c.is_active);
  const totalMensal = activeCosts.filter((c) => c.recurrence === "mensal").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const totalAno = totalMensal * 12 + activeCosts.filter((c) => c.recurrence === "anual").reduce((a, c) => a + Number(c.amount_brl || 0), 0) + activeCosts.filter((c) => c.recurrence === "pontual").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const consumo = pay.filter((r) => r.expense_type === "consumo");
  const revenda = pay.filter((r) => r.expense_type === "revenda");

  // === MENSAL-FIRST — retrato do mês corrente (pra "bater o olho e saber") ===
  const mesAtual = today().slice(0, 7); // "YYYY-MM"
  // Filtro por período (o Crasto quer projeções): se `per` setado, usa a faixa; senão, o mês atual.
  const inMes = (d: any) => { const x = ymd(d); if (!x) return false; return per ? (x >= per.from && x <= per.to) : x.slice(0, 7) === mesAtual; };
  const inCal = (d: any) => { const x = ymd(d); return !!x && x.slice(0, 7) === mesAtual; }; // sempre mes-calendario (DAS/tributos nao seguem o filtro de periodo)
  const noMesLbl = per ? t("no período") : t("no mês");
  const perPresets = () => {
    const [y, mo] = today().split("-").map(Number);
    const f = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
    const l = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;
    const pv = mo === 1 ? [y - 1, 12] : [y, mo - 1], nx = mo === 12 ? [y + 1, 1] : [y, mo + 1];
    return [
      { key: "mes", label: t("Este mês"), from: f(y, mo), to: l(y, mo) },
      { key: "ant", label: t("Mês passado"), from: f(pv[0], pv[1]), to: l(pv[0], pv[1]) },
      { key: "prox", label: t("Próximo mês"), from: f(nx[0], nx[1]), to: l(nx[0], nx[1]) },
      { key: "ano", label: t("Este ano"), from: `${y}-01-01`, to: `${y}-12-31` },
    ];
  };
  // achata cada conta nas suas parcelas (ou a própria conta, se não tiver parcelas)
  const flatParc = (list: any[]) => list.flatMap((r) => {
    const ps = parcelas(r);
    return ps.length
      ? ps.filter((p) => p.status !== "cancelled").map((p) => ({ date: ymd(p.date), amount: Number(p.amount || 0), paid: p.status === "paid", name: r.contact_name, ref: r }))
      : (r.status !== "cancelled" ? [{ date: ymd(r.due_date), amount: Number(r.amount || 0), paid: r.status === "paid", name: r.contact_name, ref: r }] : []);
  });
  const recFlat = flatParc(rec);
  const recFlatRec = flatParc(rec.filter((r) => isRecurring(r))); // SÓ recorrentes (o Crasto: pontual/avulso NÃO entra em "a receber no mês")
  const recorRecebido = recFlatRec.filter((p) => p.paid && inMes(p.date)).reduce((a, p) => a + p.amount, 0);
  const recorPend = recFlatRec.filter((p) => !p.paid && inMes(p.date)).reduce((a, p) => a + p.amount, 0);
  const totalReceberMes = recorRecebido + recorPend;   // "A receber no mês" = recorrente do mês (mensalidades)
  const aReceberMes = recorPend;                        // recorrente que ainda falta no mês
  const recebidoMes = recFlat.filter((p) => p.paid && inMes(p.date)).reduce((a, p) => a + p.amount, 0); // "Recebido no mês" = TUDO que entrou (com avulsos)
  const totalMesAll = recFlat.filter((p) => inMes(p.date)).reduce((a, p) => a + p.amount, 0); // tudo do mês (recorrente + avulso) — base do Resultado
  // A pagar no mês = custos recorrentes mensalizados (mensal + anual/12), por categoria da taxonomia
  // "A pagar no mês" = SÓ o que sai TODO mês (recorrência mensal, incl. parcelados como Viver de IA/Dell).
  // Anuais NÃO entram aqui (foram pagos adiantado no ano) — aparecem em "Renovações anuais" e no Total do ano.
  const custoMensalCat = (cat?: string) => activeCosts.filter((c) => (!cat || c.category === cat) && c.recurrence === "mensal").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const custoAnualCat = (cat?: string) => activeCosts.filter((c) => (!cat || c.category === cat) && c.recurrence === "anual").reduce((a, c) => a + Number(c.amount_brl || 0), 0);
  const aPagarMes = custoMensalCat();
  const resultadoMes = totalMesAll - aPagarMes; // tudo que entra no mês (recorrente + avulso) − custo mensal
  // Snapshot MENSAL (inCal) para os KPIs do topo — NAO seguem o filtro de periodo (custo do mes = run-rate completo).
  const recebidoCal = recFlat.filter((pp: any) => pp.paid && inCal(pp.date)).reduce((a: number, pp: any) => a + pp.amount, 0);
  const totalMesAllCal = recFlat.filter((pp: any) => inCal(pp.date)).reduce((a: number, pp: any) => a + pp.amount, 0);
  const resultadoCal = totalMesAllCal - aPagarMes;
  // A Receber: com contrato (recorrente) × sem contrato (avulso)
  const comContrato = rec.filter((r) => r.status !== "cancelled" && isRecurring(r)).reduce((a, r) => a + rem(r), 0);
  const semContrato = rec.filter((r) => r.status !== "cancelled" && !isRecurring(r)).reduce((a, r) => a + rem(r), 0);

  // ── Drill-down: linhas de detalhe por card (o Crasto quer todo card clicável com suas infos) ──
  const catLabel = (c: string) => (({ ferramenta: t("Ferramenta"), infraestrutura: t("Infraestrutura"), servico: t("Serviço"), salario: t("Salário"), beneficio: t("Benefícios") } as any)[c] || c || t("Outro"));
  const fmtD = (d: any) => (ymd(d) ? new Date(ymd(d) + "T00:00:00").toLocaleDateString("pt-BR") : "—");
  const custoMensalDe = (c: any) => (c.recurrence === "mensal" ? Number(c.amount_brl || 0) : c.recurrence === "anual" ? Number(c.amount_brl || 0) / 12 : 0);
  // A receber
  const rowsRecMes = recFlatRec.filter((p) => inMes(p.date)).map((p) => ({ name: p.name, detail: fmtD(p.date), value: p.amount, tone: p.paid ? "ok" : "info", status: p.paid ? t("Recebido") : t("A receber") }));
  const rowsRecebidoMes = recFlat.filter((p) => p.paid && inMes(p.date)).map((p) => ({ name: p.name, detail: fmtD(p.date), value: p.amount, tone: "ok", status: t("Recebido") }));
  const rowsRecebidoCal = recFlat.filter((p: any) => p.paid && inCal(p.date)).map((p: any) => ({ name: p.name, detail: fmtD(p.date), value: p.amount, tone: "ok", status: t("Recebido") }));
  const rowsResultadoCal = [ { name: t("Entradas do mês"), detail: t("recorrentes + avulsos"), value: totalMesAllCal, tone: "ok", status: "+" }, { name: t("A pagar no mês"), detail: t("ferramenta + infra + serviço"), value: -aPagarMes, tone: "warn", status: "−" } ];
  const rowsMRR = recContratos.map((r) => ({ name: r.contact_name, detail: t("recorrente/mês"), value: mensalDe(r), tone: "mute", status: r.recurrence }));
  const rowsComContrato = rec.filter((r) => r.status !== "cancelled" && isRecurring(r)).map((r) => ({ name: r.contact_name, detail: `${t("saldo")} · ${t("pago")} ${money(Number(r.amount_paid || 0))}`, value: rem(r), tone: "info", status: t("contrato") }));
  const rowsSemContrato = rec.filter((r) => r.status !== "cancelled" && !isRecurring(r)).map((r) => ({ name: r.contact_name, detail: (r.description || t("avulso")), value: rem(r), tone: "mute", status: r.status === "paid" ? t("Pago") : t("Em aberto") }));
  const rowsVencidos = recFlat.filter((p) => !p.paid && p.date && p.date < today()).map((p) => ({ name: p.name, detail: `${t("venceu")} ${fmtD(p.date)}`, value: p.amount, tone: "warn", status: t("Vencido") }));
  // A pagar
  const rowsPagarMes = activeCosts.filter((c) => c.recurrence === "mensal").map((c) => ({ name: c.vendor_name, detail: `${catLabel(c.category)} · ${t("mensal")}`, value: Number(c.amount_brl || 0), tone: "mute", status: catLabel(c.category) })).sort((a, b) => b.value - a.value);
  const rowsAnuais = activeCosts.filter((c) => c.recurrence === "anual").map((c) => ({ name: c.vendor_name, detail: `${catLabel(c.category)} · ${t("renova")} ${fmtD(c.next_payment_date)}`, value: Number(c.amount_brl || 0), tone: "info", status: t("anual") })).sort((a, b) => b.value - a.value);
  const rowsAnoTudo = activeCosts.map((c) => ({ name: c.vendor_name, detail: `${catLabel(c.category)} · ${c.recurrence}`, value: c.recurrence === "mensal" ? Number(c.amount_brl || 0) * 12 : Number(c.amount_brl || 0), tone: "mute", status: catLabel(c.category) })).sort((a, b) => b.value - a.value);
  const rowsResultado = [
    { name: t("Entradas do mês"), detail: t("recorrentes + avulsos"), value: totalMesAll, tone: "ok", status: "+" },
    { name: t("A pagar no mês"), detail: t("ferramenta + infra + serviço"), value: -aPagarMes, tone: "warn", status: "−" },
  ];

  // === Drill-downs dos cards da TESOURARIA (clicar no card abre o detalhamento organizado) ===
  const txGroupAbs = (rows: any[], keyOf: (r: any) => string, tone: string) => {
    const m = new Map<string, { value: number; n: number }>();
    rows.forEach((r: any) => { const k = keyOf(r) || "—"; const g = m.get(k) || { value: 0, n: 0 }; g.value += Math.abs(Number(r.amount || 0)); g.n += 1; m.set(k, g); });
    return Array.from(m.entries()).map(([name, g]) => ({ name, detail: g.n + "×", value: g.value, tone, status: "" })).sort((a, b) => b.value - a.value);
  };
  const txOpIn = txOp.filter((r: any) => r.type === "income");
  const txOpOut = txOp.filter((r: any) => r.type === "expense");
  const drillEntradas = txGroupAbs(txOpIn, (r: any) => r.contact_name || r.description || "—", "ok");
  const drillSaidas = txGroupAbs(txOpOut, (r: any) => r.category || "—", "warn").map((x) => ({ ...x, value: -x.value }));
  const drillResultado = [
    { name: t("Entradas (clientes)"), detail: t("operacional"), value: pEntradas, tone: "ok", status: "+" },
    { name: t("Saídas (custos)"), detail: t("operacional"), value: -pSaidas, tone: "warn", status: "−" },
  ];
  const drillTributos = impostosList.map((r: any) => ({ name: r.description || t("Guia"), detail: fmtD(r.transaction_date) + " · " + bankOf(r), value: -Number(r.amount || 0), tone: "warn", status: r.category || "" }));
  const drillInternas = txGroupAbs(internasList, (r: any) => r.category || "—", "mute");
  // ---- drill dos cards de Cobranca/Conciliacao (lista de parcelas por recorte) ----
  const cobDrill = (key: string) => cobRowsAll.filter((row: any) => cobMatch(row, key)).sort((a: any, b: any) => (a.venc || "").localeCompare(b.venc || "")).map((row: any) => ({
    name: row.r.contact_name || "—",
    detail: (row.parcelada ? t("Parcela") + " " + row.inst + "/" + row.total + " · " : "") + (row.status === "paid" ? (t("pago") + " " + fmtD(row.paid_date || row.venc)) : (row.venc ? t("vence") + " " + fmtD(row.venc) : "—")),
    value: Number(row.valor || 0),
    tone: row.status === "paid" ? (row.proof_url ? "ok" : "info") : (cobClass(row) === "vencida" ? "warn" : "mute"),
    status: row.status === "paid" ? (row.proof_url ? t("Conciliada") : t("Sem comprovante")) : (cobClass(row) === "vencida" ? t("Vencida") : cobClass(row) === "hoje" ? t("Vence hoje") : t("A vencer")),
  }));
  const cobSum = (key: string) => cobRowsAll.filter((row: any) => cobMatch(row, key)).reduce((a: number, row: any) => a + Number(row.valor || 0), 0);
  const rowsConciliadas = cobRowsAll.filter((row: any) => row.status === "paid" && row.proof_url).sort((a: any, b: any) => (b.paid_date || b.venc || "").localeCompare(a.paid_date || a.venc || "")).map((row: any) => ({ name: row.r.contact_name || "—", detail: t("pago") + " " + fmtD(row.paid_date || row.venc) + (row.parcelada ? " · " + t("Parcela") + " " + row.inst + "/" + row.total : ""), value: Number(row.valor || 0), tone: "ok", status: t("Conciliada") }));
  // "A vencer" mensal: 1 linha por CONTRATO (a proxima parcela nao paga) — evita repetir o contrato em todos os meses futuros.
  const cobAvencerUnico = (() => { const seen = new Map<string, any>(); cobRowsAll.filter((r: any) => cobMatch(r, "avencer")).sort((a: any, b: any) => (a.venc || "").localeCompare(b.venc || "")).forEach((r: any) => { const k = String(r.r.id || r.r.contact_name || ""); if (!seen.has(k)) seen.set(k, r); }); return Array.from(seen.values()); })();
  const cobRowMap = (rows: any[]) => rows.map((row: any) => ({ name: row.r.contact_name || "—", detail: (row.parcelada ? t("Parcela") + " " + row.inst + "/" + row.total + " · " : "") + (row.venc ? t("vence") + " " + fmtD(row.venc) : "—"), value: Number(row.valor || 0), tone: cobClass(row) === "vencida" ? "warn" : "mute", status: cobClass(row) === "vencida" ? t("Vencida") : cobClass(row) === "hoje" ? t("Vence hoje") : t("A vencer") }));
  const drillFat = fatList.map((r: any) => ({ name: r.description || r.category, detail: fmtD(r.transaction_date), value: Number(r.amount || 0), tone: "info", status: "" })).sort((a: any, b: any) => b.value - a.value);

  // === IMPOSTO DO MÊS — Simples Nacional, ANEXO III (tabela oficial LC 123/2006, vigência desde 2018) ===
  // Enquadramento: CNAEs de serviço da empresa (8211-3/00 apoio adm., 6209-1/00 suporte TI, 8599-6/04 treinamento) → Anexo III (não sujeitos a fator R). Porte EPP, optante do Simples.
  // Alíquota EFETIVA = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12. RBT12 = receita bruta dos 12 meses anteriores.
  // ⚠️ Rever esta tabela apenas se a lei do Simples mudar (não há API oficial em tempo real; os valores são estatutários).
  const SIMPLES_ANEXO_III = [
    { ate: 180000, nom: 0.06, pd: 0 },
    { ate: 360000, nom: 0.112, pd: 9360 },
    { ate: 720000, nom: 0.135, pd: 17640 },
    { ate: 1800000, nom: 0.16, pd: 35640 },
    { ate: 3600000, nom: 0.21, pd: 125640 },
    { ate: Infinity, nom: 0.33, pd: 648000 },
  ];
  const simplesAliq = (rbt12: number) => { const f = SIMPLES_ANEXO_III.find((x) => rbt12 <= x.ate) || SIMPLES_ANEXO_III[SIMPLES_ANEXO_III.length - 1]; return rbt12 > 0 ? Math.max(0, (rbt12 * f.nom - f.pd) / rbt12) : f.nom; };
  const isOpRev = (r: any) => r.type === "income" && !isInterna(r) && !isFaturamento(r);
  const receitaBrutaMes = tx.filter((r: any) => isOpRev(r) && inCal(r.transaction_date)).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const refMonthEnd = today().slice(0, 7); // "YYYY-MM" de referência (DAS = mes-calendario, independe do filtro de periodo)
  const rbt12Ini = addMonthsISO(refMonthEnd + "-01", -12).slice(0, 7);
  const rbt12 = tx.filter((r: any) => { if (!isOpRev(r)) return false; const m = (ymd(r.transaction_date) || "").slice(0, 7); return m >= rbt12Ini && m < refMonthEnd; }).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const aliqEfetiva = simplesAliq(rbt12);
  const impostoMes = receitaBrutaMes * aliqEfetiva;
  const dasPagoMes = tx.filter((r: any) => r.type === "expense" && isImposto(r) && inCal(r.transaction_date)).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const pctAliq = (aliqEfetiva * 100).toFixed(2).replace(".", ",") + "%";
  // Contabilidade (honorários do contador) — custo mensal recorrente. Entra no card "Tributos e impostos do mês".
  const isContab = (c: any) => /cont(a|á)bil|contador|honor[aá]ri|s[aã]o lucas|klebson/i.test((c.vendor_name || "") + " " + (c.description || "") + " " + (c.category || ""));
  const contabMes = activeCosts.filter(isContab).reduce((a: number, c: any) => a + custoMensalDe(c), 0);
  const tributosMes = impostoMes + contabMes;
  const rowsImposto = [
    { name: t("Receita bruta") + " · " + mesAtual, detail: t("clientes — extratos Nubank + Itaú"), value: receitaBrutaMes, tone: "ok", status: t("base") },
    { name: t("Imposto (DAS) · Simples Anexo III"), detail: t("RBT12 (12m) ") + money(rbt12), value: -impostoMes, tone: "warn", status: pctAliq },
    { name: t("Contabilidade (honorários)"), detail: t("honorários contábeis do mês"), value: -contabMes, tone: "warn", status: t("mensal") },
    { name: t("DAS já pago no mês"), detail: t("comparação · lançado na tesouraria"), value: -dasPagoMes, tone: dasPagoMes > 0 ? "info" : "mute", status: dasPagoMes > 0 ? t("pago") : t("nada lançado") },
  ];

  // === CUSTO REAL DA EMPRESA / MÊS (competência) + BREAK-EVEN + farol de saúde ===
  // VISÃO por competência: NÃO altera nenhum lançamento fiscal/caixa. Anuais são "picotados" (÷12) + mensais + DAS.
  const receitaMensalMedia = rbt12 > 0 ? rbt12 / 12 : receitaBrutaMes;
  const dasMensalMedio = receitaMensalMedia * aliqEfetiva; // DAS típico/mês (evita distorção do mês parcial)
  const custoMensalReal = activeCosts.reduce((a: number, c: any) => a + custoMensalDe(c), 0) + dasMensalMedio;
  const custoAnuaisMes = activeCosts.filter((c: any) => c.recurrence === "anual").reduce((a: number, c: any) => a + Number(c.amount_brl || 0) / 12, 0);
  const beMargin = receitaMensalMedia > 0 ? (receitaMensalMedia - custoMensalReal) / receitaMensalMedia : -1;
  const beFarol = receitaMensalMedia < custoMensalReal ? "red" : receitaMensalMedia < custoMensalReal * 1.10 ? "yellow" : "green";
  const rowsCustoReal = [
    ...activeCosts.filter((c: any) => c.recurrence === "mensal").map((c: any) => ({ name: c.vendor_name, detail: catLabel(c.category) + " · " + t("mensal"), value: -Number(c.amount_brl || 0), tone: "warn", status: catLabel(c.category) })),
    ...activeCosts.filter((c: any) => c.recurrence === "anual").map((c: any) => ({ name: c.vendor_name, detail: catLabel(c.category) + " · " + t("anual") + " " + money(Number(c.amount_brl || 0)) + " ÷ 12", value: -Number(c.amount_brl || 0) / 12, tone: "info", status: t("anual ÷12") })),
    { name: t("Imposto (DAS) médio/mês"), detail: t("Simples Anexo III") + " · " + pctAliq, value: -dasMensalMedio, tone: "warn", status: t("tributo") },
  ].sort((a: any, b: any) => a.value - b.value);
  const FAROL = { green: { emoji: "🟢", bg: "rgba(46,160,67,.10)", bd: "rgba(46,160,67,.45)", lab: t("Empresa saudável") }, yellow: { emoji: "🟡", bg: "rgba(210,153,34,.12)", bd: "rgba(210,153,34,.5)", lab: t("No limite do break-even") }, red: { emoji: "🔴", bg: "rgba(200,60,60,.12)", bd: "rgba(200,60,60,.5)", lab: t("Abaixo do break-even") } }[beFarol];

  // === ALERTA DE RENOVAÇÃO ANUAL — 30 dias antes do vencimento (banner vermelho no topo) ===
  // Vencimento da renovação = next_payment_date OU (payment_date/reference_date + 1 ano).
  const renewISO = (c: any) => { const np = ymd(c.next_payment_date); if (np) return np; const base = ymd(c.payment_date) || ymd(c.reference_date); if (!base) return ""; const d = new Date(base + "T00:00:00"); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
  const diasAte = (iso: string) => Math.round((new Date(iso + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000);
  const renovacoes = activeCosts.filter((c: any) => c.recurrence === "anual").map((c: any) => { const iso = renewISO(c); return { c, iso, dias: iso ? diasAte(iso) : 999 }; }).filter((x: any) => x.iso && x.dias >= 0 && x.dias <= 30).sort((a: any, b: any) => a.dias - b.dias);

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
    if (i._kind === "cost") { const c = costs.find((x) => x.id === i.id); setCf({ id: c.id, vendor_name: c.vendor_name || "", description: c.description || "", category: c.category || "", currency: c.currency || "BRL", amount_original: String(c.amount_original ?? ""), exchange_rate: String(c.exchange_rate ?? "1"), amount_brl: String(c.amount_brl ?? ""), recurrence: c.recurrence || "mensal", cost_type: c.cost_type || "fixo", cost_nature: c.cost_nature || "recorrente", next_payment_date: ymd(c.next_payment_date), is_active: !!c.is_active, notes: c.notes || "", vinculo: c.vinculo || "", prev_monthly: String(c.prev_monthly ?? "") }); setCOpen(true); }
    else { setAf({
      id: i.id, account_type: i.account_type,
      contact_name: i.contact_name || "", contact_reference: i.contact_reference || "", organization_id: i.organization_id || "", cnpj: i.cnpj || "",
      description: i.description || "", services: Array.isArray(i.services) ? i.services : [],
      contract_validity_value: String(i.contract_validity_value ?? ""), contract_validity_unit: i.contract_validity_unit || "months", contract_total: String(i.contract_total ?? i.amount ?? ""), contract_signed_date: ymd(i.contract_signed_date),
      payment_installments: String(i.payment_installments ?? ""), installment_amount: String(Array.isArray(i.payment_schedule) && i.payment_schedule[0] ? i.payment_schedule[0].amount : ""),
      payment_schedule: Array.isArray(i.payment_schedule) ? i.payment_schedule.map((p: any) => ({ ...p, date: ymd(p.date), origin_date: p.origin_date ? ymd(p.origin_date) : ymd(p.date), paid_date: p.paid_date ? ymd(p.paid_date) : "", proof_url: p.proof_url || "", proof_note: p.proof_note || "", penalty_amount: Number(p.penalty_amount || 0), penalty_waived: !!p.penalty_waived })) : [],
      due_date: ymd(i.due_date) || (Array.isArray(i.payment_schedule) && i.payment_schedule[0] ? ymd(i.payment_schedule[0].date) : ""), payment_day_of_month: String(i.payment_day_of_month ?? ""), payment_method: i.payment_method || "PIX",
      expense_type: i.expense_type || "consumo", category: i.category || "", status: i.status || "pending", payment_reason: i.payment_reason || "",
      amount: String(i.amount ?? ""), amount_paid: String(i.amount_paid ?? ""), payment_date: ymd(i.payment_date), recurrence: i.recurrence || "", invoice_number: i.invoice_number || "", notes: i.notes || "", vinculo: i.vinculo || "",
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
      else await services.finance.accounts.save({ id: i.id, account_type: i.account_type, status: "paid", payment_date: nowStamp(), amount_paid: i.amount });
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
    try { await services.finance.accounts.save({ id: i.id, payment_schedule: sched, amount_paid: paid, status, payment_date: status === "paid" ? (lastPaid || nowStamp()) : "" }); reload(); flash(t("Parcela atualizada ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(false); }
  }
  // anexa/remove o comprovante de UMA parcela direto do painel de Cobrança (sem abrir o editor).
  // Atualiza só proof_url/proof_note (parcial) — não mexe em status/valor.
  async function saveParcProof(i: any, num: number, path: string, name: string) {
    const cur = Array.isArray(i.payment_schedule) ? i.payment_schedule : [];
    const sched = cur.map((p: any) => p.installment === num ? { ...p, proof_url: path || "", proof_note: name || "" } : p);
    setBusy(true);
    try { await services.finance.accounts.save({ id: i.id, payment_schedule: sched }); reload(); flash(path ? t("Comprovante anexado ✓") : t("Comprovante removido")); }
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
    try { await services.finance.accounts.save({ id: i.id, payment_schedule: sched, amount_paid: paid, status, payment_date: status === "paid" ? (lastPaid || nowStamp()) : "" }); reload(); setParcEdit(null); setParcDraft(null); flash(t("Parcela atualizada ✓")); }
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
  const txFiltered = tx.filter((r) => { if (!txInYear(r) || !txInBank(r) || !txInRange(r)) return false; const q = query.trim().toLowerCase(); return !q || `${r.description || ""} ${r.category || ""} ${r.contact_name || ""}`.toLowerCase().includes(q); });

  const built = tab === "pagar" || tab === "receber";

  // ── FAROL de status (tempo real) — um por seção; o Cockpit reflete o PIOR de todas ──
  // verde = tudo em dia · amarelo = pendência/alerta · vermelho = pendência grave.
  const payVencido = payItems.reduce((a: number, i: any) => a + vencidoDe(i), 0);   // conta a pagar VENCIDA (grave)
  const payHoje = payItems.reduce((a: number, i: any) => a + hojeDe(i), 0);         // vence hoje (alerta)
  const recHojeVal = rec.reduce((a: number, r: any) => a + hojeDe(r), 0);           // a receber vence hoje
  const nConc = cobCount("sem_comprovante");                                         // pagas sem comprovante
  const resultTes = pEntradas - pSaidas;                                             // caixa operacional
  const fPagar: FarolS = payVencido > 0 ? "vermelho" : payHoje > 0 ? "amarelo" : "verde";
  const fReceber: FarolS = inadimplencia > 0 ? "vermelho" : recHojeVal > 0 ? "amarelo" : "verde";
  const fCobranca: FarolS = cobCount("vencidas") > 0 ? "vermelho" : cobCount("hoje") > 0 ? "amarelo" : "verde";
  const fConciliacao: FarolS = nConc >= 20 ? "vermelho" : nConc > 0 ? "amarelo" : "verde"; // backlog grande = grave
  const fTesouraria: FarolS = resultTes < 0 ? "vermelho" : (pEntradas > 0 && resultTes < pEntradas * 0.1 ? "amarelo" : "verde");
  const fTodos = [fPagar, fReceber, fCobranca, fConciliacao, fTesouraria];
  const fCockpit: FarolS = fTodos.includes("vermelho") ? "vermelho" : fTodos.includes("amarelo") ? "amarelo" : "verde";
  const farolStatus: FarolS = ({ cockpit: fCockpit, pagar: fPagar, receber: fReceber, cobranca: fCobranca, conciliacao: fConciliacao, tesouraria: fTesouraria } as Record<string, FarolS>)[tab] || fCockpit;
  const farolTag = ({ verde: "Tudo em dia", amarelo: "Atenção", vermelho: "Pendência grave" } as Record<FarolS, string>)[farolStatus];

  // NOTA do farol: por que está nessa cor + a pendência da tela + o que fazer (verde = só o porquê).
  const notaPagar = fPagar === "vermelho" ? `${money(payVencido)} em contas vencidas — pague ou renegocie o quanto antes.`
    : fPagar === "amarelo" ? `${money(payHoje)} vence hoje — programe o pagamento ainda hoje.`
    : "Nada vencido e nada vence hoje — contas a pagar em dia.";
  const notaReceber = fReceber === "vermelho" ? `${money(inadimplencia)} a receber vencido — acione a cobrança do cliente.`
    : fReceber === "amarelo" ? `${money(recHojeVal)} a receber vence hoje — acompanhe a entrada.`
    : "Nada vencido a receber — recebimentos em dia.";
  const notaCobranca = fCobranca === "vermelho" ? `${cobCount("vencidas")} parcela(s) vencida(s) — cobre os clientes.`
    : fCobranca === "amarelo" ? `${cobCount("hoje")} parcela(s) vence(m) hoje — envie o lembrete de cobrança.`
    : "Nenhuma parcela vencida ou vencendo hoje — cobrança em dia.";
  const notaConc = fConciliacao === "vermelho" ? `${nConc} pagamentos sem comprovante (acúmulo alto) — concilie com urgência: anexe os comprovantes ou use a Conciliação por IA.`
    : fConciliacao === "amarelo" ? `${nConc} pagamento(s) sem comprovante — anexe os comprovantes ou concilie por IA.`
    : "Todos os pagamentos conciliados — nada pendente.";
  const notaTes = fTesouraria === "vermelho" ? `Caixa negativo no período (${money(resultTes)}) — revise despesas e recebimentos.`
    : fTesouraria === "amarelo" ? `Margem de caixa apertada (${money(resultTes)}) — atenção ao fluxo.`
    : `Caixa positivo (${money(resultTes)}) — tesouraria saudável.`;
  // Cockpit: reflete o PIOR; a nota resume as áreas fora do verde.
  const areasFarol: [string, FarolS, string][] = [["A Pagar", fPagar, notaPagar], ["A Receber", fReceber, notaReceber], ["Cobrança", fCobranca, notaCobranca], ["Conciliação", fConciliacao, notaConc], ["Tesouraria", fTesouraria, notaTes]];
  const problemasFarol = areasFarol.filter((a) => a[1] !== "verde");
  const notaCockpit = problemasFarol.length === 0 ? "Todas as áreas financeiras em dia — nada pendente."
    : problemasFarol.length === 1 ? `${problemasFarol[0][0]} — ${problemasFarol[0][2]}`
    : `${problemasFarol.map((a) => a[0]).join(" · ")} com pendências — abra cada tela para os detalhes.`;
  const farolNota = ({ cockpit: notaCockpit, pagar: notaPagar, receber: notaReceber, cobranca: notaCobranca, conciliacao: notaConc, tesouraria: notaTes } as Record<string, string>)[tab] || notaCockpit;

  // TEMPO REAL: com a tela aberta e visível, reavalia os dados a cada 90s (o farol reflete o
  // estado atual). Pula se há modal aberto — não atrapalha edição. O piscar é só visual (CSS).
  const reloadRef = useRef(reload); reloadRef.current = reload;
  const modalRef = useRef(false); modalRef.current = aOpen || cOpen || tOpen;
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === "visible" && !modalRef.current) reloadRef.current(); }, 90_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div>
      <PageHead eyebrow="Painel Admin · Financeiro 🔒" title={isCockpit ? "Financeiro" : "Financeiro · " + t(TITULO_SECAO[tab] || "")} sub={isCockpit ? "Visão geral de todas as áreas — Cockpit." : "Gestão financeira completa da Crasto.AI."} />
      <div className={"farol-balao " + farolStatus} role="status">
        <div className="fb-head"><Farol status={farolStatus} titulo={t(farolTag)} /><span className="fb-tag">{t(farolTag)}</span></div>
        <ul className="fb-list">{farolNota.split(/\s+—\s+|\s+·\s+/).map((x: string) => x.trim()).filter(Boolean).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
      </div>

      {/* ═══ COCKPIT (visão geral de todas as áreas) — só na raiz /admin/financeiro ═══ */}
      {isCockpit && (<>
      {/* Filtro de período (fluxo): 30 dias (padrão) / 1m / 3m / 6m / 1 ano — dirige os cards de fluxo do cockpit. Tributos seguem mensal. */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--crasto-text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 4 }}>{t("Período")}</span>
        {finQuickPeriods().map((pp) => <button key={pp.key} className={"ptab" + (per && per.from === pp.from && per.to === pp.to ? " is-active" : "")} style={{ padding: "6px 13px", fontSize: 12 }} onClick={() => { setPer({ from: pp.from, to: pp.to, label: pp.label }); setTxFrom(pp.from); setTxTo(pp.to); setTxYear("todos"); }}>{t(pp.label)}</button>)}
        <span style={{ fontSize: 11, color: "var(--crasto-text-muted)", marginLeft: 6 }}>{per ? mmdd(per.from) + " → " + mmdd(per.to) : ""}</span>
      </div>
      {/* ALERTA de renovação anual — 30 dias antes do vencimento (sininho + e-mail disparam pela automação de fundo) */}
      {renovacoes.length > 0 && (
        <div style={{ marginBottom: 12, padding: "11px 15px", borderRadius: 12, border: "1px solid rgba(200,60,60,.55)", background: "rgba(200,60,60,.12)", display: "flex", flexDirection: "column", gap: 5 }}>
          {renovacoes.map((x: any) => (
            <div key={x.c.id} style={{ fontSize: 13.5, fontWeight: 700, color: "#C83C3C", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>🔔</span><span>{t("Em")} {x.dias} {t("dias o")} <b>{x.c.vendor_name}</b> {t("vai vencer")} ({fmtD(x.iso)} · {money(Number(x.c.amount_brl || 0))}). {t("Renove quando possível.")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Farol de saúde / BREAK-EVEN — receita média mensal × custo real (competência, anuais picotados ÷12). Não toca lançamentos. */}
      <button onClick={() => setDrill({ title: "📊 " + t("Custo real da empresa / mês"), sub: t("competência — anuais picotados ÷12 + mensais + DAS"), rows: rowsCustoReal, foot: { label: t("Custo real / mês"), value: -custoMensalReal } })} title={t("Break-even: receita média mensal × custo real. Clique para ver os custos (anuais picotados).")}
        style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 16px", marginBottom: 14, borderRadius: 12, border: "1px solid " + FAROL.bd, background: FAROL.bg }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>{FAROL.emoji}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{t("Break-even")} · {FAROL.lab}</div>
          <div style={{ fontSize: 12.5, color: "var(--crasto-text-muted)" }}>{t("Receita média")} <b>{money(receitaMensalMedia)}</b>/{t("mês")} {receitaMensalMedia >= custoMensalReal ? "＞" : "＜"} {t("Custo real")} <b>{money(custoMensalReal)}</b>/{t("mês")} · {t("margem")} <b style={{ color: beMargin < 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{(beMargin * 100).toFixed(0)}%</b> · {t("inclui")} <b>{money(custoAnuaisMes)}</b>/{t("mês")} {t("de anuais picotados")}</div>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "var(--crasto-blue, #3E6FB8)", whiteSpace: "nowrap" }}>{t("ver custos")} ›</span>
      </button>

      {/* KPIs topo — clicáveis: cada card leva à aba/tela correspondente (dado real). kpis--5 = 5 cards em 1 linha */}
      <div className="kpis kpis--5" style={{ marginBottom: 16 }}>
        <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("Recebido no mês"), rows: rowsRecebidoCal, foot: { label: t("Recebido no mês"), value: recebidoCal } })} title={t("Snapshot do mês — não segue o filtro de período")}><div className="lab">{t("Entrou no mês (caixa)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(recebidoCal)}</div><div className="delta">{t("recebido de fato")}</div></button>
        <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("A pagar no mês"), rows: rowsPagarMes, foot: { label: t("Total/mês"), value: aPagarMes } })} title={t("Custo mensal (run-rate) — não segue o filtro de período")}><div className="lab">{t("Saiu no mês (caixa)")}</div><div className="val tnum" style={{ fontSize: 22, color: "var(--fin-orange)" }}>{money(aPagarMes)}</div><div className="delta">{t("IA + Pessoas + Ferramentas + Infra")}</div></button>
        <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Resultado do mês"), rows: rowsResultadoCal, foot: { label: t("Resultado"), value: resultadoCal } })} title={t("Resultado do mês = recebido − custo mensal (não segue o filtro de período)")} style={{ background: "linear-gradient(180deg,#0B1830,#010E26)", borderColor: "transparent", color: "#fff" }}><div className="lab" style={{ color: "#9DB4E0" }}>{t("Resultado do mês")}</div><div className="val tnum" style={{ fontSize: 22, color: "#fff" }}>{money(resultadoCal)}</div><div className="delta" style={{ color: "#B7C6E6" }}>{t("recebido − pago (caixa)")}</div></button>
        <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Vencidos"), rows: rowsVencidos, foot: { label: t("Total vencido"), value: inadimplencia } })} title={t("Ver detalhes")}><div className="lab">{t("Vencidos (em aberto)")}</div><div className="val tnum" style={{ fontSize: 22, color: inadimplencia > 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{money(inadimplencia)}</div><div className="delta">{inadimplencia > 0 ? t("a receber vencido") : t("nada vencido ✓")}</div></button>
        <button className="kpi kpi-btn" onClick={() => setDrill({ title: "🧾 " + t("Tributos e impostos do mês"), rows: rowsImposto, foot: { label: t("Tributos + contabilidade do mês"), value: -tributosMes } })} title={t("DAS do Simples Nacional (Anexo III, alíquota efetiva pelo RBT12) + honorários contábeis do mês")}><div className="lab">🧾 {t("Tributos e impostos do mês")}</div><div className="val tnum" style={{ fontSize: 22, color: "var(--fin-red)" }}>{money(tributosMes)}</div><div className="delta">{t("DAS")} {pctAliq} + {t("contábil")}</div></button>
      </div>

      {/* COCKPIT — visão de todas as áreas SEM entrar nas abas. Clique no card → abre a aba p/ detalhar. */}
      {!loading && (<>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--crasto-text-faint)", marginBottom: 6 }}>💰 {t("A Receber")}</div>
          <div className="kpis">
            <button className="kpi navy kpi-btn" onClick={() => setDrill({ title: t("Recorrente / mês (MRR)"), rows: rowsMRR, foot: { label: t("MRR"), value: mrrMensal }, goto: { tab: "receber", label: t("Abrir em A Receber") } })}><div className="lab">{t("Recorrente / mês (MRR)")}</div><div className="val tnum" style={{ fontSize: 18 }}>{money(mrrMensal)}</div><div className="delta">{t("ARR")} {money(mrrMensal * 12)}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("A receber no mês"), rows: rowsRecMes, foot: { label: t("Total do mês"), value: totalReceberMes }, goto: { tab: "receber", label: t("Abrir em A Receber") } })}><div className="lab">{t("A receber no mês")}</div><div className="val tnum" style={{ fontSize: 18 }}>{money(totalReceberMes)}</div><div className="delta">{money(aReceberMes)} {t("falta")}</div></button>
            <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("Recebido no mês"), rows: rowsRecebidoMes, foot: { label: t("Recebido no mês"), value: recebidoMes }, goto: { tab: "receber", label: t("Abrir em A Receber") } })}><div className="lab">{t("Recebido no mês")}</div><div className="val tnum" style={{ fontSize: 18, color: "var(--fin-green)" }}>{money(recebidoMes)}</div><div className="delta">{t("já entrou")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Vencidos"), rows: rowsVencidos, foot: { label: t("Total vencido"), value: inadimplencia }, goto: { tab: "receber", label: t("Abrir em A Receber") } })}><div className="lab">{t("Vencidos")}</div><div className="val tnum" style={{ fontSize: 18, color: inadimplencia > 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{money(inadimplencia)}</div><div className="delta">{t("em aberto")}</div></button>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--crasto-text-faint)", marginBottom: 6 }}>📥 {t("Cobrança")}</div>
          <div className="kpis">
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Vencidas"), rows: cobDrill("vencidas"), foot: { label: t("Total vencidas"), value: cobSum("vencidas") }, goto: { tab: "cobranca", cobFiltro: "vencidas", label: t("Abrir em Cobrança") } })}><div className="lab">{t("Vencidas")}</div><div className="val tnum" style={{ fontSize: 18, color: cobCount("vencidas") > 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{cobCount("vencidas")}</div><div className="delta">{t("parcela(s)")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Vencem hoje"), rows: cobDrill("hoje"), foot: { label: t("Vencem hoje"), value: cobSum("hoje") }, goto: { tab: "cobranca", cobFiltro: "hoje", label: t("Abrir em Cobrança") } })}><div className="lab">{t("Vencem hoje")}</div><div className="val tnum" style={{ fontSize: 18 }}>{cobCount("hoje")}</div><div className="delta">{t("parcela(s)")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("A vencer"), sub: t("próxima parcela de cada contrato"), rows: cobRowMap(cobAvencerUnico), foot: { label: t("A vencer (mês)"), value: cobAvencerUnico.reduce((a: number, r: any) => a + Number(r.valor || 0), 0) }, goto: { tab: "cobranca", cobFiltro: "avencer", label: t("Abrir em Cobrança") } })}><div className="lab">{t("A vencer")}</div><div className="val tnum" style={{ fontSize: 18 }}>{cobAvencerUnico.length}</div><div className="delta">{t("contrato(s)")}</div></button>
            <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("Pagas"), rows: cobDrill("pagas"), foot: { label: t("Total pago"), value: cobSum("pagas") }, goto: { tab: "cobranca", cobFiltro: "pagas", label: t("Abrir em Cobrança") } })}><div className="lab">{t("Pagas")}</div><div className="val tnum" style={{ fontSize: 18, color: "var(--fin-green)" }}>{cobCount("pagas")}</div><div className="delta">{t("recebidas")}</div></button>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--crasto-text-faint)", marginBottom: 6 }}>🔎 {t("Conciliação")}</div>
          <div className="kpis">
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("A conciliar"), sub: t("pagas sem comprovante"), rows: cobDrill("sem_comprovante"), foot: { label: t("A conciliar"), value: cobSum("sem_comprovante") }, goto: { tab: "cobranca", cobFiltro: "sem_comprovante", label: t("Abrir em Cobrança") } })}><div className="lab">{t("A conciliar")}</div><div className="val tnum" style={{ fontSize: 18, color: cobCount("sem_comprovante") > 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{cobCount("sem_comprovante")}</div><div className="delta">{t("pagas s/ comprovante")}</div></button>
            <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("Comprovantes OK"), sub: t("pagas com comprovante"), rows: rowsConciliadas, foot: { label: t("Conciliadas"), value: rowsConciliadas.reduce((a: number, r: any) => a + r.value, 0) }, goto: { tab: "conciliacao", label: t("Abrir em Conciliação") } })}><div className="lab">{t("Comprovantes OK")}</div><div className="val tnum" style={{ fontSize: 18, color: "var(--fin-green)" }}>{Math.max(0, cobCount("pagas") - cobCount("sem_comprovante"))}</div><div className="delta">{t("conciliadas")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setTab("conciliacao")}><div className="lab">🤖 {t("Conciliação por IA")}</div><div className="val tnum" style={{ fontSize: 15 }}>{t("Abrir")}</div><div className="delta">{t("ler comprovante → baixa")}</div></button>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--crasto-text-faint)", marginBottom: 6 }}>🏦 {t("Tesouraria")}</div>
          <div className="kpis">
            <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("Entradas"), sub: t("por cliente/origem"), rows: drillEntradas, foot: { label: t("Entradas (operacional)"), value: pEntradas }, goto: { tab: "tesouraria", label: t("Abrir em Tesouraria") } })}><div className="lab">{t("Entradas")}</div><div className="val tnum" style={{ fontSize: 18, color: "var(--fin-green)" }}>{money(pEntradas)}</div><div className="delta">{t("operacional")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Saídas"), sub: t("por categoria"), rows: drillSaidas, foot: { label: t("Saídas (operacional)"), value: -pSaidas }, goto: { tab: "tesouraria", label: t("Abrir em Tesouraria") } })}><div className="lab">{t("Saídas")}</div><div className="val tnum" style={{ fontSize: 18, color: "var(--fin-orange)" }}>{money(pSaidas)}</div><div className="delta">{t("operacional")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Resultado"), rows: drillResultado, foot: { label: t("Resultado"), value: pEntradas - pSaidas }, goto: { tab: "tesouraria", label: t("Abrir em Tesouraria") } })}><div className="lab">{t("Resultado")}</div><div className="val tnum" style={{ fontSize: 18, color: (pEntradas - pSaidas) < 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{money(pEntradas - pSaidas)}</div><div className="delta">{t("caixa")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: "🧾 " + t("Tributos"), sub: t("cada guia"), rows: drillTributos, foot: { label: t("Tributos"), value: -pImpostos }, goto: { tab: "tesouraria", label: t("Abrir em Tesouraria") } })}><div className="lab">🧾 {t("Tributos")}</div><div className="val tnum" style={{ fontSize: 18, color: "var(--fin-red)" }}>{money(pImpostos)}</div><div className="delta">{impostosList.length} {t("guia(s)")}</div></button>
          </div>
        </div>
      </>)}
      {loading && <Empty>Carregando…</Empty>}
      </>)}

      {/* ═══ TELA DA SEÇÃO (A Pagar / A Receber / Cobrança / Conciliação / Tesouraria) ═══
          A navegação entre seções é o menu-árvore do sidebar; a barra de abas antiga saiu. */}
      {!isCockpit && (loading ? <Empty>Carregando…</Empty> : tab === "tesouraria" ? (<>
        {/* barra de ação tesouraria */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div className="catsearch" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Pesquisar…")} />
          </div>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => newTx("income")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Nova entrada")}</span></button>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => newTx("expense")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Nova saída")}</span></button>
        </div>

        {/* filtro por ANO (histórico 2015 → hoje) + intervalo De/Até */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--crasto-text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 4 }}>{t("Período")}</span>
          {finQuickPeriods().map((pp) => <button key={pp.key} className={"ptab" + (txFrom === pp.from && txTo === pp.to ? " is-active" : "")} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { setTxFrom(pp.from); setTxTo(pp.to); setTxYear("todos"); }}>{t(pp.label)}</button>)}
          <span style={{ width: 1, height: 20, background: "var(--crasto-border)", margin: "0 4px" }} />
          <button className={"ptab" + (txYear === "todos" && !txFrom && !txTo ? " is-active" : "")} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => pillYear("todos")}>{t("Todos")}</button>
          {txYears.map((y) => <button key={y} className={"ptab" + (txYear === y && !txFrom && !txTo ? " is-active" : "")} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => pillYear(y)}>{y}</button>)}
          <span style={{ width: 1, height: 20, background: "var(--crasto-border)", margin: "0 4px" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--crasto-text-faint)" }}>{t("De")}</span>
          <input type="date" value={txFrom} max={txTo || undefined} onChange={(e) => { setTxFrom(e.target.value); setTxYear("todos"); }} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 8, border: "1px solid var(--crasto-border)", background: "var(--card)", color: "var(--crasto-text)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--crasto-text-faint)" }}>{t("Até")}</span>
          <input type="date" value={txTo} min={txFrom || undefined} onChange={(e) => { setTxTo(e.target.value); setTxYear("todos"); }} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 8, border: "1px solid var(--crasto-border)", background: "var(--card)", color: "var(--crasto-text)" }} />
          {(txFrom || txTo) && <button className="ptab" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { setTxFrom(""); setTxTo(""); }}>✕ {t("limpar")}</button>}
        </div>

        {/* filtro por BANCO (Nubank × Itaú — extratos oficiais) */}
        {txBanks.length > 1 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--crasto-text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 4 }}>{t("Banco")}</span>
            <button className={"ptab" + (txBank === "todos" ? " is-active" : "")} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setTxBank("todos")}>{t("Todos")}</button>
            {txBanks.map((b) => <button key={b} className={"ptab" + (txBank === b ? " is-active" : "")} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setTxBank(b)}>{b === "Faturamento" ? "🧾 " + t("Faturamento") : b === "Nubank" ? "🟣 Nubank" : "🟠 Itaú"}</button>)}
          </div>
        )}

        {/* resumo tesouraria — RESULTADO OPERACIONAL (caixa), sem transferências internas nem faturamento não-caixa. Cards clicáveis → detalhamento */}
        <div className="kpis" style={{ marginBottom: 10 }}>
          <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("Entradas") + perTag, sub: t("por cliente/origem"), rows: drillEntradas, foot: { label: t("Entradas (operacional)"), value: pEntradas } })} title={t("Ver detalhes")}><div className="lab">{t("Entradas")}{perTag}</div><div className="val tnum" style={{ fontSize: 20, color: "var(--fin-green)" }}>{money(pEntradas)}</div><div className="delta">{t("operacional (clientes)")}</div></button>
          <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Saídas") + perTag, sub: t("por categoria"), rows: drillSaidas, foot: { label: t("Saídas (operacional)"), value: -pSaidas } })} title={t("Ver detalhes")}><div className="lab">{t("Saídas")}{perTag}</div><div className="val tnum" style={{ fontSize: 20, color: "var(--fin-orange)" }}>{money(pSaidas)}</div><div className="delta">{t("operacional (custos)")}</div></button>
          <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Resultado") + perTag, rows: drillResultado, foot: { label: t("Resultado"), value: pEntradas - pSaidas } })} title={t("Ver detalhes")}><div className="lab">{t("Resultado")}</div><div className="val tnum" style={{ fontSize: 20, color: (pEntradas - pSaidas) < 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{money(pEntradas - pSaidas)}</div><div className="delta">{t("entradas − saídas · caixa")}</div></button>
          <button className="kpi kpi-btn" onClick={() => setDrill({ title: "🧾 " + t("Tributos") + perTag, sub: t("cada guia"), rows: drillTributos, foot: { label: t("Tributos"), value: -pImpostos } })} title={t("Ver detalhes")}><div className="lab">🧾 {t("Tributos")}</div><div className="val tnum" style={{ fontSize: 20, color: "var(--fin-red)" }}>{money(pImpostos)}</div><div className="delta">{pEntradas > 0 ? "≈" + (Math.round((pImpostos / pEntradas) * 1000) / 10) + "% da receita · " : ""}{impostosList.length} {t("guia(s)")}</div></button>
        </div>

        {/* faixa não-operacional: transferências internas (não entram no resultado) + faturamento histórico não-caixa */}
        {(internasList.length > 0 || fatList.length > 0) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {internasList.length > 0 && (
              <button onClick={() => setDrill({ title: "🔄 " + t("Movimentações internas") + perTag, sub: t("por tipo"), rows: drillInternas, foot: { label: t("Volume interno"), value: pInternas } })} title={t("Ver detalhes")} style={{ flex: 1, minWidth: 240, textAlign: "left", cursor: "pointer", background: "var(--card)", border: "1px dashed var(--crasto-border)", borderRadius: 10, padding: "9px 13px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--crasto-text-muted)" }}>🔄 {t("Movimentações internas")} <span style={{ fontWeight: 500 }}>({internasList.length})</span></div>
                <div className="tnum" style={{ fontSize: 15, fontWeight: 700 }}>{money(pInternas)}</div>
                <div style={{ fontSize: 11, color: "var(--crasto-text-faint)" }}>{t("transf. entre contas próprias · aplicações · sócio — fora do resultado")}</div>
              </button>
            )}
            {fatList.length > 0 && (
              <button onClick={() => setDrill({ title: "🧾 " + t("Faturamento (não-caixa)") + perTag, sub: t("por ano"), rows: drillFat, foot: { label: t("Faturamento"), value: pFaturamento } })} title={t("Ver detalhes")} style={{ flex: 1, minWidth: 240, textAlign: "left", cursor: "pointer", background: "var(--card)", border: "1px dashed var(--crasto-border)", borderRadius: 10, padding: "9px 13px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--crasto-text-muted)" }}>🧾 {t("Faturamento (não-caixa)")} <span style={{ fontWeight: 500 }}>({fatList.length})</span></div>
                <div className="tnum" style={{ fontSize: 15, fontWeight: 700 }}>{money(pFaturamento)}</div>
                <div style={{ fontSize: 11, color: "var(--crasto-text-faint)" }}>{t("receita faturada oficial (RBA/Simples) — anos sem extrato de caixa")}</div>
              </button>
            )}
          </div>
        )}

        {/* Impostos pagos — detalhe (DARF, Simples/DAS, guias) */}
        {impostosList.length > 0 && (
          <details className="tbl-wrap" style={{ marginBottom: 12, padding: "10px 14px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>🧾 {t("Tributos")}{txYear !== "todos" ? " · " + txYear : ""} — <span style={{ color: "var(--fin-red)" }}>{money(pImpostos)}</span> <span style={{ color: "var(--crasto-text-muted)", fontWeight: 500 }}>({impostosList.length})</span></summary>
            <div style={{ marginTop: 8 }}>
              {impostosList.map((r: any) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, padding: "6px 0", borderTop: "1px solid var(--crasto-border-soft)" }}>
                  <span className="tnum" style={{ color: "var(--crasto-text-muted)", whiteSpace: "nowrap" }}>{r.transaction_date ? new Date(ymd(r.transaction_date) + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                  <span style={{ flex: 1 }}>{r.description}</span>
                  <b style={{ color: "var(--fin-red)", whiteSpace: "nowrap" }}>{money(Number(r.amount || 0))}</b>
                </div>
              ))}
            </div>
          </details>
        )}

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
                  <td>
                    <div className="nm">{r.description}</div>
                    <div className="mt" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 5, background: bankOf(r) === "Nubank" ? "rgba(130,10,209,.12)" : bankOf(r) === "Itaú" ? "rgba(236,112,20,.14)" : "var(--crasto-bg-soft)", color: bankOf(r) === "Nubank" ? "#820AD1" : bankOf(r) === "Itaú" ? "#B8631A" : "var(--crasto-text-muted)" }}>{bankOf(r)}</span>
                      {isInterna(r) && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--crasto-text-faint)" }}>🔄 {t("interna")}</span>}
                      {r.contact_name && <span style={{ color: "var(--crasto-text-muted)" }}>{r.contact_name}</span>}
                    </div>
                  </td>
                  <td>{r.category || "—"}</td>
                  <td><Pill tone={r.type === "income" ? "ok" : "warn"}>{r.type === "income" ? t("Entrada") : t("Saída")}</Pill></td>
                  <td className="tnum" style={{ textAlign: "right", fontWeight: 700, color: r.type === "income" ? "var(--fin-green)" : "var(--fin-orange)" }}>{r.type === "income" ? "+" : "−"}{money(Number(r.amount || 0))}</td>
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
      </>) : tab === "cobranca" ? (<>
        {/* Painel de recebimentos por parcela — ver vencimentos de todos os clientes + anexar comprovante */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div className="catsearch" style={{ margin: 0, flex: 1, minWidth: 220 }}><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Buscar cliente…")} /></div>
        </div>
        <div className="cli-chips" style={{ marginBottom: 12 }}>
          {COB_FILTROS.map((f) => <button key={f.key} className={"cli-chip" + (cobFiltro === f.key ? " on" : "")} onClick={() => setCobFiltro(f.key)}>{t(f.label)}<span className="cli-chip-n">{cobCount(f.key)}</span></button>)}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{t("Cliente")}</th><th>{t("Parcela")}</th><th>{t("Vencimento")}</th>
              <th style={{ textAlign: "right" }}>{t("Valor")}</th><th>{t("Status")}</th>
              <th>{t("Comprovante")}</th><th style={{ textAlign: "right" }}>{t("Ação")}</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={{ color: "var(--crasto-text-muted)", padding: 14 }}>{t("Carregando…")}</td></tr> :
               cobRows.length === 0 ? <tr><td colSpan={7} style={{ color: "var(--crasto-text-muted)", padding: 14 }}>{t("Nada com esse filtro.")}</td></tr> :
               cobRows.map((row, i) => {
                 const c = cobClass(row);
                 const cor = c === "pago" ? "var(--fin-green)" : c === "vencida" ? "#B83A3A" : c === "hoje" ? "#B8863A" : "#3E6FB8";
                 const lbl = c === "pago" ? t("Pago") : c === "vencida" ? t("Vencido") : c === "hoje" ? t("Vence hoje") : t("A vencer");
                 const semComp = row.status === "paid" && !row.proof_url;
                 return (
                   <tr key={row.r.id + "-" + row.inst + "-" + i}>
                     <td><div className="nm">{row.r.contact_name || "—"}</div>{row.r.description && <div className="mt" style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}>{row.r.description}</div>}</td>
                     <td className="tnum">{row.parcelada ? `${row.inst}/${row.total}` : "—"}</td>
                     <td className="tnum" style={{ whiteSpace: "nowrap" }}>{row.venc ? brDate(row.venc) : "—"}</td>
                     <td className="tnum" style={{ textAlign: "right", fontWeight: 600 }}>{money(row.valor)}</td>
                     <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: cor }} />{lbl}{row.paid_date ? <span style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}> · {brDate(row.paid_date)}</span> : null}</span></td>
                     <td>
                       {row.parcelada ? (
                         <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                           <DocField prefix="financeiro" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic" label={t("Anexar comprovante")} path={row.proof_url} name={row.proof_note} onChange={(path, name) => saveParcProof(row.r, row.inst, path, name)} />
                           {semComp && <span style={{ fontSize: 11, color: "#B83A3A" }}>⚠ {t("comprovante faltando")}</span>}
                         </div>
                       ) : <span style={{ color: "var(--crasto-text-faint)" }}>—</span>}
                     </td>
                     <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                       {row.parcelada
                         ? <button className="linkbtn" disabled={busy} onClick={() => toggleInstallment(row.r, row.inst)}>{row.status === "paid" ? t("Reabrir") : t("Marcar pago")}</button>
                         : <button className="linkbtn" disabled={busy || row.status === "paid"} onClick={() => markPaid(row.r)}>{row.status === "paid" ? t("Pago") : t("Marcar pago")}</button>}
                     </td>
                   </tr>
                 );
               })}
            </tbody>
          </table>
        </div>
      </>) : tab === "conciliacao" ? (
        <Conciliacao rec={rec} reload={reload} flash={flash} />
      ) : tab === "pagar" ? (<>
        {/* A Pagar — layout v3 APROVADO (2026-08-27): componente dedicado com dado real.
            Substitui os KPIs antigos, o CustoIA embedded e a tabela agrupada. */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => newAccount("payable")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo lançamento")}</span></button>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { setCf({ ...C_EMPTY }); setCOpen(true); }}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo custo")}</span></button>
        </div>
        <FinanceiroAPagarV3 pay={pay} costs={costs} reload={reload} onEdit={(id) => { const it = payItems.find((p) => p.id === id); if (it) editItem(it); }} />
      </>) : tab === "receber" ? (<>
        {/* A Receber — layout v3 APROVADO (2026-08-27): componente dedicado (competência × caixa) com dado real. */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <button className={"crasto-btn crasto-btn--sm " + (recOnly ? "crasto-btn--primary" : "crasto-btn--ghost")} onClick={toggleRecOnly} title={t("Mostrar só as contas recorrentes — a origem do MRR")}><span className="crasto-btn__icon"><Repeat size={14} /></span><span className="crasto-btn__label">{t("Só recorrentes")}{recOnly ? " ✓" : ""}</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => newAccount("receivable")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo recebível")}</span></button>
        </div>
        <FinanceiroAReceberV3 rec={recOnly ? rec.filter(isRecurring) : rec} reload={reload} />
      </>) : !built ? (
        <div className="card"><Empty><p><strong>{t("Em breve.")}</strong> {t("Esta aba está em construção — em breve você poderá gerenciar isso por aqui.")}</p></Empty></div>
      ) : (<>
        {/* barra de ação */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div className="catsearch" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Pesquisar…")} />
          </div>
          {/* Filtro personalizado por período — calendário estilizado (projeções) */}
          <div style={{ position: "relative" }}>
            <button className={"crasto-btn crasto-btn--sm " + (per ? "crasto-btn--primary" : "crasto-btn--ghost")} onClick={() => setPerOpen((o) => !o)} title={t("Filtrar por período (projeções)")}>
              <span className="crasto-btn__icon"><Filter size={14} /></span>
              <span className="crasto-btn__label">{per ? per.label : t("Filtro por período")}</span>
              {per && <span onClick={(e) => { e.stopPropagation(); setPer(null); setPerOpen(false); }} style={{ marginLeft: 6, display: "inline-flex" }}><X size={13} /></span>}
            </button>
            {perOpen && <>
              <div onClick={() => setPerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
              <div className="card" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40, width: 330, padding: 16, boxShadow: "0 20px 44px -12px rgba(0,0,0,.45)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><Filter size={14} /> {t("Filtrar por período")}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {perPresets().map((p) => <button key={p.key} className={"crasto-btn crasto-btn--sm " + (per && per.from === p.from && per.to === p.to ? "crasto-btn--primary" : "crasto-btn--ghost")} onClick={() => { setPer({ from: p.from, to: p.to, label: p.label }); setPerOpen(false); }}><span className="crasto-btn__label">{p.label}</span></button>)}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--crasto-text-muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>{t("Personalizado")}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--crasto-text-muted)" }}>{t("De")}<input id="finper-from" type="date" defaultValue={per?.from || mesAtual + "-01"} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--crasto-border-soft)", background: "var(--crasto-surface)", color: "var(--crasto-text-primary)", fontSize: 12 }} /></label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--crasto-text-muted)" }}>{t("Até")}<input id="finper-to" type="date" defaultValue={per?.to || ""} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--crasto-border-soft)", background: "var(--crasto-surface)", color: "var(--crasto-text-primary)", fontSize: 12 }} /></label>
                  <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { const fr = (document.getElementById("finper-from") as HTMLInputElement)?.value; const to2 = (document.getElementById("finper-to") as HTMLInputElement)?.value; if (fr && to2 && fr <= to2) { setPer({ from: fr, to: to2, label: new Date(fr + "T00:00:00").toLocaleDateString("pt-BR") + " – " + new Date(to2 + "T00:00:00").toLocaleDateString("pt-BR") }); setPerOpen(false); } }}><span className="crasto-btn__label">{t("Aplicar")}</span></button>
                </div>
              </div>
            </>}
          </div>
          {tab === "receber" && <button className={"crasto-btn crasto-btn--sm " + (recOnly ? "crasto-btn--primary" : "crasto-btn--ghost")} onClick={toggleRecOnly} title={t("Mostrar só as contas recorrentes — a origem do MRR")} aria-pressed={recOnly}><span className="crasto-btn__icon"><Repeat size={14} /></span><span className="crasto-btn__label">{t("Só recorrentes")}{recOnly ? " ✓" : ""}</span></button>}
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => newAccount(tab === "pagar" ? "payable" : "receivable")}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo lançamento")}</span></button>
          {tab === "pagar" && <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => { setCf({ ...C_EMPTY }); setCOpen(true); }}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Novo custo")}</span></button>}
          {tab === "pagar" && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "var(--crasto-text-muted)" }} title={t("Data de referência do PDF")}>{t("PDF em")}<input type="date" value={pdfRef} onChange={(e) => setPdfRef(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--crasto-border-soft)", background: "var(--crasto-surface)", color: "var(--crasto-text-primary)", fontSize: 12 }} /></label>}
          {tab === "pagar" && <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={exportPagarPDF} title={t("Exportar a lista completa do filtro atual em PDF")}><span className="crasto-btn__label">⭳ {t("Exportar PDF")}</span></button>}
        </div>

        {/* resumo (só A Pagar tem os cards de custo) */}
        {tab === "pagar" && (<>
          <div className="kpis" style={{ marginBottom: 10 }}>
            <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("A pagar no mês"), rows: rowsPagarMes, foot: { label: t("Total/mês"), value: aPagarMes } })} title={t("Ver detalhes")}><div className="lab">{t("A pagar no mês")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(aPagarMes)}</div><div className="delta">{t("ferramenta + infra + serviço")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Total no ano"), rows: rowsAnoTudo, foot: { label: t("Total no ano"), value: totalAno } })} title={t("Ver detalhes")}><div className="lab">{t("Total no ano")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(totalAno)}</div><div className="delta">{t("Mensal×12 + Anual + Pontual")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Renovações anuais"), rows: rowsAnuais, foot: { label: t("Total anual (pago adiantado)"), value: custoAnualCat() } })} title={t("Assinaturas anuais já pagas — renovam 1×/ano")}><div className="lab">{t("Renovações anuais")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(custoAnualCat())}</div><div className="delta">{t("pago adiantado no ano")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Resultado do mês"), rows: rowsResultado, foot: { label: t("Resultado"), value: resultadoMes } })} title={t("Resultado do mês = a receber − a pagar")}><div className="lab">{t("Resultado do mês")}</div><div className="val tnum" style={{ fontSize: 20, color: resultadoMes < 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{money(resultadoMes)}</div><div className="delta">{t("recebe − paga")}</div></button>
          </div>
          {/* filtro por categoria — pedido do Crasto: ferramenta · infraestrutura · serviço · salário */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {([["", t("Todos")], ["ferramenta", t("Ferramenta")], ["infraestrutura", t("Infraestrutura")], ["servico", t("Serviço")], ["salario", t("Salário")]] as [string, string][]).map(([v, l]) => (
              <button key={v || "todos"} className={"crasto-btn crasto-btn--sm " + ((catF || "") === v ? "crasto-btn--primary" : "crasto-btn--ghost")} onClick={() => setCatF(v || null)}><span className="crasto-btn__label">{l}{v && custoMensalCat(v) > 0 ? " · " + money(custoMensalCat(v)) : ""}</span></button>
            ))}
          </div>
        </>)}

        {/* análise de gasto de IA por período (só A Pagar) — calendário personalizável + médias + 2025×2026 */}
        {/* IA consolidada em A Pagar (2026-08-27): painel completo com Crasto (interno) × Cliente (COGS), por plataforma e por cliente. Substitui a antiga aba "Custos de IA" e o resumo AiSpendPanel (que duplicava). */}
        {tab === "pagar" && <div style={{ marginBottom: 14 }}><CustoIA embedded /></div>}

        {/* resumo de recebíveis recorrentes (só A Receber) — quebra o "A Receber" em MRR + contratos */}
        {tab === "receber" && (
          <div className="kpis kpis--5" style={{ marginBottom: 14 }}>
            <button className="kpi navy kpi-btn" onClick={() => setDrill({ title: t("Recorrente / mês (MRR)"), rows: rowsMRR, foot: { label: t("MRR"), value: mrrMensal } })} title={t("Ver detalhes")}><div className="lab">{t("Recorrente / mês (MRR)")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(mrrMensal)}</div><div className="delta">{t("ARR")} {money(mrrMensal * 12)}/{t("ano")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("A receber no mês"), rows: rowsRecMes, foot: { label: t("Total do mês"), value: totalReceberMes } })} title={t("Ver detalhes")}><div className="lab">{t("A receber")} {noMesLbl}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(totalReceberMes)}</div><div className="delta">{money(recorRecebido)} {t("recebido")} · {money(aReceberMes)} {t("falta")}</div></button>
            <button className="kpi g kpi-btn" onClick={() => setDrill({ title: t("Recebido no mês"), rows: rowsRecebidoMes, foot: { label: t("Recebido no mês"), value: recebidoMes } })} title={t("Ver detalhes")}><div className="lab">{t("Recebido")} {noMesLbl}</div><div className="val tnum" style={{ fontSize: 20, color: "var(--fin-green)" }}>{money(recebidoMes)}</div><div className="delta">{per ? t("entrou no período") : t("já entrou este mês")}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Com contrato"), rows: rowsComContrato, foot: { label: t("Saldo com contrato"), value: comContrato } })} title={t("Ver detalhes")}><div className="lab">{t("Com contrato")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(comContrato)}</div><div className="delta">{t("{n} contratos · saldo", { n: nContratos })}</div></button>
            <button className="kpi kpi-btn" onClick={() => setDrill({ title: t("Sem contrato"), rows: rowsSemContrato, foot: { label: t("Saldo sem contrato"), value: semContrato } })} title={t("Ver detalhes")}><div className="lab">{t("Sem contrato")}</div><div className="val tnum" style={{ fontSize: 20 }}>{money(semContrato)}</div><div className="delta">{t("avulsos · saldo")}</div></button>
          </div>
        )}

        {/* status cards */}
        <div className="finstatus">
          <button type="button" className="fs red" onClick={() => setStatusF(statusF === "vencidos" ? "todos" : "vencidos")} style={{ font: "inherit", textAlign: "left", width: "100%", cursor: "pointer", boxShadow: statusF === "vencidos" ? "inset 0 0 0 2px var(--fin-red)" : undefined }}><span>{t("Vencidos")}</span><b>{money(stVencidos)}</b></button>
          <button type="button" className="fs amber" onClick={() => setStatusF(statusF === "hoje" ? "todos" : "hoje")} style={{ font: "inherit", textAlign: "left", width: "100%", cursor: "pointer", boxShadow: statusF === "hoje" ? "inset 0 0 0 2px var(--fin-orange)" : undefined }}><span>{t("Vencem hoje")}</span><b>{money(stHoje)}</b></button>
          <button type="button" className="fs blue" onClick={() => setStatusF(statusF === "avencer" ? "todos" : "avencer")} style={{ font: "inherit", textAlign: "left", width: "100%", cursor: "pointer", boxShadow: statusF === "avencer" ? "inset 0 0 0 2px var(--fin-blue)" : undefined }}><span>{t("A vencer")}</span><b>{money(stAvencer)}</b></button>
          <button type="button" className="fs green" onClick={() => setStatusF(statusF === "pagos" ? "todos" : "pagos")} style={{ font: "inherit", textAlign: "left", width: "100%", cursor: "pointer", boxShadow: statusF === "pagos" ? "inset 0 0 0 2px #067647" : undefined }}><span>{tab === "pagar" ? t("Pagos") : t("Recebidos")}</span><b>{money(stPagos)}</b></button>
          <button type="button" className="fs" onClick={() => { setStatusF("todos"); setCatF(null); }} title={t("Ver tudo (limpar filtro)")} style={{ font: "inherit", textAlign: "left", width: "100%", cursor: "pointer" }}><span>{tab === "pagar" ? t("Total a pagar (tudo)") : t("Total a receber (tudo)")}</span><b>{money(stTotal)}</b></button>
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
                    <td className="tnum" style={{ textAlign: "right", color: "var(--fin-green)" }}>{money(g.pago)}</td>
                    <td className="tnum" style={{ textAlign: "right", color: g.restante > 0 ? "var(--fin-orange)" : "var(--crasto-text-muted)" }}>{money(g.restante)}</td>
                    <td><Pill tone={stTone(g.status) as any}>{stLabel(g.status)}</Pill></td>
                  </tr>
                  {expanded[g.name] && g.list.map((i: any) => {
                    const parc = Array.isArray(i.payment_schedule) ? i.payment_schedule : [];
                    const venc = proxVenc(i);
                    return (
                    <Fragment key={i.id}>
                    <tr className="finrow">
                      <td></td>
                      <td colSpan={2}><div className="nm" style={{ fontSize: 13 }}>{i.description || i.contact_name}</div><div className="mt">{[i.category, i._kind === "cost" ? t("Custo") : t("Conta"), parc.length ? t("{n} parcelas", { n: parc.length }) : ""].filter(Boolean).join(" · ")}</div></td>
                      <td className="tnum">{venc ? new Date(venc + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{money(Number(i.amount || 0))}</td>
                      <td className="tnum" style={{ textAlign: "right", color: "var(--fin-green)" }}>{money(Number(i.amount_paid || 0))}</td>
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
                      const roEd = i._kind === "account"; // custo = parcela virtual (só leitura); conta = editável/baixável
                      return (
                      <Fragment key={i.id + "-p" + p.installment}>
                      <tr className={"finrow finparc" + (isEd ? " is-editing" : "")} style={{ cursor: roEd ? "pointer" : "default" }} title={roEd ? t("Clique para editar esta parcela") : t("Parcela do parcelamento (recorrente) — só leitura")} onClick={roEd ? () => (isEd ? (setParcEdit(null), setParcDraft(null)) : openParc(i, p)) : undefined}>
                        <td></td>
                        <td colSpan={2}>
                          <div className="mt" style={{ paddingLeft: 12 }}>{t("Parcela {k}/{n}", { k: p.installment, n: parc.length })} {roEd && <Pencil size={11} style={{ opacity: .4, verticalAlign: "-1px" }} />}</div>
                          <div style={{ paddingLeft: 12, color: TONE_COLOR[v.tone], fontSize: 11, fontWeight: 600 }}>{v.icon} {v.text}</div>
                        </td>
                        <td className="tnum">{p.date ? new Date(ymd(p.date) + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="tnum" style={{ textAlign: "right" }}>{money(Number(p.amount || 0))}</td>
                        <td className="tnum" style={{ textAlign: "right", color: "var(--fin-green)" }}>{money(p.status === "paid" ? Number(p.amount || 0) : 0)}</td>
                        <td className="tnum" style={{ textAlign: "right" }}>{money(p.status === "paid" ? 0 : Number(p.amount || 0))}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <Pill tone={p.status === "paid" ? "ok" : "info"}>{p.status === "paid" ? t("Paga") : t("Pendente")}</Pill>
                            {roEd && <button className="icobtn" title={p.status === "paid" ? t("Reabrir parcela") : t("Baixar parcela")} onClick={(e) => { e.stopPropagation(); toggleInstallment(i, p.installment); }}><CheckCircle2 size={13} /></button>}
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
      </>))}

      {/* Pop-up de detalhes de um card (drill-down) */}
      <Modal title={drill?.title || ""} open={!!drill} onClose={() => setDrill(null)} footer={drill?.goto ? (<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { if (drill.goto.cobFiltro) setCobFiltro(drill.goto.cobFiltro); setTab(drill.goto.tab); setDrill(null); }}><span className="crasto-btn__label">{(drill.goto.label || t("Abrir módulo")) + " →"}</span></button>) : undefined}>
        {drill && (drill.rows.length === 0
          ? <div style={{ padding: 22, color: "var(--crasto-text-muted)", textAlign: "center" }}>{t("Nada aqui neste momento. ✓")}</div>
          : <div>
              {drill.rows.map((r: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: "1px solid var(--crasto-border-soft, #f0f0f0)" }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 12, color: "var(--crasto-text-muted, #667085)" }}>{r.detail}</div></div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tnum" style={{ fontWeight: 700, color: r.value < 0 ? "var(--fin-orange)" : undefined }}>{money(r.value)}</span>
                    {r.status && <Pill tone={(r.tone || "mute") as any}>{r.status}</Pill>}
                  </div>
                </div>
              ))}
              {drill.foot && <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 2px 2px", marginTop: 6, borderTop: "2px solid var(--crasto-border, #e5e7eb)", fontWeight: 800, fontSize: 16 }}><span>{drill.foot.label}</span><span className="tnum" style={{ color: drill.foot.value < 0 ? "var(--fin-orange)" : "var(--fin-green)" }}>{money(drill.foot.value)}</span></div>}
            </div>
        )}
      </Modal>

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
                                <span style={{ color: "var(--fin-orange)" }}>
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
          <Field label={t("Vínculo (se pessoa/prestador)")}><select value={af.vinculo || ""} onChange={(e) => setAf({ ...af, vinculo: e.target.value })}><option value="">—</option><option value="PJ">PJ</option><option value="CLT">CLT</option><option value="Terceirizado">Terceirizado</option></select></Field>
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
          <Field label={t("Vínculo (se pessoa/prestador)")}><select value={cf.vinculo || ""} onChange={(e) => setCf({ ...cf, vinculo: e.target.value })}><option value="">—</option><option value="PJ">PJ</option><option value="CLT">CLT</option><option value="Terceirizado">Terceirizado</option></select></Field>
          <Field label={t("Custo mensal ANTERIOR (R$) — gera card de Redução de despesas")}><input type="number" step="0.01" value={cf.prev_monthly} onChange={(e) => setCf({ ...cf, prev_monthly: e.target.value })} placeholder={t("ex.: plano antigo por mês")} /></Field>
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
