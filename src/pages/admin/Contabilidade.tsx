// ============================================================================
// CONTABILIDADE — módulo (irmão do Financeiro). Sub-páginas via /admin/contabilidade/:secao.
// Cockpit (default) · DRE (ao vivo, Fase 1) · Notas · Guias · Folha · CNAEs ·
// Inteligência fiscal · Obrigações · Documentos · Fechamento & assinatura.
// SSOT: o DRE LÊ finance.transactions + operational_costs (não duplica). As demais
// telas são o front aprovado (mockup 2026-08-28); middle/backend entram nas próximas fases.
// ============================================================================
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHead, useAsync, money } from "../../ui/ui";
import { services } from "../../services";

const BRL = (v: number) => money(v);
const ymd = (v: any) => (v ? String(v).slice(0, 10) : "");
const ym = (v: any) => ymd(v).slice(0, 7);
const spNow = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const shiftYM = (base: string, n: number) => { const [y, m] = base.split("-").map(Number); const d = new Date(y, (m - 1) + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const mesLabel = (yms: string) => { const [y, m] = yms.split("-").map(Number); const n = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]; return `${n[m - 1]}/${String(y).slice(2)}`; };

// fórmulas fiéis ao Financeiro.tsx (SSOT)
const SIMPLES_ANEXO_III = [
  { ate: 180000, nom: 0.06, pd: 0 }, { ate: 360000, nom: 0.112, pd: 9360 }, { ate: 720000, nom: 0.135, pd: 17640 },
  { ate: 1800000, nom: 0.16, pd: 35640 }, { ate: 3600000, nom: 0.21, pd: 125640 }, { ate: Infinity, nom: 0.33, pd: 648000 },
];
const simplesAliq = (rbt12: number) => { const f = SIMPLES_ANEXO_III.find((x) => rbt12 <= x.ate) || SIMPLES_ANEXO_III[5]; return rbt12 > 0 ? Math.max(0, (rbt12 * f.nom - f.pd) / rbt12) : f.nom; };
const isInterna = (r: any) => /^interna\b/i.test(String(r.category || ""));
const isFaturamento = (r: any) => /resumo anual/i.test(String(r.bank_account || ""));
const isOpRev = (r: any) => r.type === "income" && !isInterna(r) && !isFaturamento(r);
const custoMensalDe = (c: any) => (c.recurrence === "mensal" ? Number(c.amount_brl || 0) : c.recurrence === "anual" ? Number(c.amount_brl || 0) / 12 : 0);
const CAT_ORDER = ["salario", "beneficio", "ferramenta", "infraestrutura", "servico"];
const N_MESES = 6;

const PORTAIS = [
  { k: "sp", label: "NFS-e · Prefeitura de SP", url: "https://nfe.prefeitura.sp.gov.br", desc: "nota de serviço (município da empresa)" },
  { k: "nac", label: "NFS-e · Nacional", url: "https://www.nfse.gov.br", desc: "emissor nacional (padrão unificado)" },
  { k: "das", label: "PGDAS-D · DAS", url: "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgdasd2018.app/", desc: "apurar e gerar o DAS do Simples" },
  { k: "ecac", label: "e-CAC · Receita", url: "https://cav.receita.fazenda.gov.br", desc: "DCTFWeb, certidões, guias federais" },
];

const DOC_CATS = [
  { k: "guias", ic: "🏦", label: "Guias", desc: "DAS, DARF DCTFWeb" },
  { k: "notas", ic: "🧾", label: "Notas fiscais", desc: "NFS-e emitidas" },
  { k: "prolabore", ic: "👤", label: "Pró-labore", desc: "recibos mensais do sócio" },
  { k: "certidoes", ic: "📜", label: "Certidões", desc: "CNDT, FGTS, CND, INSS" },
  { k: "societario", ic: "📄", label: "Societário", desc: "contrato + alterações" },
  { k: "prestadores", ic: "🧑‍💻", label: "Prestadores", desc: "comprovantes (MEI)" },
  { k: "comprovantes", ic: "💳", label: "Comprovantes", desc: "pagamentos e recebimentos" },
  { k: "outros", ic: "📁", label: "Outros", desc: "diversos" },
];

const SECOES = [
  { k: "cockpit", ic: "🏛️", label: "Cockpit" },
  { k: "dre", ic: "📊", label: "DRE — resultado" },
  { k: "notas", ic: "🧾", label: "Notas fiscais" },
  { k: "guias", ic: "🏦", label: "Impostos & guias" },
  { k: "folha", ic: "👥", label: "Folha & pró-labore" },
  { k: "cnae", ic: "🏷️", label: "CNAEs & tributação" },
  { k: "fiscal", ic: "🧠", label: "Inteligência fiscal" },
  { k: "obrig", ic: "📋", label: "Obrigações acessórias" },
  { k: "docs", ic: "📁", label: "Documentos" },
  { k: "fecha", ic: "🔏", label: "Fechamento & assinatura" },
];

export default function Contabilidade() {
  const { secao } = useParams();
  const nav = useNavigate();
  const sec = SECOES.some((s) => s.k === secao) ? (secao as string) : "cockpit";
  const go = (k: string) => nav(k === "cockpit" ? "/admin/contabilidade" : "/admin/contabilidade/" + k);
  const [nfOpen, setNfOpen] = useState(false);
  const [nfPortal, setNfPortal] = useState(PORTAIS[0].url);

  const { data, loading } = useAsync(async () => {
    const [tx, costs] = await Promise.all([services.finance.transactions.list(), services.finance.costs.list()]);
    return { tx: tx || [], costs: costs || [] };
  }, []);

  // Documentos (arquivo real no R2 + metadados na API)
  const { data: docsData, reload: reloadDocs } = useAsync(async () => services.finance.documents.list(), []);
  const docs: any[] = docsData || [];
  const [docCat, setDocCat] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const uploadDocs = async (cat: string, files: FileList | null) => {
    if (!files || !files.length) return;
    setDocBusy(true);
    try {
      for (const file of Array.from(files)) {
        const key = await services.storage.upload("contabilidade/" + cat, file);
        await services.finance.documents.save({ category: cat, name: file.name, storage_key: key, mime: file.type || "", size: String(file.size) });
      }
      reloadDocs();
    } catch (e: any) { alert("Falha no upload: " + (e?.message || e)); } finally { setDocBusy(false); }
  };
  const openDoc = async (key: string) => { const url = await services.storage.getUrl(key); if (url) window.open(url, "_blank", "noopener"); else alert("Não consegui gerar o link do arquivo."); };
  const delDoc = async (d: any) => { if (!confirm("Excluir “" + d.name + "”? O arquivo será removido.")) return; try { await services.finance.documents.remove(d.id); await services.storage.remove(d.storage_key); } catch { /* segue */ } reloadDocs(); };
  const fmtSize = (n: any) => { const b = Number(n || 0); return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : b > 1024 ? Math.round(b / 1024) + " KB" : b + " B"; };

  const dre = useMemo(() => {
    const tx = data?.tx || []; const costs = (data?.costs || []).filter((c: any) => c.is_active);
    const revByMonth: Record<string, number> = {};
    tx.filter(isOpRev).forEach((r: any) => { const m = ym(r.transaction_date); if (m) revByMonth[m] = (revByMonth[m] || 0) + Number(r.amount || 0); });
    const rbt12Ate = (mesYM: string) => { const ini = shiftYM(mesYM, -12); return Object.entries(revByMonth).reduce((a, [m, v]) => (m >= ini && m < mesYM ? a + v : a), 0); };
    const custoGrupo: Record<string, number> = {};
    costs.forEach((c: any) => { const cat = c.category || "outro"; custoGrupo[cat] = (custoGrupo[cat] || 0) + custoMensalDe(c); });
    const custoTotalMes = Object.values(custoGrupo).reduce((a, v) => a + v, 0);
    const mesAtual = ym(spNow()); const meses: string[] = [];
    for (let i = N_MESES - 1; i >= 0; i--) meses.push(shiftYM(mesAtual, -i));
    const col = meses.map((m) => { const receita = revByMonth[m] || 0; const aliq = simplesAliq(rbt12Ate(m)); const das = receita * aliq; const receitaLiq = receita - das; const resultado = receitaLiq - custoTotalMes; return { m, receita, das, receitaLiq, resultado, margem: receita > 0 ? resultado / receita : 0 }; });
    const sum = (f: (c: any) => number) => col.reduce((a, c) => a + f(c), 0);
    const tR = sum((c) => c.receita), tD = sum((c) => c.das), tRes = sum((c) => c.resultado);
    const total = { receita: tR, das: tD, receitaLiq: tR - tD, custoTotalMes: custoTotalMes * N_MESES, resultado: tRes, margem: tR > 0 ? tRes / tR : 0, aliq: tR > 0 ? tD / tR : 0 };
    return { meses, col, total, custoGrupo, custoTotalMes, grupos: [...CAT_ORDER.filter((k) => custoGrupo[k]), ...Object.keys(custoGrupo).filter((k) => !CAT_ORDER.includes(k))] };
  }, [data]);

  const pct = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";
  const t = dre.total;
  const mesUltimo = dre.col[dre.col.length - 1] || { receita: 0, das: 0, resultado: 0, margem: 0 };
  const catLabel = (c: string) => (({ salario: "Pessoas & prestadores", beneficio: "Benefícios", ferramenta: "Ferramentas", infraestrutura: "Infraestrutura", servico: "Serviços" } as any)[c] || c || "Outros");

  return (
    <div className="contab">
      <style>{CSS}</style>
      <PageHead eyebrow="Financeiro & Contabilidade" title="Contabilidade" sub="Sua contabilidade por dentro e no seu controle — a empresa prepara, o contador só assina." />

      <nav className="csub">
        {SECOES.map((s) => (
          <button key={s.k} className={"csn" + (s.k === sec ? " on" : "")} onClick={() => go(s.k)}><span className="i">{s.ic}</span>{s.label === "Cockpit" ? "Cockpit" : s.label}</button>
        ))}
      </nav>

      {/* ===================== COCKPIT ===================== */}
      {sec === "cockpit" && (
        <div className="cbody">
          <div className="eyebrow">Diagnóstico</div>
          <h2 className="h-xl">Sua contabilidade, por dentro — e no seu controle.</h2>
          <p className="lead">Hoje a contabilidade da Crasto.AI é preparada por um contador externo e você não vê os livros. A meta é internalizar a preparação — DRE, notas, guias, folha e pró-labore — e deixar ao contador apenas o que exige assinatura de um CRC perante o governo.</p>

          <div className="tblw" style={{ margin: "22px 0 6px" }}>
            <div className="split">
              <div>
                <span className="pill p-pend" style={{ marginBottom: 10 }}>Como é hoje</span>
                <ul className="ul">
                  <li>Contador externo <b>São Lucas Contabilidade</b> — <b className="mono">R$ 197/mês</b></li>
                  <li>Você <b>não enxerga</b> DRE, razão nem balancete</li>
                  <li>DAS, DEFIS e folha dependem 100% dele</li>
                  <li>Notas fiscais emitidas fora do sistema</li>
                </ul>
              </div>
              <div>
                <span className="pill p-ok" style={{ marginBottom: 10 }}>Para onde vamos</span>
                <ul className="ul">
                  <li>Você <b>prepara tudo aqui</b>, com dado real do Financeiro</li>
                  <li>Emite a NF e a <b>guia sai sozinha</b> depois</li>
                  <li>Folha e pró-labore provisionados automaticamente</li>
                  <li>Contador <b>só revisa e assina</b> (contabilidade assistida)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="sech"><h3>O mês em números</h3><span className="rt">competência {mesLabel(dre.meses[dre.meses.length - 1] || "2026-08")} · Simples · Anexo III</span></div>
          <div className="grid g4">
            <div className="kpi hero"><div className="k-l">Resultado do mês</div><div className="k-v mono">{BRL(mesUltimo.resultado)}</div><div className="k-h">🟢 margem {pct(mesUltimo.margem)} · competência</div></div>
            <div className="kpi warn"><div className="k-l">DAS a recolher</div><div className="k-v mono">{BRL(mesUltimo.das)}</div><div className="k-h">Anexo III · {pct(t.aliq)} efetiva · vence dia 20</div></div>
            <div className="kpi"><div className="k-l">Receita do mês</div><div className="k-v mono">{BRL(mesUltimo.receita)}</div><div className="k-h">caixa operacional (bancos)</div></div>
            <div className="kpi"><div className="k-l">Custo do contador</div><div className="k-v mono">R$ 197</div><div className="k-h">/mês — alvo de internalização</div></div>
          </div>

          <div className="sech"><h3>Próximas obrigações</h3><span className="rt">o que precisa acontecer</span></div>
          <div className="tblw"><div className="tscroll"><table>
            <thead><tr><th>Obrigação</th><th>Tipo</th><th>Competência</th><th>Vencimento</th><th className="r">Valor</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td><b>DAS — Simples Nacional</b><div className="sub">guia única mensal</div></td><td>Mensal</td><td className="mono">ago/2026</td><td className="mono">20/09/2026</td><td className="r mono">{BRL(mesUltimo.das)}</td><td><span className="pill p-pend">a gerar</span></td></tr>
              <tr><td><b>INSS — pró-labore</b><div className="sub">via DARF DCTFWeb</div></td><td>Mensal</td><td className="mono">ago/2026</td><td className="mono">20/09/2026</td><td className="r mono">R$ 330,00</td><td><span className="pill p-pend">a gerar</span></td></tr>
              <tr><td><b>DEFIS</b><div className="sub">declaração anual do Simples</div></td><td>Anual</td><td className="mono">2025</td><td className="mono">31/03/2026</td><td className="r mono">—</td><td><span className="pill p-ok">entregue</span></td></tr>
              <tr><td><b>Pró-labore — recibo</b><div className="sub">documento do mês para arquivo</div></td><td>Mensal</td><td className="mono">ago/2026</td><td className="mono">—</td><td className="r mono">R$ 3.000,00</td><td><span className="pill p-info">a subir</span></td></tr>
            </tbody>
          </table></div></div>
        </div>
      )}

      {/* ===================== DRE (ao vivo) ===================== */}
      {sec === "dre" && (
        <div className="cbody">
          <div className="eyebrow">Fase 1 · ao vivo</div>
          <h2 className="h-lg">Demonstração do Resultado — por competência</h2>
          <p className="lead">O resultado real da empresa, mês a mês, direto dos lançamentos do Financeiro. Receita pelo regime de caixa (Livro Caixa do Simples), custos por competência (anuais ÷12), DAS pelo RBT12.</p>
          {loading ? <div className="loadbox">Carregando o DRE…</div> : (
            <>
              <div className="grid g4" style={{ margin: "20px 0 6px" }}>
                <div className="kpi"><div className="k-l">Receita (6m)</div><div className="k-v mono">{BRL(t.receita)}</div><div className="k-h">caixa operacional dos bancos</div></div>
                <div className="kpi warn"><div className="k-l">Impostos (DAS)</div><div className="k-v mono">{BRL(t.das)}</div><div className="k-h">{pct(t.aliq)} efetivo</div></div>
                <div className="kpi warn"><div className="k-l">Custos & despesas</div><div className="k-v mono">{BRL(t.custoTotalMes)}</div><div className="k-h">por competência</div></div>
                <div className="kpi hero"><div className="k-l">Resultado (6m)</div><div className="k-v mono">{BRL(t.resultado)}</div><div className="k-h">🟢 margem {pct(t.margem)}</div></div>
              </div>
              <div className="tblw" style={{ marginTop: 16 }}><div className="tscroll"><table className="dre mono">
                <thead><tr><th className="lin">Conta</th>{dre.meses.map((m) => <th key={m} className="r">{mesLabel(m)}</th>)}<th className="r tot">Total 6m</th></tr></thead>
                <tbody>
                  <tr className="rev"><td className="lin">Receita operacional</td>{dre.col.map((c) => <td key={c.m} className="r">{BRL(c.receita)}</td>)}<td className="r tot">{BRL(t.receita)}</td></tr>
                  <tr className="neg"><td className="lin">(−) Impostos (DAS)</td>{dre.col.map((c) => <td key={c.m} className="r">{c.das ? "(" + BRL(c.das) + ")" : "—"}</td>)}<td className="r tot">({BRL(t.das)})</td></tr>
                  <tr className="sub2"><td className="lin">= Receita líquida</td>{dre.col.map((c) => <td key={c.m} className="r">{BRL(c.receitaLiq)}</td>)}<td className="r tot">{BRL(t.receitaLiq)}</td></tr>
                  <tr className="grp"><td className="lin" colSpan={dre.meses.length + 2}>(−) Custos e despesas — por competência</td></tr>
                  {dre.grupos.map((cat) => (<tr key={cat} className="neg det"><td className="lin">{"  " + catLabel(cat)}</td>{dre.col.map((c) => <td key={c.m} className="r">({BRL(dre.custoGrupo[cat])})</td>)}<td className="r tot">({BRL(dre.custoGrupo[cat] * N_MESES)})</td></tr>))}
                  <tr className="res"><td className="lin">= Resultado do período</td>{dre.col.map((c) => <td key={c.m} className={"r " + (c.resultado < 0 ? "vneg" : "vpos")}>{BRL(c.resultado)}</td>)}<td className={"r tot " + (t.resultado < 0 ? "vneg" : "vpos")}>{BRL(t.resultado)}</td></tr>
                </tbody>
              </table></div></div>
            </>
          )}
          <div className="sech"><h3>Glossário — o que cada sigla contábil quer dizer</h3><span className="rt">para não depender de tradução</span></div>
          <div className="grid g3">
            {[["DRE", "Demonstração do Resultado do Exercício — receita menos impostos, custos e despesas = lucro ou prejuízo do período."],
              ["Competência × Caixa", "Competência = o mês em que o serviço aconteceu. Caixa = o mês em que o dinheiro entrou/saiu. O DRE é competência."],
              ["Receita líquida", "A receita bruta menos os impostos sobre ela (o DAS). É o que sobra antes de custos e despesas."],
              ["DAS", "Documento de Arrecadação do Simples — a guia única mensal que junta os tributos federais do Simples."],
              ["RBT12", "Receita Bruta dos últimos 12 meses. É ela que define a alíquota efetiva do DAS."],
              ["Alíquota efetiva", "O % real de imposto — menor que a nominal, porque a tabela desconta uma parcela fixa. Hoje ≈ 9,45%."],
              ["Margem", "Quanto do faturamento vira resultado. Margem 64% = de cada R$100, R$64 sobram depois de tudo."],
              ["Provisão", "Guardar hoje um custo que vence depois (13º, férias) para o resultado do mês refletir a verdade."],
              ["Encargos", "O que se paga além do salário: INSS, FGTS, 13º, férias. Num prestador MEI não há encargo."]].map(([k, v]) => (
              <div className="card" key={k}><b>{k}</b><div className="sub" style={{ marginTop: 5 }}>{v}</div></div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== NOTAS FISCAIS ===================== */}
      {sec === "notas" && (
        <div className="cbody">
          <div className="rowbetween">
            <div><div className="eyebrow">Emissão</div><h2 className="h-lg">Notas fiscais de serviço</h2></div>
            <button className="btn pri" onClick={() => setNfOpen(true)}>🧾 Emitir NF-e</button>
          </div>
          <p className="lead">Emita a nota daqui — por API (integração com a prefeitura / Nota do Milhão) ou manual. Ao emitir, o módulo provisiona o imposto e pode gerar a guia sozinho. Enquanto a API não está ligada, use os <b>portais oficiais</b> abaixo.</p>

          <div className="card" style={{ margin: "18px 0 6px" }}>
            <div className="rowbetween"><b>🔗 Portais oficiais de emissão</b><span className="tag">CRASTO.COM · São Paulo/SP</span></div>
            <div className="linkgrid">
              <a className="olink" href="https://nfe.prefeitura.sp.gov.br" target="_blank" rel="noopener noreferrer"><b>NFS-e Prefeitura de São Paulo</b><span>emitir nota de serviço (município da empresa)</span><i>nfe.prefeitura.sp.gov.br ↗</i></a>
              <a className="olink" href="https://www.nfse.gov.br" target="_blank" rel="noopener noreferrer"><b>Portal Nacional NFS-e</b><span>emissor nacional (padrão unificado)</span><i>nfse.gov.br ↗</i></a>
              <a className="olink" href="https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgdasd2018.app/" target="_blank" rel="noopener noreferrer"><b>PGDAS-D — apurar/gerar o DAS</b><span>Simples Nacional (Receita Federal)</span><i>receita.fazenda.gov.br ↗</i></a>
              <a className="olink" href="https://cav.receita.fazenda.gov.br" target="_blank" rel="noopener noreferrer"><b>e-CAC — Receita Federal</b><span>DCTFWeb, certidões, guias federais</span><i>cav.receita.fazenda.gov.br ↗</i></a>
            </div>
            <div className="sub" style={{ marginTop: 10 }}>Portais do governo — abrem em nova aba. A emissão automática por API (a partir daqui) entra na Fase 2.</div>
          </div>

          <div className="grid g3" style={{ margin: "20px 0 6px" }}>
            <div className="kpi"><div className="k-l">Emitidas no mês</div><div className="k-v mono">3</div><div className="k-h">R$ 17.376,00</div></div>
            <div className="kpi"><div className="k-l">Emissão</div><div className="k-v sm">API · Nota do Milhão</div><div className="k-h">fallback manual disponível</div></div>
            <div className="kpi"><div className="k-l">Guia após emissão</div><div className="k-v sm" style={{ color: "var(--g)" }}>Automática</div><div className="k-h">imposto recolhido sem você lembrar</div></div>
          </div>
          <div className="tblw"><div className="tscroll"><table>
            <thead><tr><th>NF</th><th>Tomador</th><th>Serviço</th><th className="r">Valor</th><th>Emissão</th><th>Guia</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td className="mono">#0042</td><td><b>Grupo El Shadai</b></td><td className="sub">Agentes de IA + CRM</td><td className="r mono">R$ 2.500,00</td><td className="mono">05/08</td><td><span className="pill p-ok">DAS gerada</span></td><td><span className="pill p-ok">autorizada</span></td></tr>
              <tr><td className="mono">#0043</td><td><b>SR Brasil Seguros</b></td><td className="sub">Portal + agentes</td><td className="r mono">R$ 700,00</td><td className="mono">05/08</td><td><span className="pill p-ok">DAS gerada</span></td><td><span className="pill p-ok">autorizada</span></td></tr>
              <tr><td className="mono">#0044</td><td><b>Tecno Lacer Fire</b></td><td className="sub">Assinatura mensal</td><td className="r mono">R$ 5.833,33</td><td className="mono">10/08</td><td><span className="pill p-pend">agendada</span></td><td><span className="pill p-info">processando</span></td></tr>
            </tbody>
          </table></div></div>
        </div>
      )}

      {/* ===================== IMPOSTOS & GUIAS ===================== */}
      {sec === "guias" && (
        <div className="cbody">
          <div className="eyebrow">Tributos</div><h2 className="h-lg">Impostos & guias</h2>
          <p className="lead">As guias que a empresa recolhe, num lugar só — geradas a partir da receita e das notas. Ligue o recolhimento automático e o módulo emite a guia assim que a nota é autorizada.</p>
          <div className="card rowcenter" style={{ margin: "20px 0" }}>
            <div style={{ flex: 1 }}><b>Recolhimento automático após a emissão da NF</b><div className="sub" style={{ marginTop: 3 }}>Emitiu a nota → o módulo calcula e gera a guia (DAS/ISS/INSS) e agenda o pagamento. Você só confirma.</div></div>
            <Switch defaultOn />
          </div>
          <div className="tblw"><div className="tscroll"><table>
            <thead><tr><th>Guia</th><th>Competência</th><th>Vencimento</th><th className="r">Valor</th><th>Origem</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td><b>DAS</b> <span className="tag">Simples</span></td><td className="mono">jul/2026</td><td className="mono">20/08/2026</td><td className="r mono">R$ 2.135,00</td><td className="sub">receita de julho</td><td><span className="pill p-ok">paga</span></td></tr>
              <tr><td><b>DAS</b> <span className="tag">Simples</span></td><td className="mono">ago/2026</td><td className="mono">20/09/2026</td><td className="r mono">R$ 1.642,00</td><td className="sub">gerada da NF #0044</td><td><span className="pill p-pend">agendada</span></td></tr>
              <tr><td><b>INSS</b> <span className="tag">pró-labore</span></td><td className="mono">ago/2026</td><td className="mono">20/09/2026</td><td className="r mono">R$ 330,00</td><td className="sub">11% sobre R$ 3.000</td><td><span className="pill p-pend">agendada</span></td></tr>
              <tr><td><b>FGTS</b> <span className="tag">se houver CLT</span></td><td className="mono">ago/2026</td><td className="mono">—</td><td className="r mono">R$ 0,00</td><td className="sub">sem funcionário CLT</td><td><span className="pill p-mute">n/a</span></td></tr>
            </tbody>
          </table></div></div>
        </div>
      )}

      {/* ===================== FOLHA & PRÓ-LABORE ===================== */}
      {sec === "folha" && (
        <div className="cbody">
          <div className="eyebrow">Pessoas</div><h2 className="h-lg">Folha & pró-labore</h2>
          <p className="lead">Quem recebe da empresa — prestadores, sócios e (quando houver) funcionários CLT — com provisionamento automático de encargos e um lugar para subir cada documento.</p>
          <div className="sech"><h3>Quem recebe</h3><span className="rt">ago/2026</span></div>
          <div className="tblw"><div className="tscroll"><table>
            <thead><tr><th>Pessoa</th><th>Vínculo</th><th className="r">Valor/mês</th><th>Encargos</th><th>Documento</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td><div className="flex"><div className="av">CC</div><div><b>Carlos Crasto</b><div className="sub">sócio-administrador</div></div></div></td><td>Pró-labore</td><td className="r mono">R$ 3.000,00</td><td className="sub">INSS 11% · IRRF</td><td><span className="pill p-info">a subir recibo</span></td><td><span className="pill p-pend">provisionar</span></td></tr>
              <tr><td><div className="flex"><div className="av">JM</div><div><b>Jhonatan (Jhon)</b><div className="sub">prestador · MEI</div></div></div></td><td>Terceirizado</td><td className="r mono">R$ 4.350,00</td><td className="sub">NF do MEI · sem encargo</td><td><span className="pill p-ok">4 comprovantes</span></td><td><span className="pill p-ok">ok</span></td></tr>
              <tr><td><div className="flex"><div className="av mut">+</div><div><b>Adicionar funcionário CLT</b><div className="sub">gera folha, FGTS, INSS, 13º, férias</div></div></div></td><td colSpan={4} className="sub">— nenhum funcionário CLT hoje —</td></tr>
            </tbody>
          </table></div></div>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="rowbetween"><b>Provisionamento de encargos</b><span className="tag">acumulado 2026</span></div>
              <div style={{ marginTop: 14 }}>
                <div className="rowbetween"><span className="sub">13º salário</span><b className="mono">R$ 0,00</b></div><div className="bar"><i style={{ width: "4%" }} /></div>
                <div className="rowbetween" style={{ marginTop: 12 }}><span className="sub">Férias + 1/3</span><b className="mono">R$ 0,00</b></div><div className="bar"><i style={{ width: "4%" }} /></div>
                <div className="rowbetween" style={{ marginTop: 12 }}><span className="sub">INSS pró-labore (acum.)</span><b className="mono">R$ 2.640,00</b></div><div className="bar"><i style={{ width: "62%" }} /></div>
              </div>
              <div className="sub" style={{ marginTop: 12 }}>Sem CLT, as provisões de 13º/férias/FGTS ficam zeradas — o módulo já está pronto para o primeiro funcionário.</div>
            </div>
            <div className="card">
              <b>Documentos de pró-labore</b>
              <div className="drop" style={{ marginTop: 12 }}>📎 <b>Arraste o recibo de pró-labore</b><br />ou clique para subir (PDF / imagem)</div>
              <div className="chk done"><div className="b">✓</div><div><div className="ct">Recibo jul/2026</div><div className="cd">R$ 3.000,00 · enviado 05/08</div></div></div>
              <div className="chk"><div className="b" /><div><div className="ct">Recibo ago/2026</div><div className="cd">pendente de upload</div></div></div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== CNAEs & TRIBUTAÇÃO ===================== */}
      {sec === "cnae" && (
        <div className="cbody">
          <div className="eyebrow">Identidade fiscal · do seu contrato social</div><h2 className="h-lg">CNAEs & tributação</h2>
          <p className="lead">O módulo guarda o seu contrato social “de cor”: cada CNAE, em qual anexo do Simples ele cai e como é tributado. Assim toda nota já nasce com o imposto certo — e você vê onde dá para melhorar.</p>
          <div className="grid g3" style={{ margin: "20px 0 6px" }}>
            <div className="kpi"><div className="k-l">Razão social</div><div className="k-v xs">CRASTO.COM Tecnologia e Neurociência LTDA</div><div className="k-h">CNPJ 22.053.341/0001-68 · EPP · desde 16/03/2015</div></div>
            <div className="kpi"><div className="k-l">Regime</div><div className="k-v sm">Simples Nacional</div><div className="k-h">Anexo III · alíquota efetiva {pct(t.aliq)}</div></div>
            <div className="kpi warn"><div className="k-l">Ponto de atenção</div><div className="k-v sm">2 CNAEs de comércio</div><div className="k-h">Anexo I — revisar se ainda fazem sentido</div></div>
          </div>
          <div className="tblw"><div className="tscroll"><table>
            <thead><tr><th>CNAE</th><th>Atividade</th><th>Anexo</th><th>Tributação</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td className="mono">8211-3/00</td><td><b>Serviços de escritório e apoio administrativo</b><div className="sub">atividade principal</div></td><td><span className="pill p-info">Anexo III</span></td><td className="sub">serviço · 6% → efetiva {pct(t.aliq)}</td><td><span className="pill p-ok">principal</span></td></tr>
              <tr><td className="mono">6209-1/00</td><td><b>Suporte técnico e serviços de TI</b></td><td><span className="pill p-info">Anexo III</span></td><td className="sub">serviço · fator R aplicável</td><td><span className="pill p-ok">ativo</span></td></tr>
              <tr><td className="mono">8599-6/04</td><td><b>Treinamento profissional e gerencial</b></td><td><span className="pill p-info">Anexo III</span></td><td className="sub">serviço · início 6%</td><td><span className="pill p-ok">ativo</span></td></tr>
              <tr><td className="mono">4751-2/01</td><td><b>Comércio de equipamentos de informática</b></td><td><span className="pill p-pend">Anexo I</span></td><td className="sub">comércio · início 4%</td><td><span className="pill p-pend">revisar</span></td></tr>
              <tr><td className="mono">4742-3/00</td><td><b>Comércio de material elétrico</b></td><td><span className="pill p-pend">Anexo I</span></td><td className="sub">comércio · início 4%</td><td><span className="pill p-pend">revisar</span></td></tr>
            </tbody>
          </table></div></div>
          <div className="note" style={{ marginTop: 16 }}><b>O que o módulo vigia aqui.</b> Se uma nota sair sob um CNAE de comércio (Anexo I) sendo serviço (Anexo III), o imposto sai errado. E o <b>Fator R</b> (folha ≥ 28% da receita) pode manter seus serviços de TI no Anexo III em vez do V — o módulo calcula todo mês e avisa. <i>Sinaliza a oportunidade; o contador confirma.</i></div>
        </div>
      )}

      {/* ===================== INTELIGÊNCIA FISCAL ===================== */}
      {sec === "fiscal" && (
        <div className="cbody">
          <div className="eyebrow">O cérebro do módulo</div><h2 className="h-lg">Inteligência fiscal</h2>
          <p className="lead">Aqui o módulo faz o que o contador faz de melhor — e um pouco mais: mostra a tributação de cada nota, serviço e terceiro, e aponta toda manobra fiscal <b>legítima</b> para você pagar o imposto justo, nunca a mais.</p>
          <div className="sech"><h3>Oportunidades do mês</h3><span className="rt">manobras legítimas detectadas</span></div>
          <div className="grid g2">
            <div className="card bl-g"><div className="rowbetween"><b>💸 Distribuição de lucros isenta de IR</b><span className="pill p-ok">economia</span></div><div className="sub" style={{ marginTop: 7 }}>Retirar resultado como <b>distribuição de lucros</b> (isenta de IR) em vez de pró-labore (INSS 11% + IRRF até 27,5%). Com R$122k de resultado em 6 meses, há folga grande para distribuir sem imposto.</div></div>
            <div className="card bl-b"><div className="rowbetween"><b>⚖️ Fator R — manter Anexo III</b><span className="pill p-info">alíquota</span></div><div className="sub" style={{ marginTop: 7 }}>Se a folha (pró-labore + encargos) ficar ≥ 28% da receita, os serviços de TI ficam no <b>Anexo III</b> (mais barato) e não vão para o V. O módulo monitora folha/receita.</div></div>
            <div className="card bl-a"><div className="rowbetween"><b>🧾 Pró-labore no mínimo</b><span className="pill p-pend">INSS</span></div><div className="sub" style={{ marginTop: 7 }}>Fixar o pró-labore próximo ao piso reduz o INSS; o restante sai como lucro isento. Equilíbrio a calibrar com o Fator R.</div></div>
            <div className="card bl-b"><div className="rowbetween"><b>📊 Simples × Lucro Presumido</b><span className="pill p-info">simulação</span></div><div className="sub" style={{ marginTop: 7 }}>Conforme a receita cresce, o módulo compara o DAS com o Lucro Presumido e avisa o ponto em que migrar passa a valer a pena.</div></div>
          </div>
          <div className="sech"><h3>Tributação de cada coisa</h3><span className="rt">de cor e salteado</span></div>
          <div className="tblw"><div className="tscroll"><table>
            <thead><tr><th>Item</th><th>O que incide</th><th className="r">Carga aprox.</th><th>Observação do módulo</th></tr></thead>
            <tbody>
              <tr><td><b>NF de serviço (Anexo III)</b></td><td className="sub">DAS unificado + ISS embutido</td><td className="r mono">{pct(t.aliq)}</td><td className="sub">ISS já no DAS; retenção só se o tomador exigir</td></tr>
              <tr><td><b>NF de comércio (Anexo I)</b></td><td className="sub">DAS — início 4%</td><td className="r mono">~4%+</td><td className="sub">só se realmente vender produto; senão revisar o CNAE</td></tr>
              <tr><td><b>Pró-labore (sócio)</b></td><td className="sub">INSS 11% + IRRF</td><td className="r mono">11%+</td><td className="sub">declarado via DCTFWeb; recibo mensal no módulo</td></tr>
              <tr><td><b>Distribuição de lucros</b></td><td className="sub">nada — isento de IR</td><td className="r mono vpos">0%</td><td className="sub">precisa de resultado contábil que suporte (o DRE prova)</td></tr>
              <tr><td><b>Prestador MEI (Jhon)</b></td><td className="sub">nota do MEI — sem encargo p/ a Crasto</td><td className="r mono">0%</td><td className="sub">vigiar habitualidade/subordinação (risco de vínculo)</td></tr>
              <tr><td><b>Funcionário CLT (futuro)</b></td><td className="sub">INSS + FGTS 8% + 13º + férias + 1/3</td><td className="r mono">~40%+</td><td className="sub">gera eSocial/DCTFWeb — o módulo provisiona tudo</td></tr>
            </tbody>
          </table></div></div>
          <div className="note" style={{ marginTop: 16 }}><b>Como funciona o “abatimento”.</b> No Simples o imposto é sobre a <b>receita</b>, então não se “deduz despesa” como no Lucro Real — a economia vem de <b>escolher o anexo certo, usar o Fator R e transformar pró-labore tributado em lucro isento</b>. O módulo calcula essas alavancas todo mês. <i>É sinal de oportunidade, não conselho fechado — o contador com CRC valida antes de aplicar.</i></div>
        </div>
      )}

      {/* ===================== OBRIGAÇÕES ===================== */}
      {sec === "obrig" && (
        <div className="cbody">
          <div className="eyebrow">Compliance</div><h2 className="h-lg">Obrigações acessórias</h2>
          <p className="lead">Tudo o que o contador entrega ao governo hoje — com o que o módulo <b>automatiza</b> e o que ainda <b>exige a assinatura</b> de um CRC. É este mapa que mostra o que dá para internalizar.</p>
          <div className="tblw" style={{ marginTop: 18 }}><div className="tscroll"><table>
            <thead><tr><th>Obrigação</th><th>Frequência</th><th>Órgão</th><th>Quem faz na nova estrutura</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td><b>DAS-D · Simples</b><div className="sub">apuração e guia mensal</div></td><td>Mensal</td><td>Receita Federal</td><td><span className="pill p-ok">módulo · automático</span></td><td><span className="pill p-ok">pronto (Fase 1)</span></td></tr>
              <tr><td><b>Emissão de NFS-e</b><div className="sub">nota de serviço</div></td><td>Por venda</td><td>Prefeitura</td><td><span className="pill p-ok">módulo · API/manual</span></td><td><span className="pill p-pend">Fase 2</span></td></tr>
              <tr><td><b>DEFIS</b><div className="sub">declaração anual do Simples</div></td><td>Anual</td><td>Receita Federal</td><td><span className="pill p-info">módulo prepara · contador confere</span></td><td><span className="pill p-pend">Fase 3</span></td></tr>
              <tr><td><b>eSocial / DCTFWeb</b><div className="sub">pró-labore e folha CLT</div></td><td>Mensal</td><td>Governo Federal</td><td><span className="pill p-info">módulo prepara · contador assina</span></td><td><span className="pill p-pend">Fase 3</span></td></tr>
              <tr><td><b>Escrituração / ECD</b><div className="sub">livros — se exigível</div></td><td>Anual</td><td>SPED</td><td><span className="pill p-info">módulo gera · contador assina (CRC)</span></td><td><span className="pill p-pend">Fase 3</span></td></tr>
            </tbody>
          </table></div></div>
          <div className="note" style={{ marginTop: 16 }}><b>A regra que não muda.</b> A escrituração e as declarações oficiais têm responsabilidade legal de um contador com <b>CRC</b>. O módulo prepara 100% e entrega pronto; o contador <b>revisa e assina</b> — é a “contabilidade assistida”. O ganho não é só os R$ 197/mês: é <b>autonomia, visibilidade e velocidade</b>.</div>
        </div>
      )}

      {/* ===================== DOCUMENTOS ===================== */}
      {sec === "docs" && (() => {
        const countOf = (k: string) => docs.filter((d) => d.category === k).length;
        const sel = DOC_CATS.find((c) => c.k === docCat);
        const lista = docCat ? docs.filter((d) => d.category === docCat) : [];
        return (
          <div className="cbody">
            <div className="eyebrow">Arquivo</div><h2 className="h-lg">Documentos</h2>
            <p className="lead">O arquivo fiscal e trabalhista da empresa, organizado e sempre à mão — guias, recibos, notas, contratos, certidões e comprovantes. Clique numa categoria para ver, baixar ou anexar arquivos.</p>

            <div className="grid g4" style={{ marginTop: 18 }}>
              {DOC_CATS.map((c) => (
                <button key={c.k} className={"doccat" + (docCat === c.k ? " on" : "")} onClick={() => setDocCat(docCat === c.k ? null : c.k)}>
                  <div className="rowbetween"><b>{c.ic} {c.label}</b><span className="tag mono">{countOf(c.k)}</span></div>
                  <div className="sub" style={{ marginTop: 6 }}>{c.desc}</div>
                </button>
              ))}
            </div>

            {sel && (
              <div className="tblw" style={{ marginTop: 18 }}>
                <div className="dochead">
                  <div><b>{sel.ic} {sel.label}</b> <span className="sub">· {lista.length} arquivo(s)</span></div>
                  <label className={"btn pri" + (docBusy ? " off" : "")}>
                    {docBusy ? "Enviando…" : "＋ Anexar arquivo"}
                    <input type="file" multiple style={{ display: "none" }} disabled={docBusy} onChange={(e) => { uploadDocs(sel.k, e.target.files); e.target.value = ""; }} />
                  </label>
                </div>
                <label className={"drop docdrop" + (docBusy ? " off" : "")}>
                  📎 <b>Arraste ou clique para anexar</b> em “{sel.label}” · <span className="sub">PDF, imagem ou qualquer formato</span>
                  <input type="file" multiple style={{ display: "none" }} disabled={docBusy} onChange={(e) => { uploadDocs(sel.k, e.target.files); e.target.value = ""; }} />
                </label>
                {lista.length === 0 ? (
                  <div className="sub" style={{ padding: "18px 16px" }}>Nenhum documento nesta categoria ainda — anexe o primeiro acima.</div>
                ) : (
                  <div className="tscroll"><table>
                    <thead><tr><th>Arquivo</th><th>Competência</th><th className="r">Tamanho</th><th>Enviado</th><th className="r">Ações</th></tr></thead>
                    <tbody>
                      {lista.map((d) => (
                        <tr key={d.id}>
                          <td><button className="doclink" onClick={() => openDoc(d.storage_key)} title="Abrir / visualizar">📄 {d.name}</button></td>
                          <td className="mono sub">{d.competencia || "—"}</td>
                          <td className="r mono sub">{fmtSize(d.size)}</td>
                          <td className="mono sub">{ymd(d.uploaded_at).split("-").reverse().join("/")}</td>
                          <td className="r"><div className="docacts"><button className="btn sm" onClick={() => openDoc(d.storage_key)}>Ver / baixar</button><button className="btn sm danger" onClick={() => delDoc(d)}>Excluir</button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>
            )}
            {!sel && <div className="note" style={{ marginTop: 16 }}>Os arquivos ficam guardados com segurança (storage privado) e abrem por link temporário assinado. Anexe aqui as guias, recibos e certidões que o contador te manda — o objetivo é ter <b>tudo num lugar só</b>, sem depender do e-mail dele.</div>}
          </div>
        );
      })()}

      {/* ===================== FECHAMENTO & ASSINATURA ===================== */}
      {sec === "fecha" && (
        <div className="cbody">
          <div className="eyebrow">Fechamento</div><h2 className="h-lg">Fechar o mês & assinatura do contador</h2>
          <p className="lead">Quando o mês está conciliado, o módulo monta o pacote contábil e envia ao contador — que só precisa <b>revisar e assinar</b>. É o passo que troca “pagar para fazer” por “pagar só para assinar”.</p>
          <div className="grid g2" style={{ marginTop: 20 }}>
            <div className="card">
              <div className="rowbetween"><b>Checklist de ago/2026</b><span className="pill p-pend">3 de 5</span></div>
              <div style={{ marginTop: 6 }}>
                <div className="chk done"><div className="b">✓</div><div><div className="ct">Receitas conciliadas</div><div className="cd">Nubank + Itaú batidos com o extrato</div></div></div>
                <div className="chk done"><div className="b">✓</div><div><div className="ct">DRE do mês fechado</div><div className="cd">resultado {BRL(mesUltimo.resultado)} · margem {pct(mesUltimo.margem)}</div></div></div>
                <div className="chk done"><div className="b">✓</div><div><div className="ct">Notas fiscais emitidas</div><div className="cd">3 notas · R$ 17.376</div></div></div>
                <div className="chk"><div className="b" /><div><div className="ct">Guias geradas (DAS + INSS)</div><div className="cd">falta gerar a guia da NF #0044</div></div></div>
                <div className="chk"><div className="b" /><div><div className="ct">Recibo de pró-labore anexado</div><div className="cd">subir o recibo de agosto</div></div></div>
              </div>
            </div>
            <div className="card col">
              <b>Pacote para o contador</b>
              <div className="sub" style={{ marginTop: 6 }}>Um PDF com DRE, razão, guias, folha e notas do mês — pronto para o CRC conferir e assinar.</div>
              <div className="acct">
                <div className="flex"><div className="av gold">SL</div><div><b>São Lucas Contabilidade</b><div className="sub">contador responsável · CRC</div></div><span className="pill p-mute" style={{ marginLeft: "auto" }}>aguardando</span></div>
              </div>
              <div style={{ flex: 1 }} />
              <button className="btn pri full" onClick={() => alert("Mockup — na versão real, gera o pacote e envia ao contador para assinatura.")}>🔏 Gerar pacote & enviar para assinatura</button>
              <div className="sub center" style={{ marginTop: 10 }}>o contador revisa e devolve assinado — você acompanha o status aqui</div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NF — pop-up com iframe do portal oficial */}
      {nfOpen && (
        <div className="cmodal big" onClick={() => setNfOpen(false)}>
          <div className="m big" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div><div className="eyebrow">Emissão de nota fiscal</div><h3>Emitir NF-e — portal oficial</h3></div>
              <div className="flex" style={{ gap: 8 }}>
                <a className="btn" href={nfPortal} target="_blank" rel="noopener noreferrer">Abrir em nova aba ↗</a>
                <button className="x" onClick={() => setNfOpen(false)}>✕</button>
              </div>
            </div>
            <div className="seg wrap" style={{ marginTop: 12 }}>
              {PORTAIS.map((p) => <button key={p.k} className={nfPortal === p.url ? "on" : ""} onClick={() => setNfPortal(p.url)} title={p.desc}>{p.label}</button>)}
            </div>
            <div className="framewrap">
              <iframe key={nfPortal} src={nfPortal} title="Emissor oficial de nota fiscal" className="nfframe" referrerPolicy="no-referrer" />
              <div className="framehint">Faça login no portal e emita a nota aqui dentro. Se a área ficar em branco, o portal do governo bloqueou a exibição embutida (segurança) — use <b>“Abrir em nova aba”</b> acima. A emissão automática a partir daqui (API) entra na Fase 2.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ defaultOn }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return <button className={"switch" + (on ? " on" : "")} onClick={() => setOn(!on)} aria-label="Alternar" />;
}

const CSS = `
.contab{--navy:#0B1830;--navy2:#010E26;--b:var(--crasto-blue,#2E5BB0);--b2:var(--crasto-blue,#6E9CE8);--g:var(--fin-green,#16A34A);--gb:rgba(52,211,153,.14);--gi:var(--fin-green,#0F7A3D);--am:var(--fin-orange,#B4680C);--amb:rgba(224,128,31,.14);--rd:var(--fin-red,#DC2626);--rdb:rgba(220,38,38,.13);--gold:#B08420;--line:var(--crasto-border-soft,#EDEFF3);--line2:var(--crasto-border,#E4E7EC);--muted:var(--crasto-text-muted,#6B7280);--faint:var(--crasto-text-faint,#9AA3AF);--card:var(--crasto-surface,#fff);--card2:var(--crasto-surface-2,#F6F7F9);--hover:var(--crasto-surface-2,#F1F3F6);--txt:var(--crasto-text-primary,#0B1220);--info:rgba(110,156,232,.13);--shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);color:var(--txt)}
.contab .mono{font-variant-numeric:tabular-nums}
.csub{display:flex;gap:6px;overflow-x:auto;padding:4px 0 12px;margin-bottom:8px;border-bottom:1px solid var(--line)}
.csn{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid transparent;background:transparent;color:var(--muted);border-radius:9px;padding:8px 13px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.csn:hover{background:var(--hover);color:var(--txt)}
.csn.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.csn .i{font-size:13px}
.cbody{animation:cfade .22s ease}
@keyframes cfade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.cbody{animation:none}}
.contab .eyebrow{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;font-weight:700;color:var(--faint)}
.contab .h-xl{font-size:24px;font-weight:800;letter-spacing:-.01em;margin:6px 0 0}
.contab .h-lg{font-size:21px;font-weight:800;letter-spacing:-.01em;margin:6px 0 0}
.contab h3{font-size:16px;font-weight:800}
.contab .lead{color:var(--muted);font-size:13.5px;max-width:66ch;margin:8px 0 0;line-height:1.55}
.contab .grid{display:grid;gap:16px}
.contab .g4{grid-template-columns:repeat(4,1fr)}.contab .g3{grid-template-columns:repeat(3,1fr)}.contab .g2{grid-template-columns:repeat(2,1fr)}
.contab .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:17px 19px;box-shadow:var(--shadow)}
.contab .card.col{display:flex;flex-direction:column}
.contab .bl-g{border-left:3px solid var(--g)}.contab .bl-b{border-left:3px solid var(--b2)}.contab .bl-a{border-left:3px solid var(--am)}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow)}
.kpi .k-l{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--faint)}
.kpi .k-v{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:9px 0 4px}
.kpi .k-v.sm{font-size:18px}.kpi .k-v.xs{font-size:15px;line-height:1.25}
.kpi .k-h{font-size:11.5px;color:var(--muted)}
.kpi.warn .k-v{color:var(--am)}
.kpi.hero{background:linear-gradient(155deg,var(--navy),var(--navy2));border-color:transparent;color:#fff}
.kpi.hero .k-l{color:#93A8CE}.kpi.hero .k-h{color:#AFC0DE}.kpi.hero .k-v{color:#fff}
.sech{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:28px 0 13px}
.sech .rt{font-size:12px;color:var(--muted);font-weight:600}
.contab .lead+.grid,.contab .lead+.tblw{margin-top:18px}
.contab .sub{font-size:11.5px;color:var(--muted)}
.contab .mut{background:var(--card2)!important;color:var(--faint)!important}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.85}
.p-ok{background:var(--gb);color:var(--gi)}.p-pend{background:var(--amb);color:var(--am)}.p-late{background:var(--rdb);color:var(--rd)}.p-info{background:var(--info);color:var(--b)}.p-mute{background:var(--card2);color:var(--muted)}
.tag{font-size:11px;font-weight:600;color:var(--muted);background:var(--card2);border:1px solid var(--line);padding:3px 9px;border-radius:7px}
.tblw{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.tscroll{overflow-x:auto}
.contab table{width:100%;border-collapse:collapse}
.contab th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700;text-align:left;padding:12px 15px;border-bottom:1px solid var(--line2);white-space:nowrap}
.contab td{padding:12px 15px;border-top:1px solid var(--line);font-size:12.8px;white-space:nowrap}
.contab tr:first-child td{border-top:0}
.contab td.r,.contab th.r{text-align:right;font-variant-numeric:tabular-nums}
.contab td .sub{margin-top:2px}
.note{background:var(--info);border:1px solid var(--line2);border-left:3px solid var(--b2);border-radius:12px;padding:13px 15px;font-size:12.3px;line-height:1.55;color:var(--txt)}
.note b{color:var(--txt)}
.split{display:grid;grid-template-columns:1fr 1fr}
.split>div{padding:18px 20px}.split>div:first-child{border-right:1px solid var(--line)}
.ul{margin:0;padding-left:18px;font-size:13px;color:var(--muted);line-height:1.85}.ul b{color:var(--txt)}
.rowbetween{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.rowcenter{display:flex;align-items:center;gap:16px}
.flex{display:flex;align-items:center;gap:10px}
.av{width:30px;height:30px;border-radius:8px;background:var(--info);color:var(--b);display:grid;place-items:center;font-weight:800;font-size:12px;flex:0 0 auto}
.av.gold{background:var(--gold);color:#fff}.av.mut{background:var(--card2);color:var(--faint)}
.dre .lin{font-weight:600}.dre tr.rev td{font-weight:700}.dre tr.neg td{color:var(--muted)}.dre tr.neg.det .lin{font-weight:500}
.dre tr.sub2 td{background:var(--card2);font-weight:800;border-top:1px solid var(--line2)}
.dre tr.grp td{font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--faint);font-weight:700;padding-top:14px}
.dre tr.res td{font-size:13.5px;font-weight:800;border-top:2px solid var(--navy)}
.dre td.tot,.dre th.tot{background:var(--info);font-weight:800}
.vpos{color:var(--gi)}.vneg{color:var(--rd)}
.chk{display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-top:1px solid var(--line)}
.chk:first-child{border-top:0}
.chk .b{width:19px;height:19px;border-radius:6px;border:2px solid var(--line2);flex:0 0 auto;display:grid;place-items:center;font-size:12px;margin-top:1px;color:#fff}
.chk.done .b{background:var(--g);border-color:var(--g)}
.chk .ct{font-size:13px;font-weight:600}.chk .cd{font-size:11.5px;color:var(--muted)}
.bar{height:8px;border-radius:6px;background:var(--card2);overflow:hidden;margin-top:8px}
.bar>i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--b2),var(--b))}
.switch{position:relative;width:42px;height:24px;border-radius:20px;background:var(--line2);border:0;flex:0 0 auto;cursor:pointer;transition:.16s}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.16s;box-shadow:0 1px 2px rgba(0,0,0,.3)}
.switch.on{background:var(--g)}.switch.on::after{left:21px}
.drop{border:1.5px dashed var(--line2);border-radius:12px;padding:22px;text-align:center;color:var(--muted);font-size:12.5px;background:var(--card2)}.drop b{color:var(--txt)}
.seg{display:inline-flex;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:3px}
.seg button{border:0;background:transparent;padding:7px 13px;border-radius:7px;font:inherit;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer}
.seg button.on{background:var(--card);color:var(--txt);box-shadow:var(--shadow)}
.acct{margin:16px 0;padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--card2)}
.loadbox{padding:40px;text-align:center;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:14px;margin-top:16px}
.btn{border:1px solid var(--line2);background:var(--card);color:var(--txt);border-radius:10px;padding:8px 14px;font:inherit;font-size:12.5px;font-weight:600;box-shadow:var(--shadow);cursor:pointer;display:inline-flex;align-items:center;gap:7px}
.btn:hover{border-color:var(--b2)}
.btn.pri{background:linear-gradient(180deg,var(--b2),var(--b));color:#fff;border-color:transparent}
.btn.pri.full{width:100%;justify-content:center}
.center{text-align:center}
.cmodal{position:fixed;inset:0;background:rgba(6,12,26,.55);display:flex;align-items:center;justify-content:center;z-index:80;padding:20px}
.cmodal .m{background:var(--card);border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.35);max-width:560px;width:100%;max-height:88vh;overflow:auto;padding:24px}
.mh{display:flex;justify-content:space-between;align-items:flex-start}
.mh h3{font-size:17px}
.x{border:1px solid var(--line2);background:var(--card);border-radius:9px;width:32px;height:32px;color:var(--muted);cursor:pointer}
.field{margin-top:14px}
.field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--faint);display:block;margin-bottom:5px}
.inp{width:100%;border:1px solid var(--line2);background:var(--card2);border-radius:9px;padding:9px 12px;font:inherit;font-size:13px;color:var(--txt)}
.rowf{display:flex;gap:9px;align-items:center;margin-top:10px;font-size:12.5px;color:var(--muted)}
.linkgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}
.olink{display:flex;flex-direction:column;gap:1px;padding:12px 14px;border:1px solid var(--line);border-radius:11px;background:var(--card2);text-decoration:none;color:var(--txt);transition:.12s}
.olink:hover{border-color:var(--b2);background:var(--card)}
.olink b{font-size:13px}.olink span{font-size:11.5px;color:var(--muted)}.olink i{font-size:10.5px;color:var(--b);font-style:normal;margin-top:4px;font-weight:600}
.seg.wrap{flex-wrap:wrap}
.doccat{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px 17px;box-shadow:var(--shadow);cursor:pointer;font:inherit;color:var(--txt);transition:.12s}
.doccat:hover{border-color:var(--b2);transform:translateY(-1px)}
.doccat.on{border-color:var(--navy);box-shadow:0 0 0 1px var(--navy),var(--shadow)}
.doccat b{font-size:13.5px}
.dochead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line2);flex-wrap:wrap}
.docdrop{display:block;margin:14px 16px;cursor:pointer}
.docdrop.off,.btn.off{opacity:.6;pointer-events:none}
.doclink{border:0;background:transparent;color:var(--b);font:inherit;font-size:12.8px;font-weight:600;cursor:pointer;padding:0;text-align:left}
.doclink:hover{text-decoration:underline}
.docacts{display:inline-flex;gap:7px;justify-content:flex-end}
.btn.sm{padding:5px 11px;font-size:11.5px}
.btn.danger{color:var(--rd);border-color:var(--line2)}
.btn.danger:hover{border-color:var(--rd);background:var(--rdb)}
.cmodal.big{padding:14px}
.cmodal .m.big{max-width:1120px;width:100%;height:92vh;display:flex;flex-direction:column;padding:18px 18px 14px}
.framewrap{flex:1;display:flex;flex-direction:column;margin-top:12px;min-height:0}
.nfframe{flex:1;width:100%;border:1px solid var(--line2);border-radius:12px;background:#fff;min-height:0}
.framehint{font-size:11.3px;color:var(--muted);margin-top:8px;text-align:center;line-height:1.5}
@media(max-width:700px){.linkgrid{grid-template-columns:1fr}}
@media(max-width:1050px){.contab .g4{grid-template-columns:repeat(2,1fr)}.contab .g3,.contab .g2,.split{grid-template-columns:1fr}.split>div:first-child{border-right:0;border-bottom:1px solid var(--line)}}
@media(max-width:560px){.contab .g4{grid-template-columns:1fr}}
`;
