import { useEffect, useRef, useState } from "react";
import "../../styles/cockpit-charts.css";
import type { CockpitMine, AgentUsage } from "../../services/delivery.service";

// PAINEL DE KPIs do Cockpit. A COR de cada KPI é a SAÍDA de uma ANÁLISE em tempo real (não limiar
// fixo): olha valor + volume + tendência + benchmark e decide verde/amarelo/vermelho, com o PORQUÊ,
// o IMPACTO para o cliente e a AÇÃO recomendada (no hover do "i"). Vermelho = maior oportunidade de
// ganho, não "fracasso". Movimento premium: entrada em BLUR + subida, lenta e em cascata (GPU).

type Tom = "green" | "amber" | "red";
const COR: Record<Tom, string> = { green: "var(--sem-green)", amber: "var(--sem-amber)", red: "var(--sem-red)" };
type Diag = { tom: Tom; motivo: string; impacto: string; acao: string; ia?: boolean };
const rotulo = (t: Tom) => (t === "red" ? "Atenção" : t === "amber" ? "Observar" : "Saudável");

// ── MOTOR DE ANÁLISE (a "inteligência" por trás de cada cor) ──────────────────
function diagAutomacao(pct: number | null, ai: number, hum: number, t: (k: string, v?: any) => string): Diag {
  const total = ai + hum;
  if (pct == null || total < 20) return { tom: "amber", motivo: t("Volume ainda baixo no período — cedo para avaliar a automação."), impacto: t("Pouco impacto agora; o quadro fica claro conforme o volume cresce."), acao: t("Deixe a IA operar e reavalie com mais atendimentos.") };
  if (pct >= 40) return { tom: "green", motivo: t("A IA já resolve {p}% das respostas — automação saudável.", { p: pct }), impacto: t("Equipe focada no que importa e custo por atendimento menor."), acao: t("Mantenha e suba a régua ativando novos fluxos da IA.") };
  if (pct >= 15) return { tom: "amber", motivo: t("A IA resolve {p}% — há espaço para automatizar mais.", { p: pct }), impacto: t("Parte do volume que a IA poderia assumir ainda cai na equipe."), acao: t("Revise os gatilhos de transferência e a base de conhecimento.") };
  return { tom: "red", motivo: t("A IA respondeu só {p}% de {n} — subutilizada com volume alto.", { p: pct, n: total }), impacto: t("A equipe absorve ~{h} respostas que a IA poderia fazer: mais custo de folha, resposta mais lenta e uma IA que você paga ociosa.", { h: hum }), acao: t("Cheque auto-resposta ligada, prompt e handoffs — cada ponto de automação vira hora liberada.") };
}
function diagSla(pct5: number | null, mediana: number, t: (k: string, v?: any) => string): Diag {
  if (pct5 == null) return { tom: "amber", motivo: t("Ainda sem primeiras respostas medidas no período."), impacto: t("Sem base para avaliar velocidade agora."), acao: t("Assim que houver atendimentos, a medição começa.") };
  const med = mediana < 60 ? `${mediana}s` : `${Math.round(mediana / 60)}min`;
  if (pct5 >= 80) return { tom: "green", motivo: t("{p}% dos primeiros contatos respondidos em até 5min (mediana {m}).", { p: pct5, m: med }), impacto: t("Velocidade alta = mais conversão: lead quente é atendido na hora."), acao: t("Mantenha o padrão; é um diferencial competitivo.") };
  if (pct5 >= 50) return { tom: "amber", motivo: t("{p}% em até 5min — dá para ser mais rápido (mediana {m}).", { p: pct5, m: med }), impacto: t("Parte dos leads espera demais e esfria antes da 1ª resposta."), acao: t("Deixe a IA cobrir os horários/momentos em que a equipe demora.") };
  return { tom: "red", motivo: t("Só {p}% em até 5min (mediana {m}) — resposta lenta.", { p: pct5, m: med }), impacto: t("Lead que espera esfria: cada minuto de atraso derruba a conversão. É venda saindo pela porta."), acao: t("Ligue a IA para a 1ª resposta imediata e priorize a fila de espera.") };
}
function diagFunil(f: { leads: number; qualificados: number; oportunidades: number; vendas: number }, gargalo: string | null, t: (k: string, v?: any) => string): Diag {
  const conv = f.leads > 0 ? Math.round((f.vendas / f.leads) * 100) : 0;
  if (!f.leads) return { tom: "amber", motivo: t("Sem leads suficientes no período."), impacto: t("Sem base para avaliar a conversão."), acao: t("Aparece com o movimento de leads do CRM.") };
  if (gargalo) return { tom: "red", motivo: t("Maior perda em “{g}”.", { g: gargalo }), impacto: t("É onde mais oportunidade escapa — destravar essa etapa é o maior ganho de receita agora."), acao: t("Foque a IA e a equipe em “{g}”: follow-up, objeções e proposta.", { g: gargalo }) };
  if (conv >= 8) return { tom: "green", motivo: t("Conversão de {c}% dos leads em vendas — funil saudável.", { c: conv }), impacto: t("Boa eficiência comercial; o volume de topo puxa o resultado."), acao: t("Alimente o topo do funil para escalar as vendas.") };
  return { tom: "amber", motivo: t("Conversão de {c}% — há espaço para melhorar.", { c: conv }), impacto: t("Leads chegam, mas parte não avança até a venda."), acao: t("Reforce a qualificação e o follow-up nas etapas intermediárias.") };
}
function diagVolume(vals: number[], t: (k: string, v?: any) => string): Diag {
  if (vals.length < 2) return { tom: "green", motivo: t("Volume em acompanhamento."), impacto: t("Base para leitura de tendência."), acao: t("Acompanhe a evolução.") };
  const last = vals[vals.length - 1], prev = vals.slice(0, -1), avg = prev.reduce((s, v) => s + v, 0) / Math.max(1, prev.length);
  if (last >= avg) return { tom: "green", motivo: t("Movimento no período recente acima da média — demanda aquecida."), impacto: t("Mais oportunidades entrando; garanta capacidade de atendimento."), acao: t("Use a IA para absorver os picos sem perder tempo de resposta.") };
  if (last >= avg * 0.6) return { tom: "amber", motivo: t("Movimento recente abaixo da média."), impacto: t("Pode indicar sazonalidade ou queda na geração de demanda."), acao: t("Reative leads parados e revise as fontes de captação.") };
  return { tom: "red", motivo: t("Queda forte no movimento recente."), impacto: t("Menos demanda chegando agora — impacta o pipeline das próximas semanas."), acao: t("Acione campanhas/reengajamento; a IA pode resgatar leads frios.") };
}
function diagRoi(horas: number, t: (k: string, v?: any) => string): Diag {
  if (horas <= 0) return { tom: "amber", motivo: t("A IA ainda não acumulou horas de trabalho no período."), impacto: t("ROI aparece conforme a IA conduz atendimentos."), acao: t("Direcione mais fluxos para a IA.") };
  return { tom: "green", motivo: t("A IA já poupou {h}h da equipe no mês.", { h: horas }), impacto: t("São horas que viram capacidade (ou economia de folha) sem contratar."), acao: t("Quanto mais a IA assume, maior o retorno — expanda os casos de uso.") };
}
function diagPico(pico: number[][], t: (k: string, v?: any) => string): Diag {
  const dias = [t("segunda"), t("terça"), t("quarta"), t("quinta"), t("sexta"), t("sábado"), t("domingo")];
  let bd = 0, bb = 0, bv = 0;
  pico.forEach((row, d) => row.forEach((v, b) => { if (v > bv) { bv = v; bd = d; bb = b; } }));
  const faixa = `${bb * 3}h–${bb * 3 + 3}h`;
  return { tom: "green", motivo: t("O movimento se concentra na {d}, faixa {f}.", { d: dias[bd], f: faixa }), impacto: t("É quando entra mais gente — atraso nesse horário custa mais leads."), acao: t("Reforce IA/equipe no pico e use a IA para cobrir os horários de folga.") };
}
function diagAntesDepois(rows: { melhor: "menor" | "maior"; antes: number; depois: number }[], t: (k: string, v?: any) => string): Diag {
  const melhoraram = rows.filter((r) => (r.melhor === "menor" ? r.depois < r.antes : r.depois > r.antes)).length;
  const pioraram = rows.filter((r) => (r.melhor === "menor" ? r.depois > r.antes : r.depois < r.antes)).length;
  if (pioraram > melhoraram) return { tom: "red", motivo: t("A maioria das métricas está pior que o “antes”."), impacto: t("O resultado prometido não se sustentou — precisa de atenção."), acao: t("Revise o que mudou na operação e reative os fluxos da IA.") };
  if (pioraram > 0) return { tom: "amber", motivo: t("Evolução boa, com pontos a recuperar."), impacto: t("Ganho real, mas nem tudo melhorou."), acao: t("Foque nas métricas que ficaram para trás.") };
  return { tom: "green", motivo: t("Todas as métricas melhoraram desde a Crasto."), impacto: t("O investimento está se pagando em resultado mensurável."), acao: t("Registre o ganho e mire a próxima meta.") };
}

// ── animações ─────────────────────────────────────────────────────────────────
function useCountUp(target: number, on: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, on, ms]);
  return v;
}
function Reveal({ children, span, delay = 0 }: { children: any; span?: boolean; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setOn(true)), { threshold: 0.12 }); io.observe(el); return () => io.disconnect(); }, []);
  return <div ref={ref} className={"cc-reveal" + (span ? " cc-s2" : "") + (on ? " in" : "")} style={{ transitionDelay: `${delay}ms` }}>{typeof children === "function" ? children(on) : children}</div>;
}
function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// ── formatação ────────────────────────────────────────────────────────────────
function fmtVal(unidade: string, v: number | null): string {
  if (v == null) return "—";
  if (unidade === "s") { const s = Math.round(v); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(s % 3600 ? 1 : 0)}h`; }
  if (unidade === "%") return `${Math.round(v)}%`;
  if (unidade === "h") return `${Math.round(v)}h`;
  return `${Math.round(v)}`;
}
function deltaStr(melhor: "menor" | "maior", antes: number, depois: number): string {
  if (antes === 0) return depois > 0 ? "novo" : "";
  if (melhor === "menor") { const p = Math.round(((antes - depois) / antes) * 100); return `${p > 0 ? "−" : "+"}${Math.abs(p)}%`; }
  const ratio = depois / antes;
  if (ratio >= 2) return `${ratio % 1 ? ratio.toFixed(1) : ratio}×`;
  const p = Math.round(((depois - antes) / antes) * 100); return `${p >= 0 ? "+" : ""}${p}%`;
}
const semDelta = (melhor: "menor" | "maior", antes: number, depois: number): Tom => (antes === depois ? "amber" : (melhor === "menor" ? depois < antes : depois > antes) ? "green" : "red");

/* ── "i" com a análise (por quê · impacto · o que fazer) ──────────────────────── */
function CardInfo({ diag, t }: { diag: Diag; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cc-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={() => setOpen((v) => !v)}>
      <button className="cc-info-btn" style={{ borderColor: COR[diag.tom], color: COR[diag.tom] }} aria-label={t("Análise")}>i</button>
      {open && (
        <div className="cc-pop" role="tooltip">
          <div className="cc-pop-h"><span className="cc-pop-dot" style={{ background: COR[diag.tom] }} /><b style={{ color: COR[diag.tom] }}>{t(rotulo(diag.tom))}</b><span className={"cc-pop-tag" + (diag.ia ? " ia" : "")}>{diag.ia ? t("✦ análise da IA") : t("análise")}</span></div>
          <div className="cc-pop-l"><span>{t("Por quê")}</span>{diag.motivo}</div>
          <div className="cc-pop-l"><span>{t("Impacto")}</span>{diag.impacto}</div>
          <div className="cc-pop-l"><span>{t("O que fazer")}</span>{diag.acao}</div>
        </div>
      )}
    </div>
  );
}

/* ── Gauge ─────────────────────────────────────────────────────────────────── */
function Gauge({ label, pct, diag, sub, cap, on, t }: { label: string; pct: number | null; diag: Diag; sub?: string; cap?: string; on: boolean; t: (k: string) => string }) {
  const R = 54, C = 2 * Math.PI * R;
  const val = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const shown = useCountUp(val, on && pct != null);
  return (
    <div className="cc-card">
      <div className="cc-lbl">{label}</div><CardInfo diag={diag} t={t} />
      <div className="cc-gauge"><svg viewBox="0 0 132 132" aria-hidden>
        <circle cx="66" cy="66" r={R} className="cc-track" />
        <circle cx="66" cy="66" r={R} className="cc-arc" style={{ stroke: COR[diag.tom], strokeDasharray: C, strokeDashoffset: on && pct != null ? C * (1 - val / 100) : C }} />
      </svg>
        <div className="cc-gc">{pct == null ? <span className="cc-na">—</span> : <span className="cc-gn" style={{ color: COR[diag.tom] }}>{Math.round(shown)}<i>%</i></span>}<span className="cc-cap">{cap || ""}</span></div>
      </div>
      {sub && <div className="cc-sub">{sub}</div>}
    </div>
  );
}

/* ── Donut ─────────────────────────────────────────────────────────────────── */
function Donut({ label, parts, diag, on, t }: { label: string; parts: { name: string; val: number; tom: Tom }[]; diag: Diag; on: boolean; t: (k: string) => string }) {
  const R = 54, C = 2 * Math.PI * R, total = parts.reduce((s, p) => s + p.val, 0);
  const shown = useCountUp(total, on);
  let acc = 0;
  // Donut + estatísticas LADO A LADO (antes: aro pequeno perdido num card grande — o Crasto
  // apontou a desproporção). Agora o anel divide o espaço com os números por fatia, preenchendo.
  return (
    <div className="cc-card">
      <div className="cc-lbl">{label}</div><CardInfo diag={diag} t={t} />
      <div className="cc-donutwrap">
        <div className="cc-gauge cc-gauge--donut"><svg viewBox="0 0 132 132" aria-hidden>
          <circle cx="66" cy="66" r={R} className="cc-track" />
          {total > 0 && parts.map((p, i) => { const seg = C * (p.val / total), rot = (acc / total) * 360 - 90; acc += p.val; return <circle key={i} cx="66" cy="66" r={R} className="cc-arc cc-seg" style={{ stroke: COR[p.tom], strokeDasharray: `${on ? seg : 0} ${C}`, transform: `rotate(${rot}deg)`, transformOrigin: "66px 66px", transitionDelay: `${i * 160}ms` }} />; })}
        </svg>
          <div className="cc-gc"><span className="cc-gn cc-gn--sm">{Math.round(shown)}</span><span className="cc-cap">{t("respostas")}</span></div>
        </div>
        <div className="cc-donut-side">
          {parts.map((p, i) => (
            <div className="cc-donut-stat" key={i}>
              <span className="cc-dot" style={{ background: COR[p.tom] }} />
              <span className="cc-donut-nm">{p.name}</span>
              <span className="cc-donut-r"><b>{p.val}</b> <i>{total > 0 ? Math.round((p.val / total) * 100) : 0}%</i></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Área suave ───────────────────────────────────────────────────────────────── */
function Area({ label, unit, data, diag, on, t }: { label: string; unit: string; data: { label: string; n: number }[]; diag: Diag; on: boolean; t: (k: string) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360, H = 150, PT = 14, PB = 22, PL = 8, PR = 8;
  const d = data.length ? data : [{ label: "", n: 0 }];
  const max = Math.max(1, ...d.map((p) => p.n));
  const X = (i: number) => PL + (i * (W - PL - PR)) / Math.max(1, d.length - 1);
  const Y = (n: number) => PT + (1 - n / max) * (H - PT - PB);
  const line = smooth(d.map((p, i) => ({ x: X(i), y: Y(p.n) })));
  const fill = `${line} L${X(d.length - 1).toFixed(1)},${H - PB} L${X(0).toFixed(1)},${H - PB} Z`;
  const total = d.reduce((s, p) => s + p.n, 0);
  const shown = useCountUp(total, on);
  const gid = "ccg-" + diag.tom;
  return (
    <div className="cc-card">
      <div className="cc-head"><div className="cc-lbl">{label}</div><div className="cc-bign" style={{ color: COR[diag.tom] }}>{Math.round(shown)}<small>{unit}</small></div></div><CardInfo diag={diag} t={t} />
      <div className="cc-areawrap">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="cc-area">
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COR[diag.tom]} stopOpacity="0.26" /><stop offset="100%" stopColor={COR[diag.tom]} stopOpacity="0" /></linearGradient></defs>
          {[0.33, 0.66].map((g) => <line key={g} x1={PL} x2={W - PR} y1={PT + g * (H - PT - PB)} y2={PT + g * (H - PT - PB)} className="cc-gridln" />)}
          <path d={fill} fill={`url(#${gid})`} className={"cc-afill" + (on ? " in" : "")} />
          <path d={line} stroke={COR[diag.tom]} className={"cc-aline" + (on ? " in" : "")} fill="none" />
          {hover != null && <line x1={X(hover)} x2={X(hover)} y1={PT} y2={H - PB} className="cc-guide" style={{ opacity: 0.6 }} />}
          {hover != null && <circle cx={X(hover)} cy={Y(d[hover].n)} r={4.5} fill={COR[diag.tom]} />}
          {d.map((_, i) => <rect key={i} x={X(i) - (W - PL - PR) / Math.max(1, d.length - 1) / 2} y={0} width={(W - PL - PR) / Math.max(1, d.length - 1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />)}
        </svg>
        {hover != null && <div className="cc-tip on" style={{ transform: `translateX(${(X(hover) / W) * 100}%) translateX(-50%)` }}><b>{d[hover].n}</b><span>{d[hover].label}</span></div>}
      </div>
    </div>
  );
}

/* ── Antes × Depois (herói) ──────────────────────────────────────────────────── */
function AntesDepois({ rows, diag, on, t }: { rows: { label: string; unidade: string; melhor: "menor" | "maior"; antes: number; depois: number }[]; diag: Diag; on: boolean; t: (k: string) => string }) {
  return (
    <div className="cc-card cc-hero">
      <div className="cc-head"><div className="cc-lbl">{t("Antes × Depois da Crasto")}</div><div className="cc-hero-tag">{t("o que mudou")}</div></div><CardInfo diag={diag} t={t} />
      <div className="cc-ba">
        {rows.map((r, i) => {
          const mx = Math.max(r.antes, r.depois, 1);
          const tom = semDelta(r.melhor, r.antes, r.depois);
          return (
            <div className="cc-ba-row" key={i}>
              <div className="cc-ba-lab">{r.label}</div>
              <div className="cc-ba-bars">
                <div className="cc-ba-bar" style={{ width: on ? `${(r.antes / mx) * 100}%` : 0, transitionDelay: `${180 + i * 90}ms` }}><span>{fmtVal(r.unidade, r.antes)}</span></div>
                <div className="cc-ba-bar depois" style={{ width: on ? `${(r.depois / mx) * 100}%` : 0, transitionDelay: `${260 + i * 90}ms` }}><span>{fmtVal(r.unidade, r.depois)}</span></div>
              </div>
              <div className="cc-ba-up" style={{ color: COR[tom] }}>{deltaStr(r.melhor, r.antes, r.depois)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Funil ───────────────────────────────────────────────────────────────────── */
function Funil({ funil, diag, gargaloIdx, on, t }: { funil: { leads: number; qualificados: number; oportunidades: number; vendas: number }; diag: Diag; gargaloIdx: number; on: boolean; t: (k: string) => string }) {
  const rows = [{ l: t("Leads"), n: funil.leads }, { l: t("Qualificados"), n: funil.qualificados }, { l: t("Oportunidades"), n: funil.oportunidades }, { l: t("Vendas"), n: funil.vendas }];
  const mx = Math.max(1, rows[0].n);
  return (
    <div className="cc-card">
      <div className="cc-lbl">{t("Funil de conversão")}</div><CardInfo diag={diag} t={t} />
      <div className="cc-fn">
        {rows.map((r, i) => {
          const gargalo = i === gargaloIdx;
          const pct = mx > 0 ? Math.round((r.n / mx) * 100) : 0;
          // Rótulo FORA da barra (coluna própria): antes ele ia DENTRO da barra e, quando a etapa
          // era pequena, a barra encolhia (~14%) e o texto ficava cortado/apagado — ilegível.
          return (
            <div className={"cc-fn-row" + (gargalo ? " garg" : "")} key={i}>
              <div className="cc-fn-lab">{r.l}</div>
              <div className="cc-fn-track">
                <div className="cc-fn-fill" style={{ width: on ? `${Math.max(4, (r.n / mx) * 100)}%` : 0, transitionDelay: `${180 + i * 110}ms`, background: gargalo ? "linear-gradient(90deg,var(--sem-amber),var(--sem-red))" : undefined }} />
              </div>
              <div className="cc-fn-n">{r.n} · {pct}%{gargalo && <span className="cc-gargalo"> {t("gargalo")}</span>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── ROI ─────────────────────────────────────────────────────────────────────── */
function Roi({ horasIa, horasEquipe, diag, on, t }: { horasIa: number; horasEquipe: number | null; diag: Diag; on: boolean; t: (k: string) => string }) {
  const shown = useCountUp(horasIa, on);
  const totalHrs = horasIa + (horasEquipe || 0);
  const pctIa = totalHrs > 0 ? Math.round((horasIa / totalHrs) * 100) : 0;
  const money = Math.round(horasIa * 20);
  // KPIs de DONO no espaço que sobrava (pedido do Crasto): projeção anual da economia (no ritmo
  // atual) e capacidade liberada em dias de trabalho — ambos derivados de horasIa (nada inventado).
  const anual = money * 12;
  const dias = Math.round((horasIa / 8) * 10) / 10; // 8h = 1 dia útil
  return (
    <div className="cc-card">
      <div className="cc-lbl">{t("Horas economizadas (ROI)")}</div><CardInfo diag={diag} t={t} />
      <div className="cc-roi">
        <div className="cc-money" style={{ color: "var(--sem-green)" }}>{Math.round(shown)}<b>h</b><small>≈ R$ {money.toLocaleString("pt-BR")} {t("em folha/mês")}</small></div>
        <div className="cc-roibar"><i style={{ width: on ? `${pctIa}%` : 0, background: "var(--sem-green)" }} /><i style={{ width: on ? `${100 - pctIa}%` : 0, background: "var(--sem-amber)" }} /></div>
        <div className="cc-roil"><span>{t("IA")}: <b>{horasIa}h</b></span>{horasEquipe != null && <span>{t("Equipe")}: <b>{horasEquipe}h</b></span>}</div>
        <div className="cc-roi-extra">
          <div className="cc-roi-x">
            <span className="cc-roi-xl">{t("Projeção no ano")}</span>
            <b className="cc-roi-xv">R$ {anual.toLocaleString("pt-BR")}</b>
            <span className="cc-roi-xs">{t("no ritmo atual")}</span>
          </div>
          <div className="cc-roi-x">
            <span className="cc-roi-xl">{t("Capacidade liberada")}</span>
            <b className="cc-roi-xv">{dias} {dias === 1 ? t("dia") : t("dias")}</b>
            <span className="cc-roi-xs">{t("de trabalho/mês")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pico de atendimento (dois gráficos de barras: por horário e por dia) ──────── */
// Antes era um heatmap (grade dia×faixa) SEM rótulos de hora → o dono não conseguia ler QUANDO
// era o pico. Agora o mesmo dado (pico[dia][faixa de 3h], normalizado 0-1) vira dois gráficos de
// barras LEGÍVEIS: "Por horário do dia" (soma por faixa) e "Por dia da semana" (soma por dia),
// com o pico destacado em verde. Mostra exatamente o horário e o dia, que é o que importa.
function Pico({ pico, diag, on, t }: { pico: number[][]; diag: Diag; on: boolean; t: (k: string) => string }) {
  const dias = [t("Seg"), t("Ter"), t("Qua"), t("Qui"), t("Sex"), t("Sáb"), t("Dom")];
  const nb = pico[0]?.length || 8;
  const horas = Array.from({ length: nb }, (_, b) => `${b * 3}h`);
  const porHora = Array.from({ length: nb }, (_, b) => pico.reduce((s, row) => s + (row[b] || 0), 0));
  const porDia = pico.map((row) => row.reduce((s, v) => s + v, 0));
  const maxH = Math.max(...porHora, 1e-6), maxD = Math.max(...porDia, 1e-6);
  const pkH = porHora.indexOf(Math.max(...porHora)), pkD = porDia.indexOf(Math.max(...porDia));
  const barras = (vals: number[], max: number, labels: string[], peak: number, title: (i: number) => string) => (
    <div className="cc-pk-bars">
      {vals.map((v, i) => (
        <div className="cc-pk-col" key={i} title={title(i)}>
          <div className="cc-pk-track">
            <i className={"cc-pk-fill" + (i === peak && v > 0 ? " pk" : "")} style={{ height: on ? `${v > 0 ? Math.max(8, Math.round((v / max) * 100)) : 0}%` : "0%", transitionDelay: `${i * 45}ms` }} />
          </div>
          <span className={"cc-pk-lb" + (i === peak && v > 0 ? " pk" : "")}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="cc-card">
      <div className="cc-lbl">{t("Pico de atendimento")}</div><CardInfo diag={diag} t={t} />
      <div className={"cc-pk" + (on ? " in" : "")}>
        <div className="cc-pk-sub">{t("Por horário do dia")}</div>
        {barras(porHora, maxH, horas, pkH, (i) => `${i * 3}h–${i * 3 + 3}h`)}
        <div className="cc-pk-sub">{t("Por dia da semana")}</div>
        {barras(porDia, maxD, dias, pkD, (i) => dias[i])}
      </div>
    </div>
  );
}

/* ── Placeholder honesto ─────────────────────────────────────────────────────── */
function EmptyCard({ label, msg, t }: { label: string; msg: string; t: (k: string) => string }) {
  const diag: Diag = { tom: "amber", motivo: t("Ainda não há dados neste indicador."), impacto: t("A análise da IA aparece automaticamente assim que houver movimento aqui."), acao: t("Nada a fazer agora — o card se preenche sozinho.") };
  return <div className="cc-card cc-empty"><div className="cc-lbl">{label}</div><CardInfo diag={diag} t={t} /><div className="cc-empty-b"><span className="cc-empty-ic">⏳</span><span>{msg}</span></div></div>;
}

export default function CockpitCharts({ cock, agent, t }: { cock: CockpitMine | null; agent: AgentUsage | null; t: (k: string, v?: any) => string }) {
  const vol = cock?.volume || [];
  const temVol = vol.some((v) => v.n > 0);
  const auto = agent?.hasData ? agent?.automationPct ?? null : null;
  const ai = agent?.aiMessages ?? 0, hum = agent?.humanMessages ?? 0;
  const respostas = ai + hum;
  const k = cock?.kpis || null;
  const baRows = (cock?.metrics || [])
    .filter((m) => m.antes != null && m.depois != null && typeof m.depois === "number" && !(m as any).texto)
    .map((m) => ({ label: m.label, unidade: m.unidade, melhor: m.melhor, antes: Number(m.antes), depois: Number(m.depois) }));

  const temFunil = !!k?.funil && k.funil.leads > 0;
  const temSla = !!k?.sla && k.sla.pct5 != null;
  const temRoi = k?.roi_horas_ia != null && k.roi_horas_ia > 0;
  const temPico = !!k?.pico && k.pico.some((r) => r.some((v) => v > 0));

  if (!cock?.fontes?.crm && auto == null && !temVol && !respostas) return null;

  // A ANÁLISE de cada card vem da IA (DeepSeek) quando disponível; senão, o motor determinístico
  // entra como rede de segurança (nunca fica em branco). dg() escolhe a fonte por KPI.
  const IA = k?.analises || null;
  const dg = (key: string, fb: Diag): Diag => {
    const a = IA?.[key];
    return a && a.motivo ? { tom: a.tom, motivo: a.motivo, impacto: a.impacto, acao: a.acao, ia: true } : fb;
  };

  // gargalo do funil (maior queda relativa entre etapas)
  let gargaloIdx = -1; let gargaloNome: string | null = null;
  if (temFunil) {
    const arr = [k!.funil!.leads, k!.funil!.qualificados, k!.funil!.oportunidades, k!.funil!.vendas];
    const nomes = [t("Leads"), t("Qualificados"), t("Oportunidades"), t("Vendas")];
    let worst = 0;
    for (let i = 1; i < arr.length; i++) { const prev = arr[i - 1]; if (prev > 0) { const drop = 1 - arr[i] / prev; if (drop > worst && drop >= 0.6) { worst = drop; gargaloIdx = i; gargaloNome = nomes[i]; } } }
  }
  const D = (i: number) => i * 190; // cascata longa e lenta

  return (
    <div className="cockcharts">
      <div className="cc-sechead"><span className="cc-sedot" /> {t("Painel de KPIs")} <small>{t("análise ao vivo · em tempo real")}</small></div>
      <div className="cc-grid">
        <Reveal span delay={D(0)}>{(on: boolean) => baRows.length ? <AntesDepois rows={baRows} diag={dg("antesdepois", diagAntesDepois(baRows, t))} on={on} t={t} /> : <EmptyCard label={t("Antes × Depois da Crasto")} msg={t("Assim que registrarmos o seu “antes” (baseline), o comparativo aparece aqui.")} t={t} />}</Reveal>
        <Reveal delay={D(1)}>{(on: boolean) => <Gauge label={t("Automação da IA")} pct={auto} diag={dg("automacao", diagAutomacao(auto, ai, hum, t))} cap={t("automação")} sub={respostas > 0 ? t("{ia} pela IA · {h} pela equipe", { ia: ai, h: hum }) : t("sem respostas ainda")} on={on} t={t} />}</Reveal>
        <Reveal delay={D(2)}>{(on: boolean) => temVol ? <Area label={t("Volume de atendimentos")} unit={t("interações")} data={vol} diag={dg("volume", diagVolume(vol.map((v) => v.n), t))} on={on} t={t} /> : <EmptyCard label={t("Volume de atendimentos")} msg={t("Sem interações no período ainda.")} t={t} />}</Reveal>
        <Reveal delay={D(3)}>{(on: boolean) => temFunil ? <Funil funil={k!.funil!} diag={dg("funil", diagFunil(k!.funil!, gargaloNome, t))} gargaloIdx={gargaloIdx} on={on} t={t} /> : <EmptyCard label={t("Funil de conversão")} msg={t("Aparece com os leads e vendas do seu CRM.")} t={t} />}</Reveal>
        <Reveal delay={D(4)}>{(on: boolean) => temSla ? <Gauge label={t("SLA · 1ª resposta ≤ 5min")} pct={k!.sla!.pct5} diag={dg("sla", diagSla(k!.sla!.pct5, k!.sla!.mediana_s, t))} cap={t("no SLA")} sub={t("{n} de {tot} no prazo", { n: k!.sla!.respondidas - k!.sla!.sem_resposta, tot: k!.sla!.respondidas })} on={on} t={t} /> : <EmptyCard label={t("SLA · 1ª resposta ≤ 5min")} msg={t("Aparece quando houver primeiras respostas medidas.")} t={t} />}</Reveal>
        <Reveal delay={D(5)}>{(on: boolean) => temRoi ? <Roi horasIa={k!.roi_horas_ia!} horasEquipe={k!.horas_equipe_mes ?? null} diag={dg("roi", diagRoi(k!.roi_horas_ia!, t))} on={on} t={t} /> : <EmptyCard label={t("Horas economizadas (ROI)")} msg={t("Aparece com o volume conduzido pela IA.")} t={t} />}</Reveal>
        <Reveal delay={D(6)}>{(on: boolean) => respostas > 0 ? <Donut label={t("Respostas: IA × equipe")} parts={[{ name: t("IA"), val: ai, tom: "green" }, { name: t("Equipe"), val: hum, tom: "amber" }]} diag={dg("automacao", diagAutomacao(auto, ai, hum, t))} on={on} t={t} /> : <EmptyCard label={t("Respostas: IA × equipe")} msg={t("Sem respostas no período ainda.")} t={t} />}</Reveal>
        <Reveal delay={D(7)}>{(on: boolean) => temPico ? <Pico pico={k!.pico!} diag={dg("pico", diagPico(k!.pico!, t))} on={on} t={t} /> : <EmptyCard label={t("Pico de atendimento")} msg={t("Aparece com o histórico de mensagens.")} t={t} />}</Reveal>
      </div>
    </div>
  );
}
