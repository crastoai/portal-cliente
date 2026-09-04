import { useRef, useState } from "react";
import { UserPlus, Clock, SlidersHorizontal, Bot, Activity, DollarSign, ShieldCheck, ArrowRight, Search, ChevronDown, X, ArrowUp, ArrowDown, Check } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, useAsync, money, initials, Field } from "../../ui/ui";
import { fetchClients, healthScore, timeAgo, modShort, type Client } from "../../lib/adminData";
import { STAGES, WON_STAGE } from "../../lib/countries";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import AcessarComoModal from "../../ui/AcessarComo";

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

// Módulos por cliente (RPC admin_modules_by_client): nome+status por instância, agrupado por empresa.
type ModRow = { name: string; catalog_name?: string; category?: string; status?: string; rollout_status?: string; progress?: number };
type ModByClient = { org_id: string; org_name: string; stage?: string; contratados: number; entregues: number; modules: ModRow[] };

export default function VisaoGeral() {
  const t = useT();
  const navigate = useNavigate();
  const { data, loading, reload } = useAsync(async () => {
    const [clients, ov, agentsOv, receber, modsByClient] = await Promise.all([
      fetchClients(),
      services.analytics.admin.consoleOverview().catch(() => null),
      services.crmAccess.agentsOverview().catch(() => ({})), // federado do wacrm (agente REAL)
      services.finance.accounts.list("receivable").catch(() => [] as any[]), // contas a receber (dado real)
      services.analytics.admin.modulesByClient<ModByClient[]>().catch(() => [] as ModByClient[]), // módulos por cliente (nome+status)
    ]);
    return { clients: clients ?? [], ov: ov as any, agentsOv: agentsOv as Record<string, { agentes: number; no_ar: number; farol: string }>, receber: (receber ?? []) as any[], modsByClient: (modsByClient ?? []) as ModByClient[] };
  }, []);
  const clients = data?.clients ?? [];
  const ov = data?.ov ?? null;
  const ops = ov?.ops ?? null;
  // Agente por org vem do wacrm (federado). Se a chamada falhou, `agByOrg` é {} → a coluna
  // mostra "—" (dado indisponível), nunca "sem agente" mentiroso.
  const agByOrg = data?.agentsOv ?? {};
  const modules = clients.reduce((s, c) => s + (c.modules?.length ?? 0), 0);
  const risk = clients.filter((c) => healthScore(c).tone === "crit").length;
  // Clientes ATIVOS = quem é cliente de fato (stage='ganho') e não deu churn. NÃO é o total de
  // organizações (que inclui prospecto/lead/oportunidade/perdido). Antes o card mostrava clients.length (todas as orgs).
  const clientesAtivos = clients.filter((c) => c.stage === WON_STAGE && !c.churned_em).length;
  // Módulos por cliente (RPC nova): totais reais entregues (rollout_status='delivered') × contratados.
  // Fallback: se a RPC falhar (lista vazia), o card volta ao formato antigo ({modules} / por cliente).
  const modsByClient = (data?.modsByClient ?? []) as ModByClient[];
  const hasMods = modsByClient.length > 0;
  const entregues = modsByClient.reduce((s, c) => s + (c.entregues ?? 0), 0);
  const contratados = hasMods ? modsByClient.reduce((s, c) => s + (c.contratados ?? 0), 0) : modules;

  // FINANCEIRO REAL (contas a receber). MRR = só ASSINATURA de verdade, pelo campo `recurrence`:
  //  • recurrence mensal → o valor da parcela (a mensalidade; ex.: Connect 12× R$1.500 → R$1.500),
  //    ou o `amount` se não houver parcelas;
  //  • recurrence anual → o valor ÷ 12;
  //  • pontual/avulso (workshop, projeto parcelado one-off) → NÃO é recorrente → NÃO entra no MRR.
  //  (Parcelas ≠ recorrência: um deal pontual parcelado não é receita recorrente — decisão do Crasto 12/08.)
  // Recebíveis = tudo que ainda está EM ABERTO (total − já pago). Nada fictício: se não há
  // contas, os dois somam 0 e é a verdade.
  const receber = (data?.receber ?? []).filter((a: any) => a.status !== "cancelled");
  const inferRecurring = (a: any) => { const r = String(a?.recurrence || "").toLowerCase(); if (r) return r; if (Number(a?.payment_installments || 0) > 1 && Number(a?.contract_validity_value || 0) > 0 && /^(meses|months|month)$/i.test(a?.contract_validity_unit || "")) return "mensal"; return ""; };
  const mensalDe = (a: any) => {
    const r = inferRecurring(a);
    if (r === "mensal" || r === "monthly") { const p = Array.isArray(a?.payment_schedule) ? a.payment_schedule : []; return p.length ? Number(p[0]?.amount || 0) : Number(a.amount || 0); }
    if (r === "anual" || r === "yearly") return Number(a.amount || 0) / 12;
    return 0;
  };
  const mrr = receber.reduce((s: number, a: any) => s + mensalDe(a), 0);
  const aReceber = receber.reduce((s: number, a: any) => s + (Number(a.amount || 0) - Number(a.amount_paid || 0)), 0);
  // Mensalidade equivalente (Crasto 12/08): TODO contrato de cliente anualizado ÷12, mesmo pago adiantado
  // (Carneiro 10k → 833/mês). Exclui avulso/workshop. Difere do MRR (só assinatura que se renova).
  const isAvulso = (a: any) => /avulso|workshop/i.test(String(a?.category || "") + " " + String(a?.description || ""));
  const mensalEquiv = receber.filter((a: any) => !isAvulso(a)).reduce((s: number, a: any) => s + Number(a.contract_total || a.amount || 0) / 12, 0);

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

  // KPIs comerciais (Clientes ativos / Módulos / Em risco) nascem da MESMA lista `clients` que a
  // tabela "Clientes · saúde & uso" abaixo (mesmo `healthScore()`). Então clicar não navega pra
  // outra tela (o número não mora lá) — aplica o filtro/ordenação equivalente e rola até as linhas
  // exatas que compõem o número. Fidelidade: "Em risco" reusa o bucket health=risco (= tone crit).
  const tableRef = useRef<HTMLDivElement>(null);
  const jumpToList = () => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const verClientes = () => { setQ(""); clearAll(); setStage(WON_STAGE); jumpToList(); };
  const verModulos = () => { setQ(""); clearAll(); setSortKey("mods"); setSortDir("desc"); jumpToList(); };
  const verRisco = () => { setQ(""); setStage("todos"); setColF({ health: ["risco"], agent: [], acesso: [] }); jumpToList(); };

  // Painel "Módulos por cliente" (abre pelo card). Filtro por rollout: todos / só entregues / em implantação.
  const [modOpen, setModOpen] = useState(false);
  const [modFilter, setModFilter] = useState<"all" | "delivered" | "in_progress">("all");
  const modStatus = (m: ModRow): { label: string; color: string } => {
    if (m.rollout_status === "delivered") return { label: t("Entregue"), color: "#1F8A5B" };
    if (m.rollout_status === "on_hold") return { label: t("Em espera"), color: "#98A2B3" };
    return { label: t("Em implantação") + (m.progress ? ` · ${m.progress}%` : ""), color: "#B8863A" };
  };

  // ENTRAR NO CRM DO CLIENTE = o mesmo "Acessar como" do resto do sistema (modo ÚNICO).
  //
  // O que havia aqui antes era um TERCEIRO mecanismo: pedíamos um magiclink do PRÓPRIO admin e
  // mandávamos o escopo do cliente na URL (`imp_org`/`imp_agent`) para o CRM. Ou seja, quem
  // entrava continuava sendo o admin, e o CRM tinha de saber tratar um escopo alheio — cada
  // sistema precisando aprender a fingir. Trocar de identidade resolve na origem: o CRM (e todo
  // o resto) passa a resolver a org sozinho, pelo JWT, sem saber que existe impersonação.
  //
  // Efeito colateral aceito: some a escolha de UM agente específico. Entrando como a pessoa,
  // vê-se o CRM dela — com os agentes dela — que é justamente o ponto de auditar "como o cliente vê".
  const [escolher, setEscolher] = useState<{ org: string; nome: string } | null>(null);

  function enterCrm(c: any) { setEscolher({ org: c.id, nome: c.name }); }

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
      <div className="kpis kpis--6">
        <button className="kpi navy kpi-btn" onClick={() => navigate("/admin/financeiro/a-receber?rec=1")}><div className="lab">{t("MRR (receita recorrente)")}</div><div className="val tnum">{money(mrr)}</div><div className="delta">{t("recorrente · financeiro")} <ArrowRight size={11} /></div></button>
        <button className="kpi kpi-btn" onClick={() => navigate("/admin/financeiro/a-receber")} title={t("Mensalidade equivalente: todo contrato de cliente ÷ 12")}><div className="lab">{t("Mensalidade equivalente")}</div><div className="val tnum">{money(mensalEquiv)}</div><div className="delta">{t("contratos ÷ 12")} <ArrowRight size={11} /></div></button>
        <button className="kpi kpi-btn" onClick={() => navigate("/admin/financeiro/a-receber")}><div className="lab">{t("A receber")}</div><div className="val tnum">{money(aReceber)}</div><div className="delta">{t("em aberto · financeiro")} <ArrowRight size={11} /></div></button>
        <button className="kpi kpi-btn" onClick={verClientes} title={t("Ver os clientes ativos na lista abaixo")}><div className="lab">{t("Clientes ativos")}</div><div className="val tnum">{clientesAtivos}</div><div className="delta">{t("no portal")} <ArrowDown size={11} /></div></button>
        <button className="kpi g kpi-btn" onClick={() => (hasMods ? setModOpen(true) : verModulos())} title={t("Ver os módulos entregues por cliente")}>
          <div className="lab">{t("Módulos")}</div>
          {hasMods ? (<>
            <div className="val" style={{ fontSize: 19, fontWeight: 700 }}>
              <span style={{ color: "#1F8A5B" }}>{entregues}</span><small style={{ fontWeight: 400, fontSize: 12, color: "var(--crasto-text-muted)" }}> {t("entregues")}</small>
              <span style={{ margin: "0 5px", color: "var(--crasto-text-faint)" }}>·</span>
              {contratados}<small style={{ fontWeight: 400, fontSize: 12, color: "var(--crasto-text-muted)" }}> {t("contratados")}</small>
            </div>
            <div className="delta">{t("ver por cliente")} <ArrowRight size={11} /></div>
          </>) : (<>
            <div className="val tnum">{modules}</div>
            <div className="delta">{t("{n} por cliente", { n: clients.length ? (modules / clients.length).toFixed(1) : 0 })} <ArrowDown size={11} /></div>
          </>)}
        </button>
        <button className="kpi kpi-btn" onClick={verRisco} title={t("Ver clientes em risco na lista abaixo")}><div className="lab">{t("Em risco (churn)")}</div><div className="val tnum" style={{ color: risk ? "var(--crasto-danger)" : undefined }}>{risk}</div><div className="delta">{t("requer atenção")} <ArrowDown size={11} /></div></button>
      </div>

      <div className="conslabel">{t("camada operacional de IA")} <span className="badge-new">{t("novo")}</span></div>
      <div className="kpis kpis--console">
        <button className="kpi ckpi" onClick={() => navigate("/admin/console/health")}><div className="lab"><Bot size={13} /> {t("Agentes de IA no ar")}</div><div className="val tnum">{ops ? ops.agents_live : "—"}<small> / {ops ? ops.agents_total : "—"}</small></div><div className="delta">{t("ver Health Check")} <ArrowRight size={11} /></div></button>
        <button className={"kpi ckpi" + (ops?.health === "crit" ? " is-crit" : ops?.health === "attention" ? " is-warn" : "")} onClick={() => navigate("/admin/console/health")}><div className="lab"><Activity size={13} /> {t("Health operacional")}</div><div className="val" style={{ fontSize: 22 }}>{opsHealthLabel(ops?.health)}</div><div className="delta">{t("filas · DLQ")} <ArrowRight size={11} /></div></button>
        <button className="kpi ckpi" onClick={() => navigate("/admin/custo-ia")}><div className="lab"><DollarSign size={13} /> {t("Custo de IA (mês)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{ops ? money(Number(ops.ai_cost_month)) : "—"}</div><div className="delta">{t("por plataforma")} <ArrowRight size={11} /></div></button>
        <button className={"kpi ckpi" + (ops?.isolation !== "ok" && ops ? " is-warn" : "")} onClick={() => navigate("/admin/console/auditoria")}><div className="lab"><ShieldCheck size={13} /> {t("Isolamento (CI)")}</div><div className="val" style={{ fontSize: 22, color: ops?.isolation === "ok" ? "#1F8A5B" : undefined }}>{ops ? (ops.isolation === "ok" ? "OK" : t("Atenção")) : "—"}</div><div className="delta">{t("RLS por cliente")} <ArrowRight size={11} /></div></button>
      </div>

      <div className="sec-h" ref={tableRef}><h2>{t("Clientes · saúde & uso")}</h2></div>
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

      <AcessarComoModal orgId={escolher?.org || ""} orgName={escolher?.nome || ""} open={!!escolher}
        onClose={() => setEscolher(null)}
        onIrParaPermissoes={() => { const o = escolher?.org; setEscolher(null); navigate(`/admin/console/permissoes?org=${o}`); }} />

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
      <Modal title={t("Módulos por cliente")} open={modOpen} onClose={() => setModOpen(false)} wide>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, color: "#1F8A5B" }}>{entregues} {t("entregues")}</span>
          <span style={{ color: "var(--crasto-text-faint)" }}>·</span>
          <span style={{ fontWeight: 700 }}>{contratados} {t("contratados")}</span>
          <span style={{ color: "var(--crasto-text-faint)" }}>·</span>
          <span style={{ color: "var(--crasto-text-muted)" }}>{modsByClient.length} {t(modsByClient.length === 1 ? "empresa" : "empresas")}</span>
        </div>
        <div className="cli-chips" style={{ marginBottom: 14 }}>
          {([["all", t("Todos")], ["delivered", t("Só entregues")], ["in_progress", t("Em implantação")]] as [typeof modFilter, string][]).map(([k, lbl]) => (
            <button key={k} className={"cli-chip" + (modFilter === k ? " on" : "")} onClick={() => setModFilter(k)}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {modsByClient.length === 0 && <div style={{ color: "var(--crasto-text-muted)", padding: "8px 0" }}>{t("Nenhum módulo contratado ainda.")}</div>}
          {modsByClient.map((org) => {
            const mods = (org.modules ?? []).filter((m) => modFilter === "all" || (modFilter === "delivered" ? m.rollout_status === "delivered" : m.rollout_status !== "delivered"));
            if (modFilter !== "all" && mods.length === 0) return null;
            return (
              <div key={org.org_id}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{org.org_name}</span>
                  <span style={{ fontSize: 12, color: "var(--crasto-text-muted)", whiteSpace: "nowrap" }}>{t(org.contratados === 1 ? "{n} módulo" : "{n} módulos", { n: org.contratados })} · {org.entregues} {t("entregues")}</span>
                </div>
                {mods.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--crasto-text-faint)", padding: "3px 0" }}>{t("nenhum módulo")}{org.stage ? ` — ${t(STAGES.find((s) => s.key === org.stage)?.label || org.stage)}` : ""}</div>
                ) : mods.map((m, i) => {
                  const st = modStatus(m);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 2px", borderBottom: "1px solid var(--crasto-border-soft)" }}>
                      <span style={{ fontSize: 13 }}>{m.name}</span>
                      <span className="cli-ag" style={{ whiteSpace: "nowrap" }}><span className="d" style={{ background: st.color }} />{st.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
