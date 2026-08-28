// ============================================================================
// CONTABILIDADE — módulo NOVO (irmão do Financeiro). 2026-08-28.
// FASE 1 do trilho: DRE gerencial por competência.
// SSOT: LÊ os mesmos dados do Financeiro (finance.transactions + operational_costs)
// — NÃO duplica lançamento. Replicamos aqui SÓ as fórmulas (tabela do Simples
// Anexo III, alíquota efetiva, custo mensal por competência), fiéis ao Financeiro.
// Base do DRE: RECEITA = caixa operacional (banco Nubank+Itaú, completa; regime de
// caixa = Livro Caixa do Simples) · CUSTOS = operational_costs por competência
// (mensais cheios + anuais ÷12) · IMPOSTO = DAS Simples Anexo III sobre a receita.
// ============================================================================
import { useMemo } from "react";
import { PageHead, useAsync, money } from "../../ui/ui";
import { services } from "../../services";

const BRL = (v: number) => money(v);
const ymd = (v: any) => (v ? String(v).slice(0, 10) : "");
const ym = (v: any) => ymd(v).slice(0, 7);
const spNow = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
// "YYYY-MM" deslocado por n meses a partir de um mês base
const shiftYM = (base: string, n: number) => {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const mesLabel = (yms: string) => {
  const [y, m] = yms.split("-").map(Number);
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[m - 1]}/${String(y).slice(2)}`;
};

// --- fórmulas fiéis ao Financeiro.tsx (SSOT) ---
const SIMPLES_ANEXO_III = [
  { ate: 180000, nom: 0.06, pd: 0 },
  { ate: 360000, nom: 0.112, pd: 9360 },
  { ate: 720000, nom: 0.135, pd: 17640 },
  { ate: 1800000, nom: 0.16, pd: 35640 },
  { ate: 3600000, nom: 0.21, pd: 125640 },
  { ate: Infinity, nom: 0.33, pd: 648000 },
];
const simplesAliq = (rbt12: number) => {
  const f = SIMPLES_ANEXO_III.find((x) => rbt12 <= x.ate) || SIMPLES_ANEXO_III[SIMPLES_ANEXO_III.length - 1];
  return rbt12 > 0 ? Math.max(0, (rbt12 * f.nom - f.pd) / rbt12) : f.nom;
};
const isInterna = (r: any) => /^interna\b/i.test(String(r.category || ""));
const isFaturamento = (r: any) => /resumo anual/i.test(String(r.bank_account || ""));
const isOpRev = (r: any) => r.type === "income" && !isInterna(r) && !isFaturamento(r);
const custoMensalDe = (c: any) => (c.recurrence === "mensal" ? Number(c.amount_brl || 0) : c.recurrence === "anual" ? Number(c.amount_brl || 0) / 12 : 0);
const CAT_LABEL: Record<string, string> = { salario: "Pessoas & prestadores", beneficio: "Benefícios", ferramenta: "Ferramentas", infraestrutura: "Infraestrutura", servico: "Serviços" };
const catLabel = (c: string) => CAT_LABEL[c] || c || "Outros";
const CAT_ORDER = ["salario", "beneficio", "ferramenta", "infraestrutura", "servico"];

const N_MESES = 6; // colunas do comparativo (últimos N meses)

export default function Contabilidade() {
  const { data, loading } = useAsync(async () => {
    const [tx, costs] = await Promise.all([
      services.finance.transactions.list(),
      services.finance.costs.list(),
    ]);
    return { tx: tx || [], costs: costs || [] };
  }, []);

  const dre = useMemo(() => {
    const tx = data?.tx || [];
    const costs = (data?.costs || []).filter((c: any) => c.is_active);

    // receita operacional por mês (caixa/banco, completa)
    const revByMonth: Record<string, number> = {};
    tx.filter(isOpRev).forEach((r: any) => { const m = ym(r.transaction_date); if (m) revByMonth[m] = (revByMonth[m] || 0) + Number(r.amount || 0); });
    // RBT12 até (exclusive) um mês → soma dos 12 meses anteriores
    const rbt12Ate = (mesYM: string) => {
      const ini = shiftYM(mesYM, -12);
      return Object.entries(revByMonth).reduce((a, [m, v]) => (m >= ini && m < mesYM ? a + v : a), 0);
    };

    // custos por competência, agrupados por categoria (mensais cheios + anuais ÷12)
    const custoGrupo: Record<string, number> = {};
    costs.forEach((c: any) => { const cat = c.category || "outro"; custoGrupo[cat] = (custoGrupo[cat] || 0) + custoMensalDe(c); });
    const cats = [...CAT_ORDER.filter((k) => custoGrupo[k]), ...Object.keys(custoGrupo).filter((k) => !CAT_ORDER.includes(k))];
    const custoTotalMes = Object.values(custoGrupo).reduce((a, v) => a + v, 0);

    // meses do comparativo: últimos N terminando no mês atual
    const mesAtual = ym(spNow());
    const meses: string[] = [];
    for (let i = N_MESES - 1; i >= 0; i--) meses.push(shiftYM(mesAtual, -i));

    // linha por mês
    const col = meses.map((m) => {
      const receita = revByMonth[m] || 0;
      const rbt12 = rbt12Ate(m);
      const aliq = simplesAliq(rbt12);
      const das = receita * aliq;
      const receitaLiq = receita - das;
      const resultado = receitaLiq - custoTotalMes;
      return { m, receita, aliq, das, receitaLiq, custoTotalMes, resultado, margem: receita > 0 ? resultado / receita : 0 };
    });

    // total do período (soma dos N meses)
    const sum = (f: (c: any) => number) => col.reduce((a, c) => a + f(c), 0);
    const tReceita = sum((c) => c.receita), tDas = sum((c) => c.das), tCusto = sum((c) => c.custoTotalMes), tResult = sum((c) => c.resultado);
    const total = { receita: tReceita, das: tDas, receitaLiq: tReceita - tDas, custoTotalMes: tCusto, resultado: tResult, margem: tReceita > 0 ? tResult / tReceita : 0, aliq: tReceita > 0 ? tDas / tReceita : 0 };

    const farol = total.margem >= 0.10 ? "green" : total.margem >= 0 ? "yellow" : "red";
    return { meses, col, total, cats, custoGrupo, custoTotalMes, mesAtual };
  }, [data]);

  const pct = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";
  const FAROL: Record<string, { emoji: string; lab: string; cls: string }> = {
    green: { emoji: "🟢", lab: "Resultado saudável", cls: "g" },
    yellow: { emoji: "🟡", lab: "No limite", cls: "y" },
    red: { emoji: "🔴", lab: "No vermelho", cls: "r" },
  };

  return (
    <div className="contab">
      <style>{CSS}</style>
      <PageHead
        eyebrow="Financeiro & Contabilidade"
        title="Contabilidade"
        sub="DRE gerencial por competência — o resultado da empresa, mês a mês, sem depender do contador para ver."
      />

      {loading ? (
        <div className="contab-load">Carregando o DRE…</div>
      ) : !dre ? (
        <div className="contab-load">Sem dados.</div>
      ) : (() => {
        const t = dre.total; const f = FAROL[t.margem >= 0.10 ? "green" : t.margem >= 0 ? "yellow" : "red"];
        return (<>
          {/* KPIs do período */}
          <div className="contab-kpis">
            <div className="contab-kpi"><div className="lbl">Receita operacional</div><div className="val">{BRL(t.receita)}</div><div className="hint">últimos {N_MESES} meses (caixa/banco)</div></div>
            <div className="contab-kpi"><div className="lbl">Impostos (DAS)</div><div className="val warn">{BRL(t.das)}</div><div className="hint">Simples Anexo III · {pct(t.aliq)} efetiva</div></div>
            <div className="contab-kpi"><div className="lbl">Custos & despesas</div><div className="val warn">{BRL(t.custoTotalMes * N_MESES)}</div><div className="hint">por competência (anuais ÷12)</div></div>
            <div className={"contab-kpi hero " + f.cls}><div className="lbl">Resultado do período</div><div className="val">{BRL(t.resultado)}</div><div className="hint">{f.emoji} {f.lab} · margem {pct(t.margem)}</div></div>
          </div>

          {/* DRE mês a mês */}
          <div className="contab-sech"><h3>Demonstração do Resultado (DRE) — mês a mês</h3><span className="rt">competência · últimos {N_MESES} meses</span></div>
          <div className="contab-tablewrap"><div className="contab-tscroll">
            <table className="dre">
              <thead><tr>
                <th className="lin">Conta</th>
                {dre.meses.map((m) => <th key={m} className="r">{mesLabel(m)}</th>)}
                <th className="r tot">Total {N_MESES}m</th>
              </tr></thead>
              <tbody>
                <tr className="rev">
                  <td className="lin">Receita operacional</td>
                  {dre.col.map((c) => <td key={c.m} className="r">{BRL(c.receita)}</td>)}
                  <td className="r tot">{BRL(t.receita)}</td>
                </tr>
                <tr className="neg">
                  <td className="lin">(−) Impostos sobre a receita (DAS)</td>
                  {dre.col.map((c) => <td key={c.m} className="r">{c.das ? "(" + BRL(c.das) + ")" : "—"}</td>)}
                  <td className="r tot">({BRL(t.das)})</td>
                </tr>
                <tr className="sub">
                  <td className="lin">= Receita líquida</td>
                  {dre.col.map((c) => <td key={c.m} className="r">{BRL(c.receitaLiq)}</td>)}
                  <td className="r tot">{BRL(t.receitaLiq)}</td>
                </tr>
                <tr className="grp"><td className="lin" colSpan={dre.meses.length + 2}>(−) Custos e despesas — por competência</td></tr>
                {dre.cats.map((cat) => (
                  <tr key={cat} className="neg det">
                    <td className="lin">&nbsp;&nbsp;{catLabel(cat)}</td>
                    {dre.col.map((c) => <td key={c.m} className="r">({BRL(dre.custoGrupo[cat])})</td>)}
                    <td className="r tot">({BRL(dre.custoGrupo[cat] * N_MESES)})</td>
                  </tr>
                ))}
                <tr className="sub">
                  <td className="lin">= Total de custos e despesas</td>
                  {dre.col.map((c) => <td key={c.m} className="r">({BRL(c.custoTotalMes)})</td>)}
                  <td className="r tot">({BRL(t.custoTotalMes)})</td>
                </tr>
                <tr className="res">
                  <td className="lin">= Resultado do período</td>
                  {dre.col.map((c) => <td key={c.m} className={"r " + (c.resultado < 0 ? "vneg" : "vpos")}>{BRL(c.resultado)}</td>)}
                  <td className={"r tot " + (t.resultado < 0 ? "vneg" : "vpos")}>{BRL(t.resultado)}</td>
                </tr>
                <tr className="mrg">
                  <td className="lin">Margem</td>
                  {dre.col.map((c) => <td key={c.m} className="r">{c.receita > 0 ? pct(c.margem) : "—"}</td>)}
                  <td className="r tot">{pct(t.margem)}</td>
                </tr>
              </tbody>
            </table>
          </div></div>

          <div className="contab-note">
            <b>Base deste DRE.</b> <b>Receita</b> = caixa operacional dos bancos (Nubank + Itaú), sem transferências internas —
            é a receita <b>completa</b> da empresa (regime de caixa = Livro Caixa do Simples). <b>Impostos</b> = DAS do Simples
            (Anexo III), alíquota efetiva pelo RBT12. <b>Custos</b> = por competência (mensais cheios + anuais rateados ÷12),
            vindos do Financeiro. Não redigita nada: <b>lê</b> os mesmos lançamentos.
            <br />O MRR de competência dos contratos formais (no módulo A Receber) é um <b>subconjunto</b> da receita do banco —
            muitos clientes pagam sem contrato lançado. A conciliação fina entra numa próxima fase.
          </div>

          {/* Próximas fases do trilho */}
          <div className="contab-sech"><h3>Trilho da Contabilidade</h3></div>
          <div className="contab-fases">
            <div className="fase done"><span className="fn">1</span><div><b>DRE gerencial por competência</b> <span className="ftag done">✓ no ar</span><p>O resultado mês a mês, direto dos dados do Financeiro.</p></div></div>
            <div className="fase"><span className="fn">2</span><div><b>Plano de contas + lançamentos</b> <span className="ftag">próxima</span><p>Cada movimento numa conta contábil → Razão e Diário.</p></div></div>
            <div className="fase"><span className="fn">3</span><div><b>Livro Caixa / ECD + fechamento + assinatura</b> <span className="ftag">meta</span><p>Período travado, trilha imutável, o contador revisa e assina (CRC).</p></div></div>
          </div>
        </>);
      })()}
    </div>
  );
}

const CSS = `
.contab{--navy:#0B1830;--blue:var(--crasto-blue,#6E9CE8);--blue-ink:var(--crasto-blue,#2E5BB0);--green:var(--fin-green,#16A34A);--green-ink:var(--fin-green,#0F7A3D);--red:var(--fin-red,#DC2626);--amber:#B45309;--line:var(--crasto-border-soft,#EDEFF3);--line2:var(--crasto-border,#E4E7EC);--muted:var(--crasto-text-muted,#6B7280);--muted2:var(--crasto-text-faint,#9AA3AF);--card:var(--crasto-surface,#fff);--hover:var(--crasto-surface-2,#F6F7F9);--txt:var(--crasto-text-primary,#0B1220);--info-bg:rgba(110,156,232,.12);--shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);color:var(--txt)}
.contab-load{padding:40px;text-align:center;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:16px;margin-top:8px}
.contab-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:8px 0 6px}
.contab-kpi{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow)}
.contab-kpi .lbl{font-size:10.5px;letter-spacing:.06em;font-weight:700;color:var(--muted2);text-transform:uppercase}
.contab-kpi .val{font-size:23px;font-weight:800;letter-spacing:-.02em;margin:9px 0 5px}
.contab-kpi .val.warn{color:var(--amber)}
.contab-kpi .hint{font-size:11.5px;color:var(--muted)}
.contab-kpi.hero{color:#fff;border-color:transparent}
.contab-kpi.hero .lbl{color:rgba(255,255,255,.8)}.contab-kpi.hero .hint{color:rgba(255,255,255,.9)}
.contab-kpi.hero.g{background:linear-gradient(180deg,#0e7a43,#0b5e34)}
.contab-kpi.hero.y{background:linear-gradient(180deg,#b8860b,#8a6508)}
.contab-kpi.hero.r{background:linear-gradient(180deg,#b23b3b,#8f2d2d)}
.contab-sech{display:flex;align-items:center;justify-content:space-between;margin:22px 0 12px}
.contab-sech h3{font-size:16px;font-weight:800}.contab-sech .rt{font-size:12.5px;color:var(--muted);font-weight:600}
.contab-tablewrap{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.contab-tscroll{overflow-x:auto}
.dre{width:100%;border-collapse:collapse;min-width:640px}
.dre th{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2);font-weight:700;padding:12px 14px;text-align:left;background:var(--card);border-bottom:1px solid var(--line2);white-space:nowrap;position:sticky;top:0}
.dre th.r,.dre td.r{text-align:right;font-variant-numeric:tabular-nums}
.dre th.tot,.dre td.tot{background:var(--info-bg);font-weight:800}
.dre td{padding:10px 14px;font-size:12.5px;border-top:1px solid var(--line);white-space:nowrap}
.dre td.lin{font-weight:600;color:var(--txt)}
.dre tr.rev td{font-weight:700}
.dre tr.neg td{color:var(--muted)}
.dre tr.neg.det td.lin{font-weight:500;color:var(--muted)}
.dre tr.sub td{background:var(--hover);font-weight:800;border-top:1px solid var(--line2)}
.dre tr.grp td{font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted2);font-weight:700;background:var(--card);padding-top:14px}
.dre tr.res td{font-size:14px;font-weight:800;border-top:2px solid var(--navy);background:var(--card)}
.dre td.vpos{color:var(--green-ink)}.dre td.vneg{color:var(--red)}
.dre tr.mrg td{color:var(--muted);font-weight:600;font-size:11.5px;border-top:1px dashed var(--line2)}
.contab-note{background:var(--info-bg);border:1px solid var(--line2);border-left:3px solid var(--blue);border-radius:12px;padding:13px 15px;font-size:12px;line-height:1.55;color:var(--muted);margin:14px 0}
.contab-note b{color:var(--txt)}
.contab-fases{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.contab-fase,.fase{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px 16px;box-shadow:var(--shadow)}
.fase.done{border-color:var(--green)}
.fase .fn{flex:0 0 auto;width:26px;height:26px;border-radius:8px;background:var(--navy);color:#fff;font-weight:800;font-size:13px;display:inline-flex;align-items:center;justify-content:center}
.fase.done .fn{background:var(--green)}
.fase b{font-size:13px;color:var(--txt)}
.fase p{font-size:11.5px;color:var(--muted);margin:5px 0 0;line-height:1.45}
.ftag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:20px;background:var(--hover);color:var(--muted);margin-left:6px}
.ftag.done{background:rgba(22,163,74,.13);color:var(--green-ink)}
@media(max-width:1050px){.contab-kpis{grid-template-columns:repeat(2,1fr)}.contab-fases{grid-template-columns:1fr}}
@media(max-width:560px){.contab-kpis{grid-template-columns:1fr}}
`;
