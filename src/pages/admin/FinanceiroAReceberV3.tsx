// ============================================================================
// A RECEBER — layout v3 aprovado (2026-08-27). Reproduz o mockup com DADO REAL de `rec`:
// 3 KPIs (MRR hero · Recebido no mês/caixa · A receber futuro) + toggle Competência×Caixa +
// tabela Contratos & recebíveis + explicação do caso Dr. Francisco. CSS escopado `.frv3`.
// ============================================================================
import { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "../../ui/ui";
import { services } from "../../services";

const BRL = (v: number) => money(v);
const ymd = (v: any) => (v ? String(v).slice(0, 10) : "");
function fmtDT(v: any): string {
  if (!v) return "—";
  const s = String(v); const d = s.slice(0, 10).split("-"); if (d.length !== 3) return s;
  let out = `${d[2]}/${d[1]}/${d[0]}`;
  const tm = s.match(/[T ](\d{2}:\d{2}(?::\d{2})?)/);
  if (tm && tm[1] !== "00:00" && tm[1] !== "00:00:00") out += " " + (tm[1].length === 5 ? tm[1] + ":00" : tm[1]);
  return out;
}
const arr = (x: any) => (Array.isArray(x) ? x : []);
// ícones (SVG inline, sem dependência) — ações de parcela
const IcoCheck = ({ size = 16 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>);
const IcoX = ({ size = 15 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);
const IcoPencil = ({ size = 15 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.5 3.5 4 4L7 21l-4 1 1-4z" /><path d="M14.5 5.5l4 4" /></svg>);
const IcoCheckCircle = ({ size = 18, filled = false }: { size?: number; filled?: boolean }) => filled
  ? (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5.03 7.59-6 6a1 1 0 0 1-1.42 0l-3-3a1 1 0 1 1 1.42-1.42l2.29 2.3 5.29-5.3a1 1 0 0 1 1.42 1.42z" /></svg>)
  : (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></svg>);
// Meses de vigência do contrato: usa a vigência declarada; se ausente, cai para o nº de parcelas/installments.
const mesesContrato = (r: any) => {
  const cv = Number(r.contract_validity_value || 0), u = r.contract_validity_unit || "months";
  const m = u === "years" ? cv * 12 : u === "days" ? Math.max(1, Math.round(cv / 30)) : cv;
  if (m > 0) return m;
  return Number(r.payment_installments || 0) || arr(r.payment_schedule).length || 0;
};
// MRR = só recorrência verdadeira (recurrence='mensal'); avulsos/pontuais ficam fora (seguem no caixa/recebido).
const isRecurring = (r: any) => r.recurrence === "mensal";
// Mensalidade RECONHECIDA (competência): dentro da vigência, total do contrato ÷ meses de contrato.
// Ex.: Carneiro R$10.000 ÷ 12 = ~R$833/mês, mesmo que as parcelas (caixa) sejam 5×R$2.000.
const mensalDe = (r: any) => {
  const m = mesesContrato(r); const total = Number(r.contract_total || 0);
  if (total > 0 && m > 0) return total / m;                     // contrato com prazo → total ÷ meses
  if (r.recurrence === "mensal") return Number(r.amount || 0);  // mensal puro sem contrato fechado
  const ps = arr(r.payment_schedule); if (ps.length && Number(r.amount || 0) > 0) return Number(r.amount) / ps.length;
  return Number(r.amount || 0);
};
const modeloDe = (r: any) => r.recurrence === "mensal" ? "Mensal" : (arr(r.payment_schedule).length ? "Parcelado" : "Pontual");
const proxVenc = (r: any) => { const ps = arr(r.payment_schedule); const nxt = ps.filter((p: any) => p.status !== "paid").map((p: any) => ymd(p.date)).filter(Boolean).sort()[0]; return nxt || ymd(r.due_date); };

export default function FinanceiroAReceberV3({ rec, reload }: { rec: any[]; reload?: () => void }) {
  const [view, setView] = useState<"comp" | "caixa">("comp");
  const [drill, setDrill] = useState<null | "mrr" | "arr" | "caixa" | "variavel" | "futuro">(null);
  const mes = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  // ---- parcelas: expandir + marcar recebida + editar (persistido em payment_schedule) ----
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillExp, setDrillExp] = useState<Set<string>>(new Set());
  const toggleDrillExp = (k: string) => setDrillExp((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const [busyP, setBusyP] = useState(false);
  const [parcEdit, setParcEdit] = useState<{ id: string; idx: number; date: string; amount: string } | null>(null);
  // atalhos de período (fluxo): 30 dias (padrão) / 1m / 3m / 6m / 1 ano — dirige "Recebido no período"
  const _dt = new Date(today + "T00:00:00");
  const _bd = (n: number) => { const d = new Date(_dt); d.setDate(d.getDate() - n + 1); return d.toISOString().slice(0, 10); };
  const _bm = (n: number) => { const d = new Date(_dt); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
  const QUICK = [
    { key: "1m", label: "1 mês", from: _bm(1), to: today },
    { key: "3m", label: "3 meses", from: _bm(3), to: today },
    { key: "6m", label: "6 meses", from: _bm(6), to: today },
    { key: "1a", label: "1 ano", from: _bm(12), to: today },
  ];
  const [per, setPer] = useState<{ from: string; to: string; label: string }>({ from: QUICK[0].from, to: QUICK[0].to, label: QUICK[0].label });
  const perFrom = per.from, perTo = per.to;
  const toggleExp = (id: string) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const saveSchedule = async (raw: any, ps: any[]) => {
    const recebido = ps.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const total = ps.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const status = recebido >= total - 0.005 ? "paid" : (raw.status === "cancelled" ? "cancelled" : "pending");
    setBusyP(true);
    try { await services.finance.accounts.save({ ...raw, payment_schedule: ps, amount_paid: recebido, status }); reload?.(); }
    catch (e: any) { alert("Erro ao salvar parcela: " + (e?.message || e)); } finally { setBusyP(false); }
  };
  const markParcela = (raw: any, ps: any[], idx: number, paid: boolean) =>
    saveSchedule(raw, ps.map((p: any, k: number) => k === idx ? { ...p, status: paid ? "paid" : "pending", paid_date: paid ? today : "", amount_paid: paid ? Number(p.amount || 0) : 0 } : p));
  const saveParcelaEdit = (raw: any, ps: any[]) => {
    if (!parcEdit) return; const val = parseFloat(parcEdit.amount);
    const nps = ps.map((p: any, k: number) => k === parcEdit.idx ? { ...p, date: parcEdit.date || p.date, amount: isNaN(val) ? Number(p.amount || 0) : val, amount_paid: p.status === "paid" ? (isNaN(val) ? Number(p.amount || 0) : val) : 0 } : p);
    setParcEdit(null); saveSchedule(raw, nps);
  };

  const ativos = useMemo(() => (rec || []).filter((r: any) => r.status !== "cancelled"), [rec]);
  const recebidoMesDe = (r: any) => {
    const ps = arr(r.payment_schedule);
    if (ps.length) return ps.filter((p: any) => p.status === "paid" && (ymd(p.paid_date || p.date)).slice(0, 7) === mes).reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    return (ymd(r.payment_date).slice(0, 7) === mes) ? Number(r.amount_paid || 0) : 0;
  };
  const rows = ativos.map((r: any) => {
    const ps = arr(r.payment_schedule);
    const total = ps.length ? ps.reduce((s: number, p: any) => s + Number(p.amount || 0), 0) : Number(r.amount || 0);
    const recebido = ps.length ? ps.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.amount || 0), 0) : Number(r.amount_paid || 0);
    const aReceber = Math.max(0, total - recebido);
    const venc = proxVenc(r);
    const pagas = ps.filter((p: any) => p.status === "paid").length;
    const status = aReceber <= 0.005 ? "Recebido" : (venc && venc < today ? "Vencido" : (ps.length ? `Parcela ${pagas + 1}/${ps.length}` : "Em dia"));
    return { id: r.id, cliente: r.contact_name || r.description || "—", detalhe: ps.length ? `contrato ${BRL(total)} · ${ps.length}×` : (r.description || "recorrente"), modelo: modeloDe(r), venc, reconhecido: mensalDe(r), recebidoMes: recebidoMesDe(r), recebido, aReceber, status, stTone: aReceber <= 0.005 ? "pago" : (venc && venc < today ? "venc" : "pend"), ps, raw: r };
  });

  const mrr = ativos.filter(isRecurring).reduce((a: number, r: any) => a + mensalDe(r), 0);
  const recebidoMes = rows.reduce((a, r) => a + r.recebidoMes, 0);
  const _inPer = (d: any) => { const x = ymd(d); return !!x && x >= perFrom && x <= perTo; };
  const recebidoPeriodoDe = (r: any) => { const ps = arr(r.payment_schedule); if (ps.length) return ps.filter((p: any) => p.status === "paid" && _inPer(p.paid_date || p.date)).reduce((a: number, p: any) => a + Number(p.amount || 0), 0); return _inPer(r.payment_date) ? Number(r.amount_paid || 0) : 0; };
  const recebidoPeriodoRows = ativos.map((r: any) => ({ cliente: r.contact_name || r.description || "—", valor: recebidoPeriodoDe(r) })).filter((x: any) => x.valor > 0.005);
  const recebidoPeriodo = recebidoPeriodoRows.reduce((a: number, x: any) => a + x.valor, 0);
  // Receita variável = caixa recebido no período de recebíveis NÃO-recorrentes (vendas pontuais + contratos parcelados), fora do MRR.
  const recVarRows = ativos.filter((r: any) => !isRecurring(r)).map((r: any) => ({ cliente: r.contact_name || r.description || "—", valor: recebidoPeriodoDe(r), modelo: modeloDe(r) })).filter((x: any) => x.valor > 0.005);
  const recebidoVariavel = recVarRows.reduce((a: number, x: any) => a + x.valor, 0);
  const semNfRows = rows.filter((r: any) => !r.raw?.has_nf);
  const semNfRecebido = semNfRows.reduce((a: number, r: any) => a + r.recebido, 0);
  const toggleNf = async (r: any) => { setBusyP(true); try { await services.finance.accounts.save({ id: r.id, account_type: "receivable", has_nf: !r.raw?.has_nf }); reload?.(); } catch (e: any) { alert("Erro: " + (e?.message || e)); } finally { setBusyP(false); } };
  const aReceberFut = rows.reduce((a, r) => a + r.aReceber, 0);
  // Carteira = valor TOTAL de todos os contratos fechados (recebido + a receber). É diferente do card "A receber", que é só o saldo em aberto.
  const carteiraTotal = rows.reduce((a, r) => a + r.recebido + r.aReceber, 0);
  const carteiraRecebido = rows.reduce((a, r) => a + r.recebido, 0);
  const francisco = ativos.find((r: any) => /francisco|cs adv/i.test(r.contact_name || r.description || ""));

  // ---- detalhamento dos cards (drill-down): cada lista SOMA o total do card ----
  const nomeDe = (r: any) => r.contact_name || r.description || "—";
  const recorrentes = ativos.filter(isRecurring);
  const drillCfg: any =
    drill === "mrr" ? {
      title: `MRR — composição de ${BRL(mrr)}/mês`,
      sub: "Receita recorrente mensal (competência): a mensalidade reconhecida de cada contrato ativo = total do contrato ÷ meses de vigência.",
      total: mrr,
      rows: recorrentes.map((r: any) => ({ nome: nomeDe(r), valor: mensalDe(r), det: `${BRL(Number(r.contract_total || 0))} ÷ ${mesesContrato(r)} meses de contrato` })),
    } : drill === "arr" ? {
      title: `ARR — composição de ${BRL(mrr * 12)}/ano`,
      sub: "Receita recorrente anual = MRR × 12. Cada contrato entra pela sua mensalidade × 12 (a recorrência anualizada — não a soma dos contratos, nem o saldo a receber).",
      total: mrr * 12,
      rows: recorrentes.map((r: any) => ({ nome: nomeDe(r), valor: mensalDe(r) * 12, det: `${BRL(mensalDe(r))}/mês × 12` })),
      foot: `${BRL(mrr)} (MRR) × 12 = ${BRL(mrr * 12)}`,
    } : drill === "caixa" ? {
      title: `Recebido no período — composição de ${BRL(recebidoPeriodo)}`,
      sub: `Parcelas recebidas em ${per.label.toLowerCase()} — o dinheiro que entrou na conta no período.`,
      total: recebidoPeriodo,
      rows: recebidoPeriodoRows.map((x: any) => ({ nome: x.cliente, valor: x.valor, det: "recebido no período" })),
      empty: "Nenhuma parcela recebida no período.",
    } : drill === "variavel" ? {
      title: `Receita variável no período — composição de ${BRL(recebidoVariavel)}`,
      sub: `Vendas NÃO-recorrentes (pontuais e contratos parcelados) cujo dinheiro entrou em ${per.label.toLowerCase()} — sua renda variável além do MRR. Muda o período acima (1m/3m/6m/1a) para ver a variável de cada janela.`,
      total: recebidoVariavel,
      rows: recVarRows.map((x: any) => ({ nome: x.cliente, valor: x.valor, det: `${String(x.modelo).toLowerCase()} · recebido no período` })),
      empty: "Nenhuma venda variável recebida no período.",
    } : drill === "futuro" ? {
      title: `A receber (futuro) — saldo em aberto de ${BRL(aReceberFut)}`,
      sub: "Este card é o SALDO EM ABERTO: tudo que ainda vai entrar dos contratos já fechados (contratado − já recebido). NÃO é o valor total dos contratos. Clique numa empresa para abrir mês a mês (✓ pagos × ⏳ a pagar).",
      total: aReceberFut,
      tree: true,
      rows: rows.filter(r => r.aReceber > 0).map(r => ({
        id: r.id, nome: r.cliente, valor: r.aReceber,
        det: `${BRL(r.recebido)} recebido de ${BRL(r.recebido + r.aReceber)} contratados`,
        pago: r.recebido, contrato: r.recebido + r.aReceber,
        parc: arr(r.ps).map((p: any) => ({ date: ymd(p.date), amount: Number(p.amount || 0), paid: p.status === "paid", pd: p.paid_date })),
      })),
      carteira: { total: carteiraTotal, recebido: carteiraRecebido, aReceber: aReceberFut },
      empty: "Nada em aberto — tudo recebido.",
    } : null;

  return (
    <div className="frv3">
      <style>{CSS}</style>
      <div className="frv3-toolbar">
        <div className="seg">
          <button className={view === "comp" ? "on" : ""} onClick={() => setView("comp")}>Competência (MRR)</button>
          <button className={view === "caixa" ? "on" : ""} onClick={() => setView("caixa")}>Caixa (recebido)</button>
        </div>
        <span className="frv3-hint">Visão: <b>{view === "comp" ? "Competência (MRR)" : "Caixa (recebido)"}</b></span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", margin: "0 0 14px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--crasto-text-muted, #667085)", marginRight: 2 }}>Período</span>
        {QUICK.map(q => { const on = per.from === q.from && per.to === q.to; return <button key={q.key} onClick={() => setPer({ from: q.from, to: q.to, label: q.label })} style={{ padding: "5px 11px", fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: "pointer", border: "1px solid " + (on ? "#010E26" : "var(--crasto-border, #d0d5dd)"), background: on ? "#010E26" : "var(--crasto-surface, #fff)", color: on ? "#fff" : "var(--crasto-text-muted, #475569)" }}>{q.label}</button>; })}
        <span style={{ fontSize: 11, color: "var(--crasto-text-muted, #667085)", marginLeft: 4 }}>só afeta “Recebido no período” · MRR/ARR = competência</span>
      </div>

      <div className="frv3-grid4">
        <div className="frv3-kpi hero clk" onClick={() => setDrill("mrr")} title="Clique para ver a composição do MRR">
          <div className="lbl">MRR — receita recorrente do mês</div>
          <div className="val">{BRL(mrr)}</div>
          <div className="hint"><span className="acr"><b>M</b>onthly <b>R</b>ecurring <b>R</b>evenue &middot; Receita Recorrente Mensal</span>reconhecida por mês (competência)</div>
        </div>
        <div className="frv3-kpi hero clk" onClick={() => setDrill("arr")} title="Clique para ver a composição do ARR">
          <div className="lbl">ARR — receita recorrente do ano</div>
          <div className="val">{BRL(mrr * 12)}</div>
          <div className="hint"><span className="acr"><b>A</b>nnual <b>R</b>ecurring <b>R</b>evenue &middot; Receita Recorrente Anual</span>MRR × 12 &middot; a recorrência anualizada</div>
        </div>
        <div className="frv3-kpi clk" onClick={() => setDrill("caixa")} title="Clique para ver o que foi recebido no período"><div className="lbl">Recebido no período (caixa)</div><div className="val green">{BRL(recebidoPeriodo)}</div><div className="hint">{per.label.toLowerCase()} · entrou de fato</div></div>
        <div className="frv3-kpi clk" onClick={() => setDrill("variavel")} title="Vendas pontuais/variáveis recebidas no período — fora do MRR"><div className="lbl">Receita variável (pontual)</div><div className="val" style={{ color: "var(--amber)" }}>{BRL(recebidoVariavel)}</div><div className="hint">{per.label.toLowerCase()} · fora do MRR</div></div>
        <div className="frv3-kpi clk" onClick={() => setDrill("futuro")} title="Clique para abrir contrato a contrato (mês a mês) + a carteira total"><div className="lbl">A receber (futuro)</div><div className="val blue">{BRL(aReceberFut)}</div><div className="hint">saldo em aberto = contratado − já recebido</div></div>
      </div>

      <div className="frv3-note"><b>Duas verdades, dois números.</b> <b>Competência (MRR)</b> = saúde do negócio (receita recorrente mês a mês). <b>Caixa</b> = dinheiro que entrou (paga as contas). O sistema guarda os dois e nunca os mistura.</div>
      {semNfRecebido > 0 && <div className="frv3-note" style={{ borderLeft: "3px solid #f5b301", background: "rgba(245,179,1,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><span><b>🧾 Recebido sem NF: {BRL(semNfRecebido)}</b> — {semNfRows.length} lançamento(s) a formalizar.</span><span style={{ fontSize: 11.5, color: "var(--crasto-text-muted, #667085)" }}>Selo "sem NF" em cada linha; clique no selo quando emitir a nota.</span></div>}

      <div className="frv3-sech"><h3>Contratos &amp; recebíveis</h3><span className="rt">{rows.length} recebível(is)</span></div>
      <div className="frv3-tablewrap"><div className="frv3-tscroll">
        <table>
          <thead><tr>
            <th>Cliente / Contrato</th><th>Modelo</th><th>Próx. vencimento (data/hora)</th>
            <th className="r">{view === "comp" ? "Reconhecido/mês" : "Recebido/mês"}</th>
            <th className="r">Recebido</th><th className="r">A receber</th><th>Status</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7} style={{ padding: 16, color: "#6B7280" }}>Nenhum recebível cadastrado.</td></tr> : rows.map(r => (
              <Fragment key={r.id}>
              <tr className={r.ps && r.ps.length > 0 ? "hasexp" : ""} onClick={() => { if (r.ps && r.ps.length > 0) toggleExp(r.id); }} title={r.ps && r.ps.length > 0 ? "Clique para ver as parcelas" : ""}>
                <td className="co">{r.ps && r.ps.length > 0 && <button className={"frv3-exp" + (expanded.has(r.id) ? " on" : "")} title="Ver parcelas" onClick={(e) => { e.stopPropagation(); toggleExp(r.id); }}>{expanded.has(r.id) ? "▾" : "▸"}</button>}{r.cliente} <span onClick={(e) => { e.stopPropagation(); toggleNf(r); }} title={r.raw?.has_nf ? "Com Nota Fiscal — clique para marcar SEM NF" : "SEM Nota Fiscal — clique para marcar COM NF quando emitir"} style={{ cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, whiteSpace: "nowrap", verticalAlign: "middle", ...(r.raw?.has_nf ? { color: "#166534", background: "#E6F4EA", border: "1px solid rgba(22,101,52,.35)" } : { color: "#b45309", background: "rgba(245,179,1,.14)", border: "1px solid rgba(245,179,1,.5)" }) }}>{r.raw?.has_nf ? "NF ✓" : "sem NF"}</span><small>{r.detalhe}{r.ps && r.ps.length > 0 ? ` · ${r.ps.filter((p: any) => p.status === "paid").length}/${r.ps.length} recebidas` : ""}</small></td>
                <td><span className="typ">{r.modelo}</span></td>
                <td className="dt">{fmtDT(r.venc)}</td>
                <td className="r">{BRL(view === "comp" ? r.reconhecido : r.recebidoMes)}</td>
                <td className="r green">{BRL(r.recebido)}</td>
                <td className="r blue">{BRL(r.aReceber)}</td>
                <td><span className={"st " + r.stTone}>{r.status}</span></td>
              </tr>
              {r.ps && r.ps.length > 0 && expanded.has(r.id) && r.ps.map((p: any, idx: number) => {
                const isEd = !!parcEdit && parcEdit.id === r.id && parcEdit.idx === idx;
                const paid = p.status === "paid";
                const atrasado = paid && !!p.paid_date && ymd(p.paid_date) > ymd(p.date);
                return (
                  <tr key={r.id + "_p" + idx} className="parcrow">
                    <td className="co pc"><span className="pcn">{p.label || ("Parcela " + (p.installment || idx + 1) + "/" + r.ps!.length)}</span></td>
                    <td><span className="typ">Parcela</span></td>
                    <td className="dt">{isEd ? <input type="date" value={parcEdit!.date} onChange={e => setParcEdit({ ...parcEdit!, date: e.target.value })} className="pinp" /> : (<>{fmtDT(p.date)}{atrasado && <span style={{ color: "#b45309", fontSize: 11, marginLeft: 5, whiteSpace: "nowrap" }} title={"Pago em atraso — venceu " + fmtDT(p.date) + ", pago " + fmtDT(p.paid_date)}>· pago {fmtDT(p.paid_date)}</span>}</>)}</td>
                    <td className="r">{isEd ? <input type="number" step="0.01" value={parcEdit!.amount} onChange={e => setParcEdit({ ...parcEdit!, amount: e.target.value })} className="pinp num" /> : BRL(Number(p.amount || 0))}</td>
                    <td className="r green">{paid ? BRL(Number(p.amount || 0)) : "R$ 0,00"}</td>
                    <td className="r blue">{paid ? "R$ 0,00" : BRL(Number(p.amount || 0))}</td>
                    <td className="pacts">{isEd ? (<><button className="picon ok" title="Salvar" disabled={busyP} onClick={() => saveParcelaEdit(r.raw, r.ps!)}><IcoCheck /></button><button className="picon" title="Cancelar" onClick={() => setParcEdit(null)}><IcoX /></button></>) : (<><span className={"st " + (paid ? "pago" : "pend")}>{paid ? "Recebida" : "A receber"}</span>{atrasado && <span title="Pago após o vencimento (em atraso)" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#b45309", background: "rgba(245,179,1,.14)", border: "1px solid rgba(245,179,1,.45)", borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>⚠ Atrasado</span>}<button className={"picon toggle" + (paid ? " on" : "")} title={paid ? "Marcar como NÃO recebida" : "Marcar como recebida"} disabled={busyP} onClick={() => markParcela(r.raw, r.ps!, idx, !paid)}><IcoCheckCircle filled={paid} /></button><button className="picon" title="Editar parcela" onClick={() => setParcEdit({ id: r.id, idx, date: ymd(p.date), amount: String(p.amount || "") })}><IcoPencil /></button></>)}</td>
                  </tr>
                );
              })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div></div>

      <div className="frv3-note" style={{ marginTop: 16 }}>
        <b>Competência × Caixa (ex.: {francisco ? (francisco.contact_name || "Dr. Francisco") : "Dr. Francisco"}):</b> um contrato parcelado (ex.: R$ 10.000 em 5×) entra no <b>caixa</b> só nos meses das parcelas, mas na <b>competência</b> é reconhecido R$ 10.000 ÷ 12 = ~R$ 833/mês o ano todo — mostrando receita recorrente estável, sem "5 meses cheios e 7 zerados". Fiscalmente, o imposto segue a <b>NF do mês</b> (confirme com o contador).
      </div>

      {drill && drillCfg && createPortal(
        <div className="frv3">
        <div className="frv3-modal" onClick={() => setDrill(null)}>
          <div className="frv3-modal-card" onClick={e => e.stopPropagation()}>
            <div className="frv3-modal-head">
              <h3>{drillCfg.title}</h3>
              <button className="frv3-mx" title="Fechar" onClick={() => setDrill(null)}><IcoX size={18} /></button>
            </div>
            <div className="frv3-modal-sub">{drillCfg.sub}</div>
            {drillCfg.rows.length === 0 ? (
              <div className="frv3-modal-empty">{drillCfg.empty || "Sem itens."}</div>
            ) : (
              <><table className="frv3-modal-tbl">
                <tbody>
                  {drillCfg.rows.map((it: any, i: number) => (
                    drillCfg.tree ? (
                      <Fragment key={i}>
                        <tr className="mc-clk" onClick={() => toggleDrillExp(it.id)}>
                          <td className="mc-nome"><span className="mc-caret">{drillExp.has(it.id) ? "▾" : "▸"}</span>{it.nome}<small>{it.det}</small></td>
                          <td className="mc-val">{BRL(it.valor)}</td>
                        </tr>
                        {drillExp.has(it.id) && (
                          <tr className="mc-subrow"><td colSpan={2}>
                            <div className="mc-tree">
                              {it.parc.length === 0 ? <div className="mc-trow">Sem parcelas cadastradas.</div> : it.parc.map((p: any, k: number) => (
                                <div key={k} className={"mc-trow" + (p.paid ? " pago" : " pend")}>
                                  <span>{p.paid ? "✓" : "⏳"} {fmtDT(p.date)}</span>
                                  <span className="mc-tval">{BRL(p.amount)} <em>{p.paid ? "pago" : "a pagar"}</em></span>
                                </div>
                              ))}
                              <div className="mc-tsum"><span>Pago {BRL(it.pago)} · Falta {BRL(it.valor)}</span><span>Total do contrato {BRL(it.contrato)}</span></div>
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    ) : (
                      <tr key={i}><td className="mc-nome">{it.nome}<small>{it.det}</small></td><td className="mc-val">{BRL(it.valor)}</td></tr>
                    )
                  ))}
                </tbody>
                <tfoot><tr><td className="mc-nome"><b>{drillCfg.tree ? "Total a receber" : "Total"}</b>{drillCfg.foot ? <small>{drillCfg.foot}</small> : null}</td><td className="mc-val"><b>{BRL(drillCfg.total)}</b></td></tr></tfoot>
              </table>
              {drillCfg.carteira && (
                <div className="mc-carteira">
                  <div className="mc-cart-h">📊 Carteira de contratos (todos já fechados)</div>
                  <div className="mc-cart-row"><span>Valor total contratado</span><b>{BRL(drillCfg.carteira.total)}</b></div>
                  <div className="mc-cart-row"><span>− Já recebido</span><b className="g">{BRL(drillCfg.carteira.recebido)}</b></div>
                  <div className="mc-cart-row hl"><span>= A receber (este card)</span><b className="b">{BRL(drillCfg.carteira.aReceber)}</b></div>
                </div>
              )}</>
            )}
          </div>
        </div>
        </div>, document.body)}
    </div>
  );
}

const CSS = `
.frv3{--navy:#0B1830;--blue:var(--crasto-blue,#6E9CE8);--blue-ink:var(--crasto-blue,#2E5BB0);--green:var(--fin-green,#16A34A);--green-bg:rgba(52,211,153,.14);--green-ink:var(--fin-green,#0F7A3D);--amber:var(--fin-orange,#E0801F);--red:var(--fin-red,#DC2626);--red-bg:rgba(220,38,38,.13);--info-bg:rgba(110,156,232,.15);--line:var(--crasto-border-soft,#EDEFF3);--line2:var(--crasto-border,var(--crasto-border-soft,#E4E7EC));--muted:var(--crasto-text-muted,#6B7280);--muted2:var(--crasto-text-faint,#9AA3AF);--card:var(--crasto-surface,#fff);--bg2:var(--crasto-surface-2,var(--bg2));--hover:var(--crasto-surface-2,var(--hover));--txt:var(--crasto-text-primary,#0B1220);--shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);color:var(--txt)}
.frv3 .green{color:var(--green)}.frv3 .blue{color:var(--blue-ink)}
.frv3-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.frv3 .seg{display:inline-flex;background:var(--hover);border-radius:10px;padding:4px}
.frv3 .seg button{border:0;background:transparent;padding:8px 15px;border-radius:7px;font:inherit;font-size:12.5px;font-weight:700;color:var(--muted);cursor:pointer}
.frv3 .seg button.on{background:var(--card);color:var(--navy);box-shadow:var(--shadow)}
.frv3-hint{font-size:12.5px;color:var(--muted)}
.frv3-grid4{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:14px}
@media(max-width:1300px){.frv3-grid4{grid-template-columns:repeat(3,1fr)}}
.frv3-kpi{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow)}
.frv3-kpi .lbl{font-size:10.5px;letter-spacing:.08em;font-weight:700;color:var(--muted2);text-transform:uppercase}
.frv3-kpi .val{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:10px 0 6px}
.frv3-kpi .hint{font-size:12px;color:var(--muted)}
.frv3-kpi .hint .acr{display:block;font-weight:600;margin-bottom:3px;font-size:11.5px}
.frv3-kpi.hero{background:linear-gradient(180deg,#0B1830,#010E26);border-color:transparent;color:#fff}
.frv3-kpi.hero .lbl{color:#9DB4E0}.frv3-kpi.hero .hint{color:#B7C6E6}
.frv3-kpi.hero .hint .acr{color:#DCE7FB}.frv3-kpi.hero .hint b{color:#fff}
.frv3-note{background:var(--info-bg);border:1px solid var(--line2);border-left:3px solid var(--blue);border-radius:12px;padding:13px 15px;font-size:12.5px;color:var(--txt);line-height:1.5;margin:14px 0}
.frv3-note b{color:var(--txt)}
.frv3-sech{display:flex;align-items:center;justify-content:space-between;margin:22px 0 12px}
.frv3-sech h3{font-size:16px;font-weight:800}.frv3-sech .rt{font-size:13px;color:var(--muted);font-weight:600}
.frv3-tablewrap{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.frv3-tscroll{max-height:520px;overflow:auto}
.frv3 table{width:100%;border-collapse:collapse}
.frv3 thead th{position:sticky;top:0;z-index:3;background:var(--card);box-shadow:inset 0 -1px 0 var(--line2);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2);font-weight:700;text-align:left;padding:12px 14px;white-space:nowrap}
.frv3 tbody tr.hasexp{cursor:pointer}
.frv3 tbody tr.hasexp:hover{background:var(--hover)}
.frv3 thead th.r{text-align:right}
.frv3 tbody td{padding:12px 14px;border-top:1px solid var(--line);font-size:13px;white-space:nowrap}
.frv3 td.r{text-align:right}
.frv3 td.co{font-weight:700}.frv3 td.co small{display:block;font-weight:500;color:var(--muted);font-size:11.5px;margin-top:2px}
.frv3 td.dt{font-variant-numeric:tabular-nums;font-size:12.5px}
.frv3 .typ{font-size:11.5px;font-weight:600;color:var(--muted);background:var(--hover);padding:4px 10px;border-radius:20px}
.frv3 .st{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:20px}
.frv3 .st.pend{background:var(--line);color:var(--muted)}.frv3 .st.pago{background:var(--green-bg);color:var(--green-ink)}.frv3 .st.venc{background:var(--red-bg);color:var(--red)}
.frv3-exp{border:1px solid var(--line2);background:var(--card);color:var(--muted);border-radius:6px;width:20px;height:20px;line-height:1;font-size:11px;font-weight:800;cursor:pointer;margin-right:8px;padding:0;vertical-align:middle}
.frv3-exp:hover,.frv3-exp.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.frv3 tr.parcrow td{background:var(--info-bg);border-top:1px dashed var(--line2);font-size:12.5px;padding:9px 14px}
.frv3 tr.parcrow td.pc{padding-left:34px}
.frv3 tr.parcrow .pcn{font-weight:700;color:var(--muted)}
.frv3 .pinp{font:inherit;font-size:12px;border:1px solid var(--blue);border-radius:6px;padding:4px 6px;width:120px;background:var(--card);color:var(--txt)}
.frv3 .pinp.num{width:90px;text-align:right}
.frv3 td.pacts{white-space:nowrap;text-align:right}
.frv3 td.pacts>*{margin-left:7px;vertical-align:middle}
.frv3 .picon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--line2);background:var(--card);color:var(--muted);border-radius:8px;cursor:pointer;padding:0}
.frv3 .picon:hover{background:var(--hover);color:var(--txt);border-color:var(--muted2)}
.frv3 .picon.toggle.on{color:var(--green);border-color:var(--green);background:var(--green-bg)}
.frv3 .picon.toggle:not(.on):hover{color:var(--green);border-color:var(--green)}
.frv3 .picon.ok{color:var(--green);border-color:var(--green)}
.frv3 .picon.ok:hover{background:var(--green);color:#fff}
.frv3 .picon:disabled{opacity:.45;cursor:default}
@media(max-width:1050px){.frv3-grid4{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.frv3-grid4{grid-template-columns:1fr}}
.frv3-kpi.clk{position:relative;cursor:pointer;transition:transform .09s ease,box-shadow .14s ease}
.frv3-kpi.clk:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(16,24,40,.14)}
.frv3-kpi.clk::after{content:"›";position:absolute;top:12px;right:15px;font-size:17px;font-weight:800;opacity:0;transition:opacity .12s}
.frv3-kpi.clk:hover::after{opacity:.5}
.frv3-modal{position:fixed;inset:0;background:rgba(6,12,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.frv3-modal-card{background:var(--card);border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.35);max-width:560px;width:100%;max-height:82vh;overflow:auto;padding:22px 24px}
.frv3-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:2px}
.frv3-modal-head h3{font-size:16.5px;font-weight:800;color:var(--txt);line-height:1.32}
.frv3-mx{border:1px solid var(--line2);background:var(--card);color:var(--muted);border-radius:9px;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
.frv3-mx:hover{background:var(--hover);color:var(--txt)}
.frv3-modal-sub{font-size:12.5px;color:var(--muted);line-height:1.5;margin:8px 0 16px}
.frv3-modal-empty{padding:26px;text-align:center;color:var(--muted);background:var(--hover);border-radius:12px;font-size:13px}
.frv3-modal-tbl{width:100%;border-collapse:collapse}
.frv3-modal-tbl td{padding:11px 4px;border-top:1px solid var(--line);font-size:13.5px;vertical-align:top}
.frv3-modal-tbl .mc-nome{font-weight:700;color:var(--txt)}
.frv3-modal-tbl .mc-nome small{display:block;font-weight:500;color:var(--muted);font-size:11.5px;margin-top:2px}
.frv3-modal-tbl .mc-val{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--txt)}
.frv3-modal-tbl tfoot td{border-top:2px solid var(--line2);font-size:15px;padding-top:13px}
.frv3-modal-tbl tfoot .mc-val b{color:var(--blue-ink)}
.frv3-modal-tbl tr.mc-clk{cursor:pointer}
.frv3-modal-tbl tr.mc-clk:hover td{background:var(--hover)}
.mc-caret{display:inline-block;width:16px;color:var(--blue-ink);font-size:11px;margin-right:4px}
.frv3-modal-tbl tr.mc-subrow td{padding:0 4px 10px 4px;border-top:0}
.mc-tree{background:var(--hover);border-radius:12px;padding:10px 12px;margin-top:2px}
.mc-trow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12.5px;color:var(--muted);padding:4px 2px;border-bottom:1px dashed var(--line)}
.mc-trow.pago{color:var(--green-ink)}.mc-trow.pend{color:var(--txt)}
.mc-trow .mc-tval{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.mc-trow .mc-tval em{font-style:normal;font-weight:500;font-size:11px;color:var(--muted2);margin-left:4px}
.mc-tsum{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:700;color:var(--txt);padding-top:8px;margin-top:4px;flex-wrap:wrap}
.mc-carteira{margin-top:16px;border:1px solid var(--line2);border-radius:14px;padding:14px 16px;background:var(--info-bg)}
.mc-cart-h{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--blue-ink);margin-bottom:8px}
.mc-cart-row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13.5px;color:var(--txt);padding:5px 0}
.mc-cart-row b{font-variant-numeric:tabular-nums}
.mc-cart-row b.g{color:var(--green-ink)}.mc-cart-row b.b{color:var(--blue-ink)}
.mc-cart-row.hl{border-top:2px solid var(--line2);margin-top:4px;padding-top:9px;font-weight:800;font-size:15px}
`;
