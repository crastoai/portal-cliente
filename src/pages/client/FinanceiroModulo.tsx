// ============================================================================
// MÓDULO FINANCEIRO — visão do CLIENTE (multitenant). Mostra APENAS o caixa da
// empresa do próprio cliente: as RPCs fin_* escopam por owner_org_id = fin_scope_org()
// no banco, então este componente nunca vê dado de outra org. É uma tela LIMPA e
// genérica — sem nada específico da Crasto (nada de custo de IA, margem, ou narrativa
// de clientes da Crasto): esse ferramental é Núcleo e vive só no /admin.
// Rota: /app/financas. Reusa as classes visuais do Portal (card/tbl/Pill/money).
// ============================================================================
import { useMemo, useState } from "react";
import { Wallet, ArrowDownCircle, ArrowUpCircle, AlertTriangle, FileText, LineChart } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, useSort, SortTh } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const ymd = (v: any) => (v ? String(v).slice(0, 10) : "");
const fmtDate = (v: any) => { const d = ymd(v); if (!d) return "—"; const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };
const num = (v: any) => Number(v || 0);
const openBal = (a: any) => Math.max(0, num(a.amount) - num(a.amount_paid));
const isOpen = (a: any) => a.status !== "paid" && a.status !== "cancelled";
const arr = (x: any) => (Array.isArray(x) ? x : []);

type Tab = "cockpit" | "receber" | "pagar" | "tesouraria" | "documentos";

export default function FinanceiroModulo() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("cockpit");

  const { data, loading } = useAsync(async () => {
    const [acc, costs, tx, docs] = await Promise.all([
      services.finance.accounts.list().catch(() => [] as any[]),
      services.finance.costs.list(true).catch(() => [] as any[]),
      services.finance.transactions.list().catch(() => [] as any[]),
      services.finance.documents.list().catch(() => [] as any[]),
    ]);
    return { acc: arr(acc), costs: arr(costs), tx: arr(tx), docs: arr(docs) };
  }, []);

  const acc = data?.acc ?? [];
  const costs = data?.costs ?? [];
  const tx = data?.tx ?? [];
  const docs = data?.docs ?? [];
  const hoje = today();

  const rec = useMemo(() => acc.filter((a) => a.account_type === "receivable"), [acc]);
  const pay = useMemo(() => acc.filter((a) => a.account_type === "payable"), [acc]);

  // KPIs — honestos e simples, do caixa do próprio cliente.
  const aReceber = rec.filter(isOpen).reduce((s, r) => s + openBal(r), 0);
  const custosMensais = costs.filter((c) => c.is_active && c.recurrence === "mensal").reduce((s, c) => s + num(c.amount_brl), 0);
  const aPagarContas = pay.filter(isOpen).reduce((s, p) => s + openBal(p), 0);
  const aPagar = aPagarContas + custosMensais;
  const resultado = aReceber - aPagar;
  const vencRec = rec.filter((r) => isOpen(r) && ymd(r.due_date) && ymd(r.due_date) < hoje).reduce((s, r) => s + openBal(r), 0);
  const vencPay = pay.filter((p) => isOpen(p) && ymd(p.due_date) && ymd(p.due_date) < hoje).reduce((s, p) => s + openBal(p), 0);
  const vencidos = vencRec + vencPay;

  const KPIS: { key: Tab; icon: any; lab: string; val: number; tone?: string }[] = [
    { key: "receber", icon: ArrowDownCircle, lab: t("A receber (em aberto)"), val: aReceber },
    { key: "pagar", icon: ArrowUpCircle, lab: t("A pagar (em aberto)"), val: aPagar },
    { key: "cockpit", icon: LineChart, lab: t("Resultado projetado"), val: resultado },
    { key: "pagar", icon: AlertTriangle, lab: t("Vencidos"), val: vencidos, tone: vencidos > 0 ? "crit" : "ok" },
  ];

  const TABS: { key: Tab; label: string }[] = [
    { key: "cockpit", label: t("Cockpit") },
    { key: "receber", label: t("A Receber") },
    { key: "pagar", label: t("A Pagar") },
    { key: "tesouraria", label: t("Tesouraria") },
    { key: "documentos", label: t("Documentos") },
  ];

  const statusTone = (s: string) => (s === "paid" ? "ok" : s === "cancelled" ? "mute" : s === "partial" ? "warn" : "warn");
  const statusLabel = (s: string) => (s === "paid" ? t("Pago") : s === "cancelled" ? t("Cancelado") : s === "partial" ? t("Parcial") : t("Em aberto"));

  return (
    <div>
      <PageHead eyebrow={t("Módulo")} title={t("Financeiro")} sub={t("O caixa da sua empresa: contas a receber, a pagar, fluxo e documentos.")} />

      {loading ? <Empty>{t("Carregando…")}</Empty> : (
        <>
          {/* KPIs — clicáveis, levam à aba correspondente (regra: card de indicador abre o detalhe) */}
          <div className="finmod-kpis">
            {KPIS.map((k, i) => (
              <button key={i} className="finmod-kpi" onClick={() => setTab(k.key)}>
                <div className="finmod-kpi-h"><k.icon size={16} /><span>{k.lab}</span></div>
                <div className={"finmod-kpi-v" + (k.tone === "crit" ? " crit" : "")}>{money(k.val)}</div>
              </button>
            ))}
          </div>

          {/* Abas */}
          <div className="finmod-tabs" role="tablist">
            {TABS.map((tb) => (
              <button key={tb.key} role="tab" aria-selected={tab === tb.key} className={"finmod-tab" + (tab === tb.key ? " on" : "")} onClick={() => setTab(tb.key)}>{tb.label}</button>
            ))}
          </div>

          {tab === "cockpit" && (
            <div className="finmod-cockpit">
              <div className="card">
                <h3>{t("Resumo do caixa")}</h3>
                <div className="finmod-rows">
                  <div><span>{t("A receber em aberto")}</span><b className="tnum">{money(aReceber)}</b></div>
                  <div><span>{t("A pagar em aberto")}</span><b className="tnum">{money(aPagar)}</b></div>
                  <div><span>{t("Custos recorrentes (mês)")}</span><b className="tnum">{money(custosMensais)}</b></div>
                  <div className="finmod-total"><span>{t("Resultado projetado")}</span><b className={"tnum" + (resultado < 0 ? " crit" : "")}>{money(resultado)}</b></div>
                </div>
              </div>
              <div className="card">
                <h3>{t("Atenção")}</h3>
                {vencidos > 0
                  ? <p className="csub"><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{t("Você tem {v} em títulos vencidos.", { v: money(vencidos) })}</p>
                  : <p className="csub">{t("Nenhum título vencido. Tudo em dia.")}</p>}
                <div className="finmod-mini">
                  <div><span>{t("Contas a receber")}</span><b>{rec.length}</b></div>
                  <div><span>{t("Contas a pagar")}</span><b>{pay.length}</b></div>
                  <div><span>{t("Custos ativos")}</span><b>{costs.length}</b></div>
                  <div><span>{t("Documentos")}</span><b>{docs.length}</b></div>
                </div>
              </div>
            </div>
          )}

          {tab === "receber" && <ContasTabela rows={rec} kind="receber" statusTone={statusTone} statusLabel={statusLabel} t={t} />}
          {tab === "pagar" && <ContasTabela rows={pay} kind="pagar" costs={costs} statusTone={statusTone} statusLabel={statusLabel} t={t} />}
          {tab === "tesouraria" && <Tesouraria rows={tx} t={t} />}
          {tab === "documentos" && <Documentos rows={docs} t={t} />}
        </>
      )}

      <style>{`
        .finmod-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
        @media(max-width:720px){.finmod-kpis{grid-template-columns:repeat(2,1fr)}}
        .finmod-kpi{text-align:left;background:var(--crasto-surface,#fff);border:1px solid var(--crasto-border,#e5e7eb);border-radius:12px;padding:14px 16px;cursor:pointer;transition:border-color .15s,transform .05s}
        .finmod-kpi:hover{border-color:var(--crasto-primary,#6E9CE8)}
        .finmod-kpi:active{transform:translateY(1px)}
        .finmod-kpi-h{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--crasto-text-secondary,#64748b)}
        .finmod-kpi-v{font-size:24px;font-weight:700;margin-top:6px;font-variant-numeric:tabular-nums;color:var(--crasto-text-primary,#0f172a)}
        .finmod-kpi-v.crit{color:#C0362C}
        .finmod-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--crasto-border,#e5e7eb);margin-bottom:16px}
        .finmod-tab{background:none;border:none;border-bottom:2px solid transparent;padding:9px 14px;font-size:14px;font-weight:600;color:var(--crasto-text-secondary,#64748b);cursor:pointer;margin-bottom:-1px}
        .finmod-tab.on{color:var(--crasto-primary,#2C5FCC);border-bottom-color:var(--crasto-primary,#2C5FCC)}
        .finmod-cockpit{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        @media(max-width:720px){.finmod-cockpit{grid-template-columns:1fr}}
        .finmod-rows>div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--crasto-border,#eef1f6);font-size:14px}
        .finmod-rows .finmod-total{border-bottom:none;font-weight:700;padding-top:12px}
        .finmod-rows b.crit,.tnum.crit{color:#C0362C}
        .finmod-mini{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin-top:10px}
        .finmod-mini>div{display:flex;justify-content:space-between;font-size:13.5px;color:var(--crasto-text-secondary,#64748b)}
        .finmod-mini b{color:var(--crasto-text-primary,#0f172a)}
      `}</style>
    </div>
  );
}

function ContasTabela({ rows, kind, costs, statusTone, statusLabel, t }: { rows: any[]; kind: "receber" | "pagar"; costs?: any[]; statusTone: (s: string) => string; statusLabel: (s: string) => string; t: (k: string, p?: any) => string }) {
  const { sort, toggle, sorted } = useSort("due", 1);
  const list = sorted(rows, (r, col) => {
    switch (col) {
      case "desc": return r.description || r.contact_name || "";
      case "due": return r.due_date ? new Date(ymd(r.due_date) + "T00:00:00") : null;
      case "amount": return openBal(r);
      case "status": return statusLabel(r.status);
      default: return r.due_date ? new Date(ymd(r.due_date) + "T00:00:00") : null;
    }
  });
  const custos = arr(costs).filter((c) => c.is_active);
  if (!rows.length && !custos.length) return <Empty><p><strong>{t("Nada por aqui ainda.")}</strong> {kind === "receber" ? t("Seus recebíveis aparecerão aqui.") : t("Suas contas a pagar aparecerão aqui.")}</p></Empty>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>
          <SortTh col="desc" sort={sort} toggle={toggle}>{t("Descrição")}</SortTh>
          <SortTh col="due" sort={sort} toggle={toggle}>{t("Vencimento")}</SortTh>
          <SortTh col="amount" sort={sort} toggle={toggle}>{t("Saldo")}</SortTh>
          <SortTh col="status" sort={sort} toggle={toggle}>{t("Status")}</SortTh>
        </tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>{r.description || r.contact_name || "—"}</td>
              <td>{fmtDate(r.due_date)}</td>
              <td className="tnum">{money(openBal(r))}</td>
              <td><Pill tone={statusTone(r.status) as any}>{statusLabel(r.status)}</Pill></td>
            </tr>
          ))}
          {kind === "pagar" && custos.map((c) => (
            <tr key={"c-" + c.id}>
              <td>{c.description || c.vendor_name || "—"}</td>
              <td>{fmtDate(c.next_payment_date)}</td>
              <td className="tnum">{money(num(c.amount_brl))}</td>
              <td><Pill tone="warn">{c.recurrence === "mensal" ? t("Recorrente") : t("Custo")}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tesouraria({ rows, t }: { rows: any[]; t: (k: string, p?: any) => string }) {
  if (!rows.length) return <Empty><p><strong>{t("Sem lançamentos de caixa.")}</strong> {t("Entradas e saídas registradas aparecerão aqui.")}</p></Empty>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>{t("Data")}</th><th>{t("Descrição")}</th><th>{t("Tipo")}</th><th>{t("Valor")}</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td>{fmtDate(x.transaction_date)}</td>
              <td>{x.description || x.contact_name || "—"}</td>
              <td><Pill tone={x.type === "income" ? "ok" : "mute"}>{x.type === "income" ? t("Entrada") : t("Saída")}</Pill></td>
              <td className="tnum">{money(num(x.amount))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Documentos({ rows, t }: { rows: any[]; t: (k: string, p?: any) => string }) {
  if (!rows.length) return <Empty><p><strong>{t("Nenhum documento.")}</strong> {t("Notas, guias e comprovantes aparecerão aqui.")}</p></Empty>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>{t("Documento")}</th><th>{t("Categoria")}</th><th>{t("Competência")}</th><th>{t("Enviado")}</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td><FileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{d.name || "—"}</td>
              <td>{d.category || "—"}</td>
              <td>{d.competencia || "—"}</td>
              <td>{fmtDate(d.uploaded_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
