import { useState } from "react";
import { UserPlus, Clock, SlidersHorizontal, Bot, Activity, DollarSign, ShieldCheck, ArrowRight, Search, ChevronDown, X, ArrowUp, ArrowDown, Check } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, useAsync, money, initials, Field } from "../../ui/ui";
import { fetchClients, healthScore, timeAgo, modShort, type Client } from "../../lib/adminData";
import { STAGES } from "../../lib/countries";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import type { CrmAgent } from "../../services/crmAccess.service";

// farol operacional do agente (SPEC 3.1 — coluna "Agente (IA)")
const AGENT_FAROL: Record<string, { label: string; tone: "ok" | "warn" | "crit" | "mute" }> = {
  green: { label: "no ar", tone: "ok" }, amber: { label: "no ar · alerta", tone: "warn" },
  red: { label: "fora do ar", tone: "crit" }, gray: { label: "pausado", tone: "mute" }, none: { label: "sem agente", tone: "mute" },
};
const opsHealthLabel = (s?: string) => (s === "ok" ? "Operacional" : s === "attention" ? "Atenção" : s === "crit" ? "Crítico" : "—");

type W = { onboarding: number; technical: number; engagement: number; financial: number; support: number };
type Cfg = { new_client_days: number; attention_threshold: number; risk_threshold: number; weights_new: W; weights_established: W };
const WK: (keyof W)[] = ["engagement", "financial", "technical", "support", "onboarding"];
const WLABEL: Record<keyof W, string> = { engagement: "Engajamento (uso/login)", financial: "Financeiro (faturas)", technical: "Saúde técnica (farol)", support: "Suporte (chamados)", onboarding: "Implantação" };

export default function VisaoGeral() {
  const t = useT();
  const navigate = useNavigate();
  const { data, loading, reload } = useAsync(async () => {
    const [clients, ov, agentsOv, receber] = await Promise.all([
      fetchClients(),
      services.analytics.admin.consoleOverview().catch(() => null),
      services.crmAccess.agentsOverview().catch(() => ({})), // federado do wacrm (agente REAL)
      services.finance.accounts.list("receivable").catch(() => [] as any[]), // contas a receber (dado real)
    ]);
    return { clients: clients ?? [], ov: ov as any, agentsOv: agentsOv as Record<string, { agentes: number; no_ar: number; farol: string }>, receber: (receber ?? []) as any[] };
  }, []);
  const clients = data?.clients ?? [];
  const ov = data?.ov ?? null;
  const ops = ov?.ops ?? null;
  // Agente por org vem do wacrm (federado). Se a chamada falhou, `agByOrg` é {} → a coluna
  // mostra "—" (dado indisponível), nunca "sem agente" mentiroso.
  const agByOrg = data?.agentsOv ?? {};
  const modules = clients.reduce((s, c) => s + (c.modules?.length ?? 0), 0);
  const risk = clients.filter((c) => healthScore(c).tone === "crit").length;

  // FINANCEIRO REAL (contas a receber). MRR = valor RECORRENTE por mês de cada contrato:
  //  • conta parcelada → o valor da parcela (é a mensalidade; ex.: Connect 12× R$1.500 → R$1.500);
  //  • conta com recorrência mensal/anual sem parcelas → o valor (anual ÷ 12);
  //  • conta pontual (sem parcela, sem recorrência) → não é recorrente → não entra.
  // Recebíveis = tudo que ainda está EM ABERTO (total − já pago). Nada fictício: se não há
  // contas, os dois somam 0 e é a verdade.
  const receber = (data?.receber ?? []).filter((a: any) => a.status !== "cancelled");
  const mensalDe = (a: any) => {
    const p = Array.isArray(a?.payment_schedule) ? a.payment_schedule : [];
    if (p.length) return Number(p[0]?.amount || 0);
    if (a.recurrence === "monthly" || a.recurrence === "mensal") return Number(a.amount || 0);
    if (a.recurrence === "yearly" || a.recurrence === "anual") return Number(a.amount || 0) / 12;
    return 0;
  };
  const mrr = receber.reduce((s: number, a: any) => s + mensalDe(a), 0);
  const aReceber = receber.reduce((s: number, a: any) => s + (Number(a.amount || 0) - Number(a.amount_paid || 0)), 0);

  // ── Tabela em ESCALA — arquitetura de filtros (pesquisa dos subagentes): UM estado como fonte
  // da verdade, com dois pontos de entrada (categoria no topo + filtro por coluna nos cabeçalhos)
  // e uma linha de "filtros ativos" que espelha o estado. Filtro client-side (lista pequena).
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("todos");              // categoria: prospecto/lead/oportunidade/cliente
  const [sortKey, setSortKey] = useState<"health" | "acesso" | "nome" | "mrr" | "mods">("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");     // health asc = pior primeiro (triagem)
  const [colF, setColF] = useState<{ health: string[]; agent: string[]; acesso: string[] }>({ health: [], agent: [], acesso: [] });
  const [menu, setMenu] = useState<string | null>(null);            // qual popover de coluna está aberto
  const query = q.trim().toLowerCase();
  const ageMs = (c: Client) => (c.last_access ? Date.now() - new Date(c.last_access).getTime() : Infinity);

  // Buckets por coluna (id, rótulo, teste). Dependem de agByOrg → definidos aqui dentro.
  type Bkt = { id: string; label: string; test: (c: Client) => boolean };
  const BUCKETS: Record<"health" | "agent" | "acesso", Bkt[]> = {
    health: [
      { id: "risco", label: t("Em risco"), test: (c) => healthScore(c).tone === "crit" },
      { id: "atencao", label: t("Atenção"), test: (c) => healthScore(c).tone === "warn" },
      { id: "saudavel", label: t("Saudável"), test: (c) => healthScore(c).tone === "ok" },
    ],
    agent: [
      { id: "no_ar", label: t("No ar"), test: (c) => (agByOrg[c.id]?.no_ar ?? 0) > 0 },
      { id: "pausado", label: t("Pausado"), test: (c) => (agByOrg[c.id]?.agentes ?? 0) > 0 && (agByOrg[c.id]?.no_ar ?? 0) === 0 },
      { id: "sem", label: t("Sem agente"), test: (c) => (agByOrg[c.id]?.agentes ?? 0) === 0 },
    ],
    acesso: [
      { id: "ativo", label: t("Ativo (7d)"), test: (c) => ageMs(c) < 7 * 86400000 },
      { id: "dormente", label: t("Dormente 30d+"), test: (c) => ageMs(c) > 30 * 86400000 },
      { id: "nunca", label: t("Nunca acessou"), test: (c) => !c.last_access },
    ],
  };
  const passCol = (col: "health" | "agent" | "acesso", c: Client) =>
    colF[col].length === 0 || BUCKETS[col].some((b) => colF[col].includes(b.id) && b.test(c));
  const toggleBucket = (col: "health" | "agent" | "acesso", id: string) =>
    setColF((s) => ({ ...s, [col]: s[col].includes(id) ? s[col].filter((x) => x !== id) : [...s[col], id] }));

  const stageCount = (k: string) => clients.filter((c) => k === "todos" || c.stage === k).length;
  const lista = clients
    .filter((c) => !query || `${c.name} ${c.email || ""}`.toLowerCase().includes(query))
    .filter((c) => stage === "todos" || c.stage === stage)
    .filter((c) => passCol("health", c) && passCol("agent", c) && passCol("acesso", c))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "nome") return a.name.localeCompare(b.name, "pt-BR") * dir;
      if (sortKey === "mrr") return (Number(a.mrr || 0) - Number(b.mrr || 0)) * dir;
      if (sortKey === "mods") return ((a.modules?.length || 0) - (b.modules?.length || 0)) * dir;
      if (sortKey === "acesso") { const av = a.last_access ? new Date(a.last_access).getTime() : 0; const bv = b.last_access ? new Date(b.last_access).getTime() : 0; return (av - bv) * dir; }
      return (healthScore(a).score - healthScore(b).score) * dir; // health asc = pior primeiro
    });

  // Chips de filtros ATIVOS (espelham o estado; cada um removível). Categoria + filtros de coluna.
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(stage !== "todos" ? [{ key: "stage", label: `${t("Categoria")}: ${t(STAGES.find((s) => s.key === stage)?.label || stage)}`, clear: () => setStage("todos") }] : []),
    ...(["health", "agent", "acesso"] as const).flatMap((col) =>
      colF[col].map((id) => ({ key: `${col}:${id}`, label: BUCKETS[col].find((b) => b.id === id)?.label || id, clear: () => toggleBucket(col, id) }))),
  ];
  const clearAll = () => { setStage("todos"); setColF({ health: [], agent: [], acesso: [] }); };

  // ESCOLHER O CRM: cada agente do cliente tem o SEU CRM. Abrimos a popup com os agentes
  // (mesma lógica do Console do wacrm) — o admin escolhe qual visualizar. Sem escolher um
  // agente = "empresa inteira" (vê todos os agentes da org).
  const [escolher, setEscolher] = useState<{ org: string; nome: string } | null>(null);
  const [agentes, setAgentes] = useState<CrmAgent[] | null>(null);
  const [crmUrl, setCrmUrl] = useState("");
  const [escErr, setEscErr] = useState("");

  async function enterCrm(c: any) {
    setEscolher({ org: c.id, nome: c.name }); setAgentes(null); setEscErr("");
    try {
      const ov = await services.crmAccess.overview(c.id);
      setAgentes(ov.agents || []);
      setCrmUrl(ov.crm_url || "");
      if (ov.crm_error) setEscErr(ov.crm_error);
    } catch (e) { setEscErr(errorMessage(e)); setAgentes([]); }
  }

  // Entra no CRM daquele agente (ou na org inteira). Somos admin do Portal → entramos na
  // VISUALIZAÇÃO do cliente, não na tela de login. Como o CRM é outra origem (sessão por
  // origem), pedimos ao Portal um OTP de uso único (magiclink do próprio admin) e mandamos
  // na URL SÓ o OTP + o escopo (org/agente). Nunca o bearer — respeita a decisão de 15/07;
  // o CRM troca o OTP por sessão na origem dele (/entrar). Quem autoriza é o is_admin do JWT.
  const [entrando, setEntrando] = useState(false);
  async function abrirCrm(agent?: CrmAgent) {
    if (!escolher || entrando) return;
    const base = crmUrl || "";
    if (!base) { setEscErr(t("CRM ainda não configurado (CRM_WEB_URL).")); return; }
    setEntrando(true); setEscErr("");
    try { await services.analytics.admin.auditRecord({ action: "impersonate_attempt", target_type: agent ? "agent" : "org", target_id: agent?.id || escolher.org, organization_id: escolher.org, context: { via: "portal_dashboard", agent: agent?.name ?? null } }); } catch { /* best-effort */ }
    try {
      const { token, type } = await services.crmAccess.enter();
      const u = new URL(base);
      u.pathname = "/entrar";
      u.searchParams.set("token", token);
      u.searchParams.set("type", type || "magiclink");
      u.searchParams.set("imp_org", escolher.org);
      u.searchParams.set("imp_org_nome", escolher.nome);
      if (agent) { u.searchParams.set("imp_agent", agent.id); u.searchParams.set("imp_agent_nome", agent.name); }
      window.location.href = u.toString();
    } catch (e) { setEscErr(errorMessage(e)); setEntrando(false); }
  }

  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");

  async function openCfg() {
    setErr(""); setOpen(true); setCfg(null);
    try { setCfg((await services.analytics.admin.healthConfig()) as Cfg); }
    catch (e) { setErr(errorMessage(e)); }
  }
  const sum = (w?: W) => w ? WK.reduce((s, k) => s + Number(w[k] || 0), 0) : 0;
  async function saveCfg() {
    if (!cfg) return;
    if (sum(cfg.weights_new) !== 100 || sum(cfg.weights_established) !== 100) { setErr(t("Os pesos de cada perfil devem somar 100.")); return; }
    setBusy(true); setErr("");
    try {
      await services.analytics.admin.setHealthConfig(cfg);
      setOpen(false); reload();
      setToast(t("Régua de saúde atualizada ✓")); setTimeout(() => setToast(""), 5000);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const setW = (prof: "weights_new" | "weights_established", k: keyof W, v: string) =>
    setCfg((p) => p ? { ...p, [prof]: { ...p[prof], [k]: Number(v) || 0 } } : p);

  // Cabeçalho de coluna: ordena E/OU filtra por buckets, num popover. Um clique no rótulo abre o
  // menu; o filtro escreve no MESMO estado (colF) que os chips de filtros ativos leem.
  const sortArrow = (k: string) => sortKey === k ? (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : null;
  const renderTh = (col: string, label: string, sortAs?: "health" | "acesso" | "nome" | "mrr" | "mods", filterAs?: "health" | "agent" | "acesso", align?: "right") => {
    const open = menu === col;
    const active = filterAs ? colF[filterAs].length > 0 : false;
    const clickable = !!(sortAs || filterAs);
    return (
      <th style={align === "right" ? { textAlign: "right" } : undefined}>
        {clickable ? (
          <button type="button" className={"colhd" + (active ? " has-filter" : "")} onClick={() => setMenu(open ? null : col)} aria-haspopup="menu" aria-expanded={open}>
            <span>{label}</span>{sortAs ? sortArrow(sortAs) : null}{active && <span className="colhd-dot" />}<ChevronDown size={12} className="colhd-cv" />
          </button>
        ) : <span className="colhd colhd--plain">{label}</span>}
        {open && (
          <>
            <div className="colmenu-back" onClick={() => setMenu(null)} />
            <div className="colmenu" style={align === "right" ? { right: 0 } : undefined} role="menu">
              {sortAs && (<>
                <div className="colmenu-h">{t("Ordenar")}</div>
                <button className={"colmenu-i" + (sortKey === sortAs && sortDir === "asc" ? " on" : "")} onClick={() => { setSortKey(sortAs); setSortDir("asc"); }}><ArrowUp size={13} /> {t("Crescente")}</button>
                <button className={"colmenu-i" + (sortKey === sortAs && sortDir === "desc" ? " on" : "")} onClick={() => { setSortKey(sortAs); setSortDir("desc"); }}><ArrowDown size={13} /> {t("Decrescente")}</button>
              </>)}
              {filterAs && (<>
                <div className="colmenu-h">{t("Filtrar")}</div>
                {BUCKETS[filterAs].map((b) => {
                  const on = colF[filterAs].includes(b.id);
                  const n = clients.filter(b.test).length;
                  return (
                    <button key={b.id} className={"colmenu-i" + (on ? " on" : "")} onClick={() => toggleBucket(filterAs, b.id)} role="menuitemcheckbox" aria-checked={on}>
                      <span className="colmenu-ck">{on && <Check size={12} />}</span><span style={{ flex: 1 }}>{b.label}</span><span className="colmenu-n">{n}</span>
                    </button>
                  );
                })}
              </>)}
            </div>
          </>
        )}
      </th>
    );
  };

  return (
    <div className="bizdash">
      <PageHead eyebrow="Painel Admin · Crasto.AI" title="Visão geral do negócio" sub="A saúde da operação num relance."
        right={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={openCfg}><span className="crasto-btn__icon"><SlidersHorizontal size={15} /></span><span className="crasto-btn__label">{t("Régua de saúde")}</span></button>
          <Link to="/admin/clientes" className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">{t("Cadastrar cliente")}</span></Link>
        </>} />

      <div className="conslabel">{t("comercial (hoje)")}</div>
      <div className="kpis kpis--5">
        <button className="kpi navy kpi-btn" onClick={() => navigate("/admin/financeiro?tab=receber&rec=1")}><div className="lab">{t("MRR (receita recorrente)")}</div><div className="val tnum">{money(mrr)}</div><div className="delta">{t("recorrente · financeiro")} <ArrowRight size={11} /></div></button>
        <button className="kpi kpi-btn" onClick={() => navigate("/admin/financeiro?tab=receber")}><div className="lab">{t("A receber")}</div><div className="val tnum">{money(aReceber)}</div><div className="delta">{t("em aberto · financeiro")} <ArrowRight size={11} /></div></button>
        <div className="kpi"><div className="lab">{t("Clientes ativos")}</div><div className="val tnum">{clients.length}</div><div className="delta">{t("no portal")}</div></div>
        <div className="kpi g"><div className="lab">{t("Módulos entregues")}</div><div className="val tnum">{modules}</div><div className="delta">{t("{n} por cliente", { n: clients.length ? (modules / clients.length).toFixed(1) : 0 })}</div></div>
        <div className="kpi"><div className="lab">{t("Em risco (churn)")}</div><div className="val tnum" style={{ color: risk ? "var(--crasto-danger)" : undefined }}>{risk}</div><div className="delta">{t("requer atenção")}</div></div>
      </div>

      <div className="conslabel">{t("camada operacional de IA")} <span className="badge-new">{t("novo")}</span></div>
      <div className="kpis kpis--console">
        <button className="kpi ckpi" onClick={() => navigate("/admin/console/health")}><div className="lab"><Bot size={13} /> {t("Agentes de IA no ar")}</div><div className="val tnum">{ops ? ops.agents_live : "—"}<small> / {ops ? ops.agents_total : "—"}</small></div><div className="delta">{t("ver Health Check")} <ArrowRight size={11} /></div></button>
        <button className={"kpi ckpi" + (ops?.health === "crit" ? " is-crit" : ops?.health === "attention" ? " is-warn" : "")} onClick={() => navigate("/admin/console/health")}><div className="lab"><Activity size={13} /> {t("Health operacional")}</div><div className="val" style={{ fontSize: 22 }}>{opsHealthLabel(ops?.health)}</div><div className="delta">{t("filas · DLQ")} <ArrowRight size={11} /></div></button>
        <button className="kpi ckpi" onClick={() => navigate("/admin/custo-ia")}><div className="lab"><DollarSign size={13} /> {t("Custo de IA (mês)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{ops ? money(Number(ops.ai_cost_month)) : "—"}</div><div className="delta">{t("por plataforma")} <ArrowRight size={11} /></div></button>
        <button className={"kpi ckpi" + (ops?.isolation !== "ok" && ops ? " is-warn" : "")} onClick={() => navigate("/admin/console/auditoria")}><div className="lab"><ShieldCheck size={13} /> {t("Isolamento (CI)")}</div><div className="val" style={{ fontSize: 22, color: ops?.isolation === "ok" ? "#1F8A5B" : undefined }}>{ops ? (ops.isolation === "ok" ? "OK" : t("Atenção")) : "—"}</div><div className="delta">{t("RLS por cliente")} <ArrowRight size={11} /></div></button>
      </div>

      <div className="sec-h"><h2>{t("Clientes · saúde & uso")}</h2></div>
      {/* Toolbar faceted: busca (por cliente) + CATEGORIA (por estágio, com contagem). Os filtros
          operacionais (risco/agente/dormência) migraram para o cabeçalho de cada coluna. */}
      <div className="cli-toolbar">
        <div className="catsearch cli-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente…")} /></div>
        <div className="cli-chips">
          <button className={"cli-chip" + (stage === "todos" ? " on" : "")} onClick={() => setStage("todos")}>{t("Todos")}<span className="cli-chip-n">{stageCount("todos")}</span></button>
          {STAGES.map((s) => <button key={s.key} className={"cli-chip" + (stage === s.key ? " on" : "")} onClick={() => setStage(s.key)}>{t(s.label)}<span className="cli-chip-n">{stageCount(s.key)}</span></button>)}
        </div>
        <span className="cli-count">{loading ? "" : t("{n} de {tot}", { n: lista.length, tot: clients.length })}</span>
      </div>
      {activeChips.length > 0 && (
        <div className="actfilters">
          <span className="actf-lbl">{t("Filtros ativos")}</span>
          {activeChips.map((ch) => <button key={ch.key} className="actchip" onClick={ch.clear} title={t("Remover filtro")}>{ch.label} <X size={12} /></button>)}
          <button className="actf-clear" onClick={clearAll}>{t("Limpar tudo")}</button>
        </div>
      )}
      <div className="tbl-wrap cli-tbl">
        <table className="tbl">
          <thead><tr>
            {renderTh("nome", t("Cliente"), "nome")}
            {renderTh("health", t("Health"), "health", "health")}
            {renderTh("agent", t("Agente"), undefined, "agent")}
            {renderTh("mods", t("Módulos"), "mods")}
            {renderTh("mrr", t("MRR"), "mrr", undefined, "right")}
            {renderTh("acesso", t("Últ. acesso"), "acesso", "acesso")}
            <th style={{ textAlign: "right" }}>{t("ação")}</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr> :
             lista.length === 0 ? <tr><td colSpan={7} style={{ color: "var(--crasto-text-muted)" }}>{t("Nenhum cliente com esse filtro.")}</td></tr> :
              lista.map((c) => {
                const h = healthScore(c);
                const stale = c.last_access && (Date.now() - new Date(c.last_access).getTime()) > 20 * 86400000;
                const color = h.tone === "ok" ? "#1F8A5B" : h.tone === "warn" ? "#B8863A" : "#B83A3A";
                const reasons = (h.reasons ?? []) as string[];
                const mods = c.modules ?? [];
                // Agente REAL (federado). undefined = federação indisponível → "—" (não mente).
                const ag = agByOrg[c.id];
                const farol = ag ? AGENT_FAROL[ag.farol] : null;
                return (
                  <tr key={c.id} className="cli-row">
                    <td className="cli-cell-id"><div className="cust"><div className="logo">{initials(c.name)}</div><div className="cli-id"><div className="nm">{c.name}</div><div className="em">{c.email || "—"}</div></div></div></td>
                    <td data-label={t("Health")}><span className="health" title={reasons.join(" · ")}><span className="d" style={{ background: color }} />{h.score} · {h.label}</span></td>
                    <td data-label={t("Agente")}>{farol
                      ? <span className="cli-ag"><span className="d" style={{ background: farol.tone === "ok" ? "#1F8A5B" : farol.tone === "warn" ? "#B8863A" : farol.tone === "crit" ? "#B83A3A" : "#98A2B3" }} />{t(farol.label)}{ag.agentes > 1 ? ` · ${ag.no_ar}/${ag.agentes}` : ""}</span>
                      : <span className="cli-ag mute">—</span>}</td>
                    <td data-label={t("Módulos")}><span className="cli-mods">{mods.slice(0, 2).map((m, i) => <span className="chip" key={i}>{modShort(m)}</span>)}{mods.length > 2 && <span className="chip chip--more" title={mods.join(", ")}>+{mods.length - 2}</span>}{mods.length === 0 && <span className="cli-ag mute">—</span>}</span></td>
                    <td className="tnum cli-cell-mrr" data-label={t("MRR")} style={{ textAlign: "right", fontWeight: 600, color: Number(c.mrr) > 0 ? "var(--crasto-text-primary)" : "var(--crasto-text-faint)" }}>{Number(c.mrr) > 0 ? money(c.mrr) : "—"}</td>
                    <td className="cli-acc" data-label={t("Últ. acesso")} style={{ color: stale ? "var(--crasto-danger)" : "var(--crasto-text-muted)" }}><Clock size={12} style={{ verticalAlign: -1, marginRight: 4, opacity: .6 }} />{timeAgo(c.last_access)}</td>
                    <td className="cli-cell-act" style={{ textAlign: "right" }}><button className="linkbtn" onClick={() => enterCrm(c)}>{t("Entrar no CRM")} <ArrowRight size={12} /></button></td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Modal title={t("Entrar no CRM de") + " " + (escolher?.nome || "")} open={!!escolher} onClose={() => setEscolher(null)}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--crasto-text-muted)" }}>{t("Escolha o agente — cada um tem o seu próprio CRM.")}</p>
        {escErr && <div className="alert alert--warn" style={{ marginBottom: 10 }}>{escErr}</div>}
        {!agentes && <div style={{ padding: "10px 0", color: "var(--crasto-text-muted)" }}>{t("Carregando agentes…")}</div>}
        {agentes && agentes.length === 0 && !escErr && <div style={{ padding: "10px 0", color: "var(--crasto-text-muted)" }}>{t("Este cliente ainda não tem agente no WhatsApp CRM.")}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(agentes || []).map((a) => (
            <button key={a.id} className="rowbtn" disabled={entrando} onClick={() => abrirCrm(a)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", border: "1px solid var(--crasto-border)", borderRadius: 10, background: "var(--crasto-surface)", cursor: entrando ? "wait" : "pointer", opacity: entrando ? 0.6 : 1 }}>
              <span className="logo" style={{ width: 30, height: 30, fontSize: 12 }}>{initials(a.name)}</span>
              <span style={{ flex: 1 }}><b>{a.name}</b>{a.plan ? <span style={{ color: "var(--crasto-text-muted)" }}> · {a.plan}</span> : null}</span>
              <ArrowRight size={14} style={{ opacity: .5 }} />
            </button>
          ))}
        </div>
        {agentes && agentes.length > 0 && (
          <button onClick={() => abrirCrm()} disabled={entrando} style={{ marginTop: 12, width: "100%", padding: "9px 12px", border: "1px dashed var(--crasto-border)", borderRadius: 10, background: "transparent", color: "var(--crasto-text-muted)", cursor: entrando ? "wait" : "pointer", fontSize: 13, opacity: entrando ? 0.6 : 1 }}>
            {entrando ? t("Entrando…") : `${t("Ver a empresa inteira")} (${agentes.length} ${agentes.length === 1 ? t("agente") : t("agentes")})`}
          </button>
        )}
      </Modal>

      <Modal title={t("Régua de saúde do cliente")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || !cfg} onClick={saveCfg}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        {!cfg ? <div className="empty">{t("Carregando…")}</div> : (
          <>
            <div className="note" style={{ marginBottom: 14 }}><span>{t("O score combina 5 sinais, com peso diferente por ciclo de vida. Ajuste os pesos (somam 100) e os limiares — vale na hora, sem código.")}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Cliente novo até (dias)"><input type="number" value={cfg.new_client_days} onChange={(e) => setCfg({ ...cfg, new_client_days: Number(e.target.value) || 0 })} /></Field>
              <Field label="Saudável a partir de"><input type="number" value={cfg.attention_threshold} onChange={(e) => setCfg({ ...cfg, attention_threshold: Number(e.target.value) || 0 })} /></Field>
              <Field label="Em risco abaixo de"><input type="number" value={cfg.risk_threshold} onChange={(e) => setCfg({ ...cfg, risk_threshold: Number(e.target.value) || 0 })} /></Field>
            </div>
            {(["weights_new", "weights_established"] as const).map((prof) => (
              <div key={prof} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--crasto-border-soft)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--crasto-text-primary)", marginBottom: 8 }}>
                  {prof === "weights_new" ? t("Cliente NOVO (onboarding)") : t("Cliente ESTABELECIDO")} · {t("soma")} {sum(cfg[prof])}{sum(cfg[prof]) !== 100 ? " ⚠️" : " ✓"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {WK.map((k) => (
                    <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <span style={{ flex: 1, color: "var(--crasto-text-body)" }}>{t(WLABEL[k])}</span>
                      <input type="number" value={cfg[prof][k]} onChange={(e) => setW(prof, k, e.target.value)} style={{ width: 62 }} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
