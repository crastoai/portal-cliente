// ============================================================================
// A PAGAR — layout v3 (aprovado pelo Crasto, 2026-08-27). Reproduz EXATAMENTE o
// mockup `04 Technical (Dev)/_Mockups/Financeiro_Redesign_v3.html`, com DADO REAL:
// 3 heróis (pago no ano/mês/ainda) · chips por categoria · 4 baldes de status ·
// IA em 2 painéis (Crasto/interno × Cliente/COGS) · Pessoas por vínculo (PJ/CLT/Terc.) ·
// tabela FLAT com filtro estilo Excel no cabeçalho + subtotais AO VIVO + scroll infinito
// + Exportar PDF. CSS escopado em `.fv3` (não conflita com o resto do portal).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { services } from "../../services";
import { money, useAsync } from "../../ui/ui";

const BRL = (v: number) => money(v);
const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
// Mostra dd/mm/aaaa e, se houver hora no valor, hh:mm:ss (auditável). Datas `date` puras saem só como dia.
function fmtDT(v: any): string {
  if (!v) return "—";
  const s = String(v);
  const d = s.slice(0, 10).split("-"); if (d.length !== 3) return s;
  let out = `${d[2]}/${d[1]}/${d[0]}`;
  const tm = s.match(/[T ](\d{2}:\d{2}(?::\d{2})?)/);
  if (tm && tm[1] !== "00:00" && tm[1] !== "00:00:00") out += " " + (tm[1].length === 5 ? tm[1] + ":00" : tm[1]);
  return out;
}
const ymd = (v: any) => (v ? String(v).slice(0, 10) : "");
const CATMAP: Record<string, string> = { ferramenta: "Ferramenta", infraestrutura: "Infraestrutura", servico: "Serviço", salario: "Pessoas", ia: "IA", pessoas: "Pessoas" };
const catLabel = (c?: string) => (c ? (CATMAP[c] || c.charAt(0).toUpperCase() + c.slice(1)) : "Serviço");
const CAT_EMOJI: Record<string, string> = { IA: "🤖", Pessoas: "👤", Ferramenta: "🛠️", Infraestrutura: "☁️", "Serviço": "📦" };

type Item = { id: string; empresa: string; sub: string; categoria: string; venc: string; pag: string; total: number; pago: number; restante: number; status: string };

export default function FinanceiroAPagarV3({ pay, costs }: { pay: any[]; costs: any[] }) {
  const today = todayISO();
  const ano = today.slice(0, 4);
  const mes = today.slice(0, 7);

  // ---- painel de IA (interno × cliente) ----
  const from = mes + "-01";
  const to = mes + "-31";
  const { data: aiPanel, reload: reloadAi } = useAsync(async () => services.finance.aiCost.panel(from, to).catch(() => ({})), [from, to]);
  const s = (aiPanel as any)?.summary ?? { total: 0, client_cost: 0 };
  const iaTotal = Number(s.total || 0), iaCliente = Number(s.client_cost || 0), iaInterno = Math.max(0, iaTotal - iaCliente);
  const byPlatform: any[] = (aiPanel as any)?.by_platform ?? [];
  // Exclui o bucket "Interno / plataforma" (sem organization_id) do painel de CLIENTES — ele é custo próprio, não de cliente.
  const byClient: any[] = ((aiPanel as any)?.by_client ?? []).filter((r: any) => r.organization_id);
  const iaRows: any[] = (aiPanel as any)?.rows ?? [];
  const [iaDrill, setIaDrill] = useState<{ title: string; sub: string; rows: any[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const doSync = async () => { setSyncing(true); try { await services.finance.aiCost.sync(from, to); reloadAi(); } catch (e: any) { alert("Sincronização: " + (e?.message || e)); } finally { setSyncing(false); } };
  const openIaPlatform = (platform: string, label: string) => setIaDrill({ title: label, sub: "Origem do custo por lançamento (custo real · auto-sync)", rows: iaRows.filter(r => (r.platform || r.provider) === platform) });
  const openIaClient = (orgId: string, name: string) => setIaDrill({ title: name, sub: "Custo de IA deste cliente, por plataforma (custo real · auto-sync)", rows: iaRows.filter(r => r.organization_id === orgId) });

  // ---- itens (contas a pagar + custos operacionais) ----
  const statusOf = (venc: string, restante: number, paid: boolean) => paid || restante <= 0.005 ? "Pago" : (venc && ymd(venc) < today ? "Vencido" : "Pendente");
  const items: Item[] = useMemo(() => {
    const A: Item[] = (pay || []).map((a: any) => {
      const total = Number(a.amount || 0), pago = Number(a.amount_paid || 0), rest = Math.max(0, total - pago);
      return { id: "a_" + a.id, empresa: a.contact_name || a.description || "—", sub: a.description && a.contact_name ? a.description : (a.expense_type || "1 lançamento"), categoria: catLabel(a.category), venc: ymd(a.due_date), pag: ymd(a.payment_date), total, pago, restante: rest, status: statusOf(a.due_date, rest, a.status === "paid") };
    });
    const C: Item[] = (costs || []).filter((c: any) => c.is_active !== false).map((c: any) => {
      const total = Number(c.amount_brl || 0);
      return { id: "c_" + c.id, empresa: c.vendor_name || "—", sub: (c.recurrence || "") + (c.purpose ? " · " + c.purpose : ""), categoria: catLabel(c.category), venc: ymd(c.next_payment_date), pag: "", total, pago: 0, restante: total, status: statusOf(c.next_payment_date, total, false) };
    });
    return [...A, ...C];
  }, [pay, costs]);

  // ---- KPIs ----
  // Pago no ano = pagamentos com data neste ano (+ os marcados pagos sem data registrada).
  const pagoAno = items.filter(i => ((i.pag || "").slice(0, 4) === ano) || (i.status === "Pago" && !i.pag)).reduce((a, i) => a + i.pago, 0);
  const pagoMes = items.filter(i => (i.pag || "").slice(0, 7) === mes).reduce((a, i) => a + i.pago, 0);
  const aPagarAinda = items.filter(i => i.status !== "Pago" && (i.venc || "").slice(0, 7) === mes).reduce((a, i) => a + i.restante, 0);
  // Baldes por status — desenhados para FECHAR: Vencidos + Vencem hoje + A vencer = Restante total.
  // (Vencido = tem venc < hoje; Pendente = todo o resto em aberto, inclusive SEM data → cai em "A vencer".)
  const bVencidos = items.filter(i => i.status === "Vencido").reduce((a, i) => a + i.restante, 0);
  const bHoje = items.filter(i => i.status === "Pendente" && ymd(i.venc) === today).reduce((a, i) => a + i.restante, 0);
  const bAvencer = items.filter(i => i.status === "Pendente" && ymd(i.venc) !== today).reduce((a, i) => a + i.restante, 0);
  const bPagos = items.reduce((a, i) => a + i.pago, 0);
  const catTotal = (c: string) => items.filter(i => i.categoria === c).reduce((a, i) => a + i.total, 0);

  // ---- pessoas por vínculo ----
  const pessoas = useMemo(() => {
    const src = [...(costs || []).filter((c: any) => catLabel(c.category) === "Pessoas"), ...(pay || []).filter((a: any) => catLabel(a.category) === "Pessoas")];
    return src.map((p: any) => ({ nome: p.vendor_name || p.contact_name || "—", vinculo: (p.vinculo || "PJ").toUpperCase(), detalhe: p.purpose || p.description || "", valor: Number(p.amount_brl || p.amount || 0) }));
  }, [pay, costs]);
  const pessoasTotal = pessoas.reduce((a, p) => a + p.valor, 0);
  const vinc = (v: string) => pessoas.filter(p => p.vinculo === v).reduce((a, p) => a + p.valor, 0);
  const pct = (n: number) => pessoasTotal > 0 ? Math.round((n / pessoasTotal) * 100) : 0;

  // ---- filtro estilo Excel + ordenação ----
  const COLS = [
    { k: "empresa", label: "Empresa / Item", type: "set", right: false },
    { k: "categoria", label: "Categoria", type: "set", right: false },
    { k: "venc", label: "Vencimento (data/hora)", type: "date", right: false },
    { k: "pag", label: "Pagamento (data/hora)", type: "date", right: false },
    { k: "total", label: "Total", type: "num", right: true },
    { k: "pago", label: "Já pago", type: "num", right: true },
    { k: "restante", label: "Restante", type: "num", right: true },
    { k: "status", label: "Status", type: "set", right: false },
  ] as const;
  const emptyCF = () => ({ empresa: null as Set<string> | null, categoria: null as Set<string> | null, status: null as Set<string> | null, vencDe: "", vencAte: "", pagDe: "", pagAte: "", totalMin: "", totalMax: "", pagoMin: "", pagoMax: "", restMin: "", restMax: "" });
  const [cf, setCf] = useState<any>(emptyCF());
  const [sortKey, setSortKey] = useState("venc");
  const [sortDir, setSortDir] = useState(1);
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState("Todos");
  const [pdfRef, setPdfRef] = useState(today);
  const distinct = (k: string) => Array.from(new Set(items.map(i => String((i as any)[k])))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const filtered = useMemo(() => {
    let r = items.slice();
    if (chip !== "Todos") r = r.filter(i => i.categoria === chip);
    (["empresa", "categoria", "status"] as const).forEach(k => { const set = cf[k]; if (set && set.size) r = r.filter(i => set.has(String((i as any)[k]))); });
    const dr = (k: string, de: string, ate: string) => { if (de) r = r.filter(i => (i as any)[k] && ymd((i as any)[k]) >= de); if (ate) r = r.filter(i => (i as any)[k] && ymd((i as any)[k]) <= ate); };
    dr("venc", cf.vencDe, cf.vencAte); dr("pag", cf.pagDe, cf.pagAte);
    const nr = (k: string, mn: string, mx: string) => { if (mn !== "") r = r.filter(i => (i as any)[k] >= parseFloat(mn)); if (mx !== "") r = r.filter(i => (i as any)[k] <= parseFloat(mx)); };
    nr("total", cf.totalMin, cf.totalMax); nr("pago", cf.pagoMin, cf.pagoMax); nr("restante", cf.restMin, cf.restMax);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(i => [i.empresa, i.categoria, i.status, fmtDT(i.venc), fmtDT(i.pag)].join(" ").toLowerCase().includes(q));
    r.sort((a, b) => { let va: any = (a as any)[sortKey], vb: any = (b as any)[sortKey]; if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); } return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir; });
    return r;
  }, [items, chip, cf, search, sortKey, sortDir]);

  const fTot = filtered.reduce((a, i) => a + i.total, 0);
  const fPago = filtered.reduce((a, i) => a + i.pago, 0);
  const fRest = filtered.reduce((a, i) => a + i.restante, 0);
  const colActive = (k: string, type: string) => type === "set" ? !!(cf[k] && cf[k].size && cf[k].size < distinct(k).length) : type === "date" ? !!(cf[k + "De"] || cf[k + "Ate"]) : (cf[({ total: "totalMin", pago: "pagoMin", restante: "restMin" } as any)[k]] !== "" || cf[({ total: "totalMax", pago: "pagoMax", restante: "restMax" } as any)[k]] !== "");

  const fFiltroDesc = () => {
    const parts: string[] = [];
    if (chip !== "Todos") parts.push("Categoria: " + chip);
    (["empresa", "status"] as const).forEach(k => { const set = cf[k]; if (set && set.size) parts.push((k === "empresa" ? "Empresa" : "Status") + ": " + Array.from(set).join(", ")); });
    return parts.length ? parts.join(" · ") : "Todos";
  };

  // ---- scroll infinito ----
  const PAGE = 12;
  const [visN, setVisN] = useState(PAGE);
  useEffect(() => { setVisN(PAGE); }, [chip, cf, search, sortKey, sortDir]);
  const scRef = useRef<HTMLDivElement>(null);
  const onScroll = () => { const el = scRef.current; if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setVisN(n => Math.min(n + PAGE, filtered.length)); };
  const shown = filtered.slice(0, visN);

  // ---- popover Excel ----
  const [pop, setPop] = useState<{ col: string; type: string; x: number; y: number } | null>(null);
  const [popSearch, setPopSearch] = useState("");
  const openPop = (e: any, k: string, type: string) => { const r = e.currentTarget.getBoundingClientRect(); setPopSearch(""); setPop(p => p && p.col === k ? null : { col: k, type, x: Math.max(8, Math.min(r.left, window.innerWidth - 268)), y: r.bottom + 4 }); };
  useEffect(() => { const h = (e: any) => { if (!e.target.closest(".fv3-pop") && !e.target.closest(".fv3 th")) setPop(null); }; document.addEventListener("click", h); return () => document.removeEventListener("click", h); }, []);

  const setColSet = (k: string, vals: string[]) => setCf((c: any) => ({ ...c, [k]: vals.length === distinct(k).length ? null : new Set(vals) }));

  function exportPDF() {
    const refTxt = pdfRef ? pdfRef.split("-").reverse().join("/") : fmtDT(new Date().toISOString());
    const gen = new Date().toLocaleString("pt-BR");
    const esc = (x: any) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c]);
    const body = filtered.map(i => `<tr><td>${esc(i.empresa)}</td><td>${esc(i.categoria)}</td><td>${fmtDT(i.venc)}</td><td>${fmtDT(i.pag)}</td><td style="text-align:right">${BRL(i.total)}</td><td style="text-align:right">${BRL(i.pago)}</td><td style="text-align:right">${BRL(i.restante)}</td><td>${esc(i.status)}</td></tr>`).join("");
    const html = `<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>Contas a Pagar — Crasto.AI</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h2{margin:0 0 2px}.m{font-size:12px;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-top:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f2f2f2}tfoot td{font-weight:700;border-top:2px solid #999}@media print{@page{size:A4 landscape;margin:12mm}}</style></head><body><h2>Contas a Pagar — Crasto.AI</h2><div class=m>Data de referência: <b>${refTxt}</b> · Gerado em ${gen} · ${filtered.length} lançamento(s) · Filtro: ${fFiltroDesc()}</div><table><thead><tr><th>Empresa / Item</th><th>Categoria</th><th>Vencimento</th><th>Pagamento</th><th style="text-align:right">Total</th><th style="text-align:right">Já pago</th><th style="text-align:right">Restante</th><th>Status</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan=4 style="text-align:right">TOTAIS</td><td style="text-align:right">${BRL(fTot)}</td><td style="text-align:right">${BRL(fPago)}</td><td style="text-align:right">${BRL(fRest)}</td><td></td></tr></tfoot></table></body></html>`;
    const w = window.open("", "_blank"); if (!w) { alert("Permita pop-ups para exportar o PDF."); return; }
    w.document.write(html); w.document.close(); setTimeout(() => { try { w.print(); } catch { } }, 250);
  }

  const stCls = (st: string) => st === "Pago" ? "pago" : st === "Vencido" ? "venc" : "pend";

  return (
    <div className="fv3">
      <style>{CSS}</style>

      {/* 3 heróis */}
      <div className="fv3-grid3">
        <div className="fv3-kpi"><div className="lbl">Pago no ano</div><div className="val">{BRL(pagoAno)}</div><div className="hint">jan → hoje · caixa realizado</div></div>
        <div className="fv3-kpi"><div className="lbl">Pago no mês</div><div className="val">{BRL(pagoMes)}</div><div className="hint">já saiu da conta este mês</div></div>
        <div className="fv3-kpi"><div className="lbl">A pagar ainda neste mês</div><div className="val amber">{BRL(aPagarAinda)}</div><div className="hint">vence de hoje até fim do mês</div></div>
      </div>

      {/* chips por categoria */}
      <div className="fv3-chips">
        {["Todos", "IA", "Pessoas", "Ferramenta", "Infraestrutura", "Serviço"].map(c => (
          <span key={c} className={"fv3-chip" + (chip === c ? " active" : "")} onClick={() => setChip(c)}>
            {c === "Todos" ? "Todos" : (CAT_EMOJI[c] || "") + " " + (c === "Ferramenta" ? "Ferramentas" : c)}
            {c !== "Todos" && <small> {BRL(catTotal(c))}</small>}
          </span>
        ))}
      </div>

      {/* 4 baldes de status */}
      <div className="fv3-buckets">
        <div className="fv3-bucket red"><div className="lbl">Vencidos</div><div className="val">{BRL(bVencidos)}</div></div>
        <div className="fv3-bucket yellow"><div className="lbl">Vencem hoje</div><div className="val">{BRL(bHoje)}</div></div>
        <div className="fv3-bucket blue"><div className="lbl">A vencer</div><div className="val">{BRL(bAvencer)}</div></div>
        <div className="fv3-bucket green"><div className="lbl">Pagos</div><div className="val">{BRL(bPagos)}</div></div>
      </div>

      {/* IA em 2 painéis — linhas CLICÁVEIS (drill-down da origem) + Sincronizar (custo real em tempo real) */}
      <div className="fv3-sech"><h3>🤖 Despesas de IA</h3><span className="rt">Total no mês · <b>{BRL(iaTotal)}</b> <button className="fv3-btn" style={{ marginLeft: 10, padding: "5px 11px", fontSize: 12 }} onClick={doSync} disabled={syncing}>{syncing ? "Sincronizando…" : "🔄 Sincronizar"}</button></span></div>
      <div className="fv3-panels">
        <div className="fv3-panel">
          <div className="ph"><span className="t">IA da Crasto.AI (custo próprio)</span><span className="s">Overhead · {BRL(iaInterno)}</span></div>
          {byPlatform.length ? byPlatform.slice(0, 5).map((r, k) => (
            <div className="fv3-row clk" key={k} onClick={() => openIaPlatform(r.platform || r.provider, r.platform || r.provider || "—")}><div><div className="nm">{r.platform || r.provider || "—"}</div><div className="mt">{r.provider || ""}</div></div><div className="amt">{BRL(Number(r.cost || 0))} <span className="chev">›</span></div></div>
          )) : <div className="fv3-row"><div className="mt">Sem custo de IA no período. Clique em Sincronizar.</div></div>}
        </div>
        <div className="fv3-panel">
          <div className="ph"><span className="t">IA repassada a clientes <span className="tag cli">COGS</span></span><span className="s">Custo do serviço · {BRL(iaCliente)}</span></div>
          {byClient.length ? byClient.slice(0, 5).map((r, k) => (
            <div className="fv3-row clk" key={k} onClick={() => openIaClient(r.organization_id, r.organization_name || "Cliente")}><div><div className="nm">{r.organization_name || "Cliente"}</div><div className="mt">LLM do cliente</div></div><div className="amt">{BRL(Number(r.cost || 0))} <span className="chev">›</span></div></div>
          )) : <div className="fv3-row"><div className="mt">Sem IA repassada a clientes no período.</div></div>}
        </div>
      </div>
      <div className="fv3-note"><b>Por que separar:</b> a IA da Crasto é <b>despesa fixa</b> (overhead). A IA dos clientes é <b>custo do serviço vendido (COGS)</b> — casada com a receita do cliente, revela a <b>margem bruta</b>. Os valores são o <b>custo REAL</b> das APIs de billing (Anthropic · OpenAI · Google/Gemini · DeepSeek), atualizado em <b>Sincronizar</b>. <b>Clique em qualquer linha</b> para ver a origem do custo.</div>

      {/* Pessoas & prestadores */}
      <div className="fv3-sech"><h3>👤 Pessoas &amp; prestadores</h3><span className="rt">Total no mês · <b>{BRL(pessoasTotal)}</b></span></div>
      <div className="fv3-panels">
        <div className="fv3-panel">
          <div className="ph"><span className="t">Por vínculo</span><span className="s">CLT · PJ · Terceirizado</span></div>
          {pessoas.length ? pessoas.map((p, k) => (
            <div className="fv3-row" key={k}><div className="av">{(p.nome || "?").slice(0, 2).toUpperCase()}</div><div><div className="nm">{p.nome} <span className={"tag " + (p.vinculo === "CLT" ? "clt" : p.vinculo === "TERCEIRIZADO" ? "terc" : "pj")}>{p.vinculo === "TERCEIRIZADO" ? "Terceirizado" : p.vinculo}</span></div><div className="mt">{p.detalhe}</div></div><div className="amt">{BRL(p.valor)}</div></div>
          )) : <div className="fv3-row"><div className="mt">Nenhuma pessoa/prestador cadastrado (categoria "Pessoas").</div></div>}
        </div>
        <div className="fv3-panel">
          <div className="ph"><span className="t">Composição do custo de pessoas</span><span className="s">visão gerencial</span></div>
          {[["PJ", "#6D3FBF"], ["Terceirizado", "#E0801F"], ["CLT", "#6E9CE8"]].map(([lab, col]) => {
            const val = lab === "PJ" ? vinc("PJ") : lab === "CLT" ? vinc("CLT") : vinc("TERCEIRIZADO");
            return <div className="fv3-row" key={lab}><div style={{ width: "100%" }}><div className="nm">{lab} <span className="amt" style={{ float: "right" }}>{pct(val)}%</span></div><div className="fv3-bar"><i style={{ width: pct(val) + "%", background: col }} /></div></div></div>;
          })}
          <div className="fv3-note" style={{ margin: "12px 0 0" }}>Ao cadastrar CLT, o sistema soma <b>encargos automáticos</b> (INSS patronal, FGTS, 13º, férias) para mostrar o <b>custo real</b>.</div>
        </div>
      </div>

      {/* Lançamentos a pagar — tabela flat + filtro Excel + subtotais + scroll infinito */}
      <div className="fv3-sech"><h3>Lançamentos a pagar</h3><span className="rt">{filtered.length} lançamento(s) no filtro</span></div>
      <div className="fv3-toolbar">
        <div className="fv3-search">🔍 <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar em qualquer coluna…" /></div>
        <label className="fv3-lbl">Data de referência (PDF): <input type="date" value={pdfRef} onChange={e => setPdfRef(e.target.value)} /></label>
        <button className="fv3-btn" onClick={() => { setCf(emptyCF()); setChip("Todos"); setSearch(""); }}>Limpar filtros</button>
        <button className="fv3-btn dark" onClick={exportPDF}>⭳ Exportar PDF</button>
      </div>

      <div className="fv3-subbar">
        <div className="stx"><span className="k">Filtro</span><span className="v">{fFiltroDesc()}</span></div>
        <div className="stx"><span className="k">Lançamentos</span><span className="v">{filtered.length}</span></div>
        <div className="stx"><span className="k">Total</span><span className="v">{BRL(fTot)}</span></div>
        <div className="stx"><span className="k">Já pago</span><span className="v green">{BRL(fPago)}</span></div>
        <div className="stx"><span className="k">Restante</span><span className="v amber">{BRL(fRest)}</span></div>
      </div>

      <div className="fv3-tablewrap">
        <div className="fv3-tscroll" ref={scRef} onScroll={onScroll}>
          <table>
            <thead><tr>
              {COLS.map(c => (
                <th key={c.k} className={(c.right ? "r " : "") + (colActive(c.k, c.type) ? "active" : "")} onClick={(e) => openPop(e, c.k, c.type)}>{c.label} <span className="fic">▾</span></th>
              ))}
            </tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={8} style={{ padding: 16, color: "#6B7280" }}>Nenhum lançamento para este filtro.</td></tr> : shown.map(i => (
                <tr key={i.id}>
                  <td className="co">{i.empresa}<small>{i.sub}</small></td>
                  <td><span className="typ">{(CAT_EMOJI[i.categoria] || "")} {i.categoria}</span></td>
                  <td className="dt">{fmtDT(i.venc)}</td>
                  <td className="dt">{i.pag ? fmtDT(i.pag) : <small>—</small>}</td>
                  <td className="r">{BRL(i.total)}</td>
                  <td className="r green">{i.pago ? BRL(i.pago) : "R$ 0,00"}</td>
                  <td className={"r " + (i.restante > 0 ? (i.status === "Vencido" ? "red" : "amber") : "")}>{BRL(i.restante)}</td>
                  <td><span className={"st " + stCls(i.status)}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="totrow"><td colSpan={4}>Σ Totais do filtro</td><td className="r">{BRL(fTot)}</td><td className="r green">{BRL(fPago)}</td><td className="r amber">{BRL(fRest)}</td><td /></tr></tfoot>
          </table>
          <div className="fv3-sentinel">{visN >= filtered.length ? (filtered.length ? "✓ fim da lista" : "") : "carregando mais conforme você rola…"}</div>
        </div>
        <div className="fv3-tfoot"><span>{Math.min(visN, filtered.length)} de {filtered.length} carregados</span><span>Carregamento infinito · role para carregar mais</span></div>
      </div>

      {/* popover de filtro (Excel) */}
      {pop && <ExcelPop pop={pop} cf={cf} setCf={setCf} distinct={distinct} setColSet={setColSet} setSortKey={setSortKey} setSortDir={setSortDir} close={() => setPop(null)} popSearch={popSearch} setPopSearch={setPopSearch} catEmoji={CAT_EMOJI} />}

      {/* drill-down da ORIGEM do custo de IA (fonte: finance.ai_costs, custo real auto-sync) */}
      {iaDrill && <div className="fv3-modal" onClick={() => setIaDrill(null)}><div className="box" onClick={e => e.stopPropagation()}>
        <div className="mh"><div><div className="m-t">{iaDrill.title}</div><div className="m-s">{iaDrill.sub}</div></div><button className="x" onClick={() => setIaDrill(null)}>✕</button></div>
        <div className="m-scroll"><table className="mtab"><thead><tr><th>Plataforma</th><th>Cliente / uso</th><th className="r">Tokens</th><th className="r">Custo</th><th>Período</th></tr></thead>
          <tbody>{iaDrill.rows.length ? iaDrill.rows.map((r: any, k: number) => (<tr key={k}><td>{r.platform || r.provider || "—"}</td><td>{r.organization_name || (r.kind === "interno" ? "Interno / plataforma" : "—")}</td><td className="r">{((Number(r.tokens_in || 0) + Number(r.tokens_out || 0)) || 0).toLocaleString("pt-BR")}</td><td className="r">{BRL(Number(r.cost || 0))}</td><td>{ymd(r.period_start)}{r.period_end ? " → " + ymd(r.period_end) : ""}</td></tr>)) : <tr><td colSpan={5} style={{ padding: 14, color: "#6B7280" }}>Sem lançamentos-fonte no período. Clique em <b>Sincronizar</b> para puxar o custo real das APIs de billing.</td></tr>}</tbody></table></div>
        <div className="fv3-note" style={{ margin: "12px 0 0" }}>Fonte: <b>finance.ai_costs</b> — custo REAL puxado das APIs de billing dos provedores (auto-sync). Anthropic/OpenAI via Admin key no cofre; Google/Gemini via Cloud Billing; DeepSeek por uso.</div>
      </div></div>}
    </div>
  );
}

function ExcelPop({ pop, cf, setCf, distinct, setColSet, setSortKey, setSortDir, close, popSearch, setPopSearch, catEmoji }: any) {
  const col = pop.col, type = pop.type;
  const NK: any = { total: ["totalMin", "totalMax"], pago: ["pagoMin", "pagoMax"], restante: ["restMin", "restMax"] };
  const DK: any = { venc: ["vencDe", "vencAte"], pag: ["pagDe", "pagAte"] };
  const vals = type === "set" ? distinct(col) : [];
  const sel: Set<string> | null = cf[col];
  const [checked, setChecked] = useState<Set<string>>(new Set(sel ? Array.from(sel) : vals));
  const toggle = (v: string) => setChecked(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const label: any = { empresa: "Empresa / Item", categoria: "Categoria", status: "Status", venc: "Vencimento", pag: "Pagamento", total: "Total", pago: "Já pago", restante: "Restante" };
  return (
    <div className="fv3-pop" style={{ left: pop.x, top: pop.y }} onClick={e => e.stopPropagation()}>
      <div className="ttl">{label[col]}</div>
      <div className="sort">
        <button onClick={() => { setSortKey(col); setSortDir(1); close(); }}>↑ A–Z / menor</button>
        <button onClick={() => { setSortKey(col); setSortDir(-1); close(); }}>↓ Z–A / maior</button>
      </div>
      {type === "set" && <>
        <input className="fsearch" placeholder="Buscar…" value={popSearch} onChange={e => setPopSearch(e.target.value)} />
        <div className="vals">
          <label className="all"><input type="checkbox" checked={checked.size === vals.length} onChange={e => setChecked(e.target.checked ? new Set(vals) : new Set())} /> (Selecionar tudo)</label>
          {vals.filter((v: string) => v.toLowerCase().includes(popSearch.toLowerCase())).map((v: string) => (
            <label key={v}><input type="checkbox" checked={checked.has(v)} onChange={() => toggle(v)} /> {col === "categoria" ? (catEmoji[v] || "") + " " : ""}{v}</label>
          ))}
        </div>
      </>}
      {type === "date" && <div className="rng"><input type="date" value={cf[DK[col][0]]} onChange={e => setCf((c: any) => ({ ...c, [DK[col][0]]: e.target.value }))} /><input type="date" value={cf[DK[col][1]]} onChange={e => setCf((c: any) => ({ ...c, [DK[col][1]]: e.target.value }))} /></div>}
      {type === "num" && <div className="rng"><input type="number" placeholder="mín R$" value={cf[NK[col][0]]} onChange={e => setCf((c: any) => ({ ...c, [NK[col][0]]: e.target.value }))} /><input type="number" placeholder="máx R$" value={cf[NK[col][1]]} onChange={e => setCf((c: any) => ({ ...c, [NK[col][1]]: e.target.value }))} /></div>}
      <div className="foot">
        <button className="cl" onClick={() => { if (type === "set") setCf((c: any) => ({ ...c, [col]: null })); else { const K = type === "date" ? DK[col] : NK[col]; setCf((c: any) => ({ ...c, [K[0]]: "", [K[1]]: "" })); } close(); }}>Limpar coluna</button>
        <button className="ok" onClick={() => { if (type === "set") setColSet(col, Array.from(checked)); close(); }}>Aplicar</button>
      </div>
    </div>
  );
}

const CSS = `
.fv3{--navy:#010E26;--blue:#6E9CE8;--blue-ink:#2E5BB0;--green:#16A34A;--green-bg:#E9F7EF;--green-ink:#0F7A3D;--amber:#E0801F;--amber-bg:#FDF3E7;--red:#DC2626;--red-bg:#FDECEC;--yellow:#B7791F;--yellow-bg:#FEF9E7;--line:#EDEFF3;--line2:#E4E7EC;--muted:#6B7280;--muted2:#9AA3AF;--shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);color:var(--navy);font-family:inherit}
.fv3 .green{color:var(--green)}.fv3 .amber{color:var(--amber)}.fv3 .red{color:var(--red)}
.fv3-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:14px}
.fv3-kpi{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow)}
.fv3-kpi .lbl{font-size:10.5px;letter-spacing:.08em;font-weight:700;color:var(--muted2);text-transform:uppercase}
.fv3-kpi .val{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:10px 0 6px}
.fv3-kpi .hint{font-size:12px;color:var(--muted)}
.fv3-chips{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 16px}
.fv3-chip{border:1px solid var(--line2);background:#fff;border-radius:20px;padding:7px 14px;font-size:12.5px;font-weight:600;color:#4A5568;cursor:pointer;user-select:none}
.fv3-chip:hover{background:#F4F6F9}.fv3-chip.active{background:var(--navy);color:#fff;border-color:var(--navy)}
.fv3-chip small{opacity:.7;font-weight:500;margin-left:5px}
.fv3-buckets{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:14px 0}
.fv3-bucket{border-radius:14px;padding:15px 17px}
.fv3-bucket .lbl{font-size:10.5px;letter-spacing:.06em;font-weight:700;text-transform:uppercase;opacity:.85}
.fv3-bucket .val{font-size:21px;font-weight:800;margin-top:8px}
.fv3-bucket.red{background:var(--red-bg);color:var(--red)}.fv3-bucket.yellow{background:var(--yellow-bg);color:var(--yellow)}
.fv3-bucket.blue{background:#EAF1FC;color:var(--blue-ink)}.fv3-bucket.green{background:var(--green-bg);color:var(--green-ink)}
.fv3-sech{display:flex;align-items:center;justify-content:space-between;margin:24px 0 12px}
.fv3-sech h3{font-size:16px;font-weight:800}.fv3-sech .rt{font-size:13px;color:var(--muted);font-weight:600}
.fv3-panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.fv3-panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow)}
.fv3-panel .ph{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.fv3-panel .ph .t{font-size:13.5px;font-weight:800}.fv3-panel .ph .s{font-size:12px;color:var(--muted)}
.fv3-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.fv3-row:first-of-type{border-top:0}
.fv3-row .nm{font-weight:600;font-size:13.5px}.fv3-row .mt{font-size:11.5px;color:var(--muted)}
.fv3-row .amt{margin-left:auto;font-weight:700;font-size:13.5px}
.fv3-row .av{width:30px;height:30px;border-radius:9px;background:#EEF1F5;display:grid;place-items:center;font-size:11px;font-weight:800;color:#5B6472}
.fv3-bar{height:7px;border-radius:6px;background:#EEF1F5;overflow:hidden;margin-top:6px}.fv3-bar>i{display:block;height:100%;border-radius:6px}
.fv3 .tag{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px}
.fv3 .tag.pj{background:#F0ECFB;color:#6D3FBF}.fv3 .tag.clt{background:#EAF1FC;color:var(--blue-ink)}.fv3 .tag.terc{background:#FDF3E7;color:var(--amber)}.fv3 .tag.cli{background:#EAF1FC;color:var(--blue-ink)}
.fv3-note{background:#F6F8FC;border:1px solid #E4EAF4;border-left:3px solid var(--blue);border-radius:12px;padding:13px 15px;font-size:12.5px;color:#3A4353;line-height:1.5;margin:14px 0}
.fv3-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.fv3-search{flex:1;min-width:220px;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line2);border-radius:11px;padding:9px 13px}
.fv3-search input{border:0;outline:0;font:inherit;font-size:13.5px;width:100%;background:transparent}
.fv3-lbl{font-size:11.5px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px}
.fv3-lbl input{font:inherit;font-size:12px;border:1px solid var(--line2);border-radius:8px;padding:6px 8px}
.fv3-btn{border:1px solid var(--line2);background:#fff;border-radius:10px;padding:9px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.fv3-btn:hover{background:#F7F8FA}.fv3-btn.dark{background:var(--navy);color:#fff;border-color:var(--navy)}
.fv3-subbar{display:flex;gap:26px;flex-wrap:wrap;align-items:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 18px;box-shadow:var(--shadow);margin:2px 0 10px}
.fv3-subbar .stx{display:flex;flex-direction:column;gap:2px}
.fv3-subbar .k{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2);font-weight:700}
.fv3-subbar .v{font-size:16px;font-weight:800}
.fv3-tablewrap{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.fv3-tscroll{max-height:560px;overflow:auto}
.fv3 table{width:100%;border-collapse:collapse}
.fv3 thead th{position:sticky;top:0;z-index:2;background:#FCFCFD;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2);font-weight:700;text-align:left;padding:12px 14px;white-space:nowrap;cursor:pointer}
.fv3 thead th:hover{color:var(--blue-ink);background:#F4F7FC}
.fv3 thead th.r{text-align:right}.fv3 thead th.active{color:var(--blue-ink)}
.fv3 thead th .fic{opacity:.45;font-size:10px}.fv3 thead th.active .fic{opacity:1}
.fv3 tbody td{padding:12px 14px;border-top:1px solid var(--line);font-size:13px;white-space:nowrap}
.fv3 td.r{text-align:right}
.fv3 td.co{font-weight:700}.fv3 td.co small{display:block;font-weight:500;color:var(--muted);font-size:11.5px;margin-top:2px}
.fv3 td.dt{font-variant-numeric:tabular-nums;font-size:12.5px}
.fv3 .typ{font-size:11.5px;font-weight:600;color:#5B6472;background:#F4F6F9;padding:4px 10px;border-radius:20px}
.fv3 .st{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:20px}
.fv3 .st.pend{background:#EEF1F5;color:#5B6472}.fv3 .st.pago{background:var(--green-bg);color:var(--green-ink)}.fv3 .st.venc{background:var(--red-bg);color:var(--red)}
.fv3 tfoot .totrow td{position:sticky;bottom:0;background:#F7F9FD;border-top:2px solid var(--line2);font-weight:800;font-size:12.5px;padding:12px 14px}
.fv3-sentinel{padding:14px;text-align:center;color:var(--muted);font-size:12.5px}
.fv3-tfoot{display:flex;justify-content:space-between;padding:11px 15px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted);background:#FCFCFD}
.fv3-pop{position:fixed;z-index:70;width:252px;background:#fff;border:1px solid var(--line2);border-radius:12px;box-shadow:0 12px 30px rgba(16,24,40,.16);padding:10px;font-size:12.5px}
.fv3-pop .ttl{font-weight:800;font-size:12px;margin-bottom:8px}
.fv3-pop .sort{display:flex;gap:6px;margin-bottom:8px}
.fv3-pop .sort button{flex:1;border:1px solid var(--line2);background:#fff;border-radius:8px;padding:6px;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer}
.fv3-pop .sort button:hover{background:#F4F6F9}
.fv3-pop .fsearch{width:100%;padding:7px 9px;border:1px solid var(--line2);border-radius:8px;font:inherit;font-size:12px;margin-bottom:6px}
.fv3-pop .vals{max-height:184px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px}
.fv3-pop label{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-weight:500}
.fv3-pop label:hover{background:#F4F6F9}.fv3-pop label.all{font-weight:700;border-bottom:1px solid var(--line);border-radius:0;margin-bottom:2px}
.fv3-pop .rng{display:flex;gap:6px}.fv3-pop .rng input{width:50%;padding:7px 8px;border:1px solid var(--line2);border-radius:8px;font:inherit;font-size:12px}
.fv3-pop .foot{display:flex;justify-content:space-between;align-items:center;margin-top:9px}
.fv3-pop .foot button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:7px 9px;border-radius:8px}
.fv3-pop .foot .ok{background:var(--navy);color:#fff;padding:7px 16px}.fv3-pop .foot .cl{color:var(--muted)}
.fv3-row.clk{cursor:pointer;border-radius:8px;padding-left:6px;padding-right:6px;margin:0 -6px;transition:background .08s}
.fv3-row.clk:hover{background:#F4F7FC}
.fv3-row .chev{color:var(--muted2);font-weight:700;margin-left:6px}
.fv3-modal{position:fixed;inset:0;z-index:80;background:rgba(8,15,30,.42);display:flex;align-items:center;justify-content:center;padding:24px}
.fv3-modal .box{background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(16,24,40,.28);width:min(760px,96vw);max-height:86vh;overflow:auto;padding:20px 22px}
.fv3-modal .mh{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}
.fv3-modal .m-t{font-size:18px;font-weight:800}.fv3-modal .m-s{font-size:12.5px;color:var(--muted);margin-top:2px}
.fv3-modal .x{border:0;background:#F1F3F7;border-radius:8px;width:30px;height:30px;font-size:14px;cursor:pointer;color:#5B6472}
.fv3-modal .m-scroll{overflow:auto;border:1px solid var(--line);border-radius:12px}
.fv3-modal .mtab{width:100%;border-collapse:collapse}
.fv3-modal .mtab th{background:#FCFCFD;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2);font-weight:700;text-align:left;padding:11px 13px;white-space:nowrap}
.fv3-modal .mtab th.r,.fv3-modal .mtab td.r{text-align:right}
.fv3-modal .mtab td{padding:11px 13px;border-top:1px solid var(--line);font-size:13px;white-space:nowrap}
@media(max-width:1050px){.fv3-grid3,.fv3-buckets,.fv3-panels{grid-template-columns:1fr 1fr}}
`;
