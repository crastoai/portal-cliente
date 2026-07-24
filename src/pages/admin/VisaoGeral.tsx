import { useState } from "react";
import { UserPlus, Clock, SlidersHorizontal, Bot, Activity, DollarSign, ShieldCheck, ArrowRight, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, useAsync, money, initials, Field } from "../../ui/ui";
import { fetchClients, healthScore, timeAgo, modShort } from "../../lib/adminData";
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
    const [clients, ov, agentsOv] = await Promise.all([
      fetchClients(),
      services.analytics.admin.consoleOverview().catch(() => null),
      services.crmAccess.agentsOverview().catch(() => ({})), // federado do wacrm (agente REAL)
    ]);
    return { clients: clients ?? [], ov: ov as any, agentsOv: agentsOv as Record<string, { agentes: number; no_ar: number; farol: string }> };
  }, []);
  const clients = data?.clients ?? [];
  const ov = data?.ov ?? null;
  const ops = ov?.ops ?? null;
  // Agente por org vem do wacrm (federado). Se a chamada falhou, `agByOrg` é {} → a coluna
  // mostra "—" (dado indisponível), nunca "sem agente" mentiroso.
  const agByOrg = data?.agentsOv ?? {};
  const mrr = clients.reduce((s, c) => s + Number(c.mrr), 0);
  const modules = clients.reduce((s, c) => s + (c.modules?.length ?? 0), 0);
  const risk = clients.filter((c) => healthScore(c).tone === "crit").length;

  // ── Tabela em ESCALA (pesquisa de padrões de admin/CS): busca + filtro rápido + ordenação
  // por risco. Sem isso, 100 clientes viram scroll cego. Filtro client-side (a lista é pequena).
  const [q, setQ] = useState("");
  const [fchip, setFchip] = useState<"todos" | "risco" | "sem_agente" | "dormente">("todos");
  const [sortKey, setSortKey] = useState<"health" | "acesso" | "nome">("health");
  const query = q.trim().toLowerCase();
  const DORMENTE = 30 * 86400000;
  const lista = clients
    .filter((c) => !query || `${c.name} ${c.email || ""}`.toLowerCase().includes(query))
    .filter((c) => {
      if (fchip === "risco") return healthScore(c).tone === "crit";
      if (fchip === "sem_agente") return (agByOrg[c.id]?.agentes ?? 0) === 0;
      if (fchip === "dormente") return !c.last_access || (Date.now() - new Date(c.last_access).getTime()) > DORMENTE;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "nome") return a.name.localeCompare(b.name, "pt-BR");
      if (sortKey === "acesso") { const av = a.last_access ? new Date(a.last_access).getTime() : 0; const bv = b.last_access ? new Date(b.last_access).getTime() : 0; return bv - av; }
      // health: pior primeiro (triage — o urgente sobe), como recomenda a pesquisa.
      return healthScore(a).score - healthScore(b).score;
    });
  const CHIPS: { k: typeof fchip; lb: string }[] = [
    { k: "todos", lb: t("Todos") }, { k: "risco", lb: t("Em risco") },
    { k: "sem_agente", lb: t("Sem agente") }, { k: "dormente", lb: t("Dormente 30d+") },
  ];

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

  return (
    <div className="bizdash">
      <PageHead eyebrow="Painel Admin · Crasto.AI" title="Visão geral do negócio" sub="A saúde da operação num relance."
        right={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={openCfg}><span className="crasto-btn__icon"><SlidersHorizontal size={15} /></span><span className="crasto-btn__label">{t("Régua de saúde")}</span></button>
          <Link to="/admin/clientes" className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">{t("Cadastrar cliente")}</span></Link>
        </>} />

      <div className="conslabel">{t("comercial (hoje)")}</div>
      <div className="kpis">
        <div className="kpi navy"><div className="lab">{t("MRR (receita recorrente)")}</div><div className="val tnum">{money(mrr)}</div><div className="delta">{t("soma dos contratos")}</div></div>
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
      {/* Toolbar: busca + filtros rápidos + contagem. Ordena-se pelo cabeçalho. */}
      <div className="cli-toolbar">
        <div className="catsearch cli-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente…")} /></div>
        <div className="cli-chips">{CHIPS.map((ch) => <button key={ch.k} className={"cli-chip" + (fchip === ch.k ? " on" : "")} onClick={() => setFchip(ch.k)}>{ch.lb}</button>)}</div>
        <span className="cli-count">{loading ? "" : t("{n} de {tot}", { n: lista.length, tot: clients.length })}</span>
      </div>
      <div className="tbl-wrap cli-tbl">
        <table className="tbl">
          <thead><tr>
            <th className="th-sort" onClick={() => setSortKey("nome")}>{t("Cliente")}{sortKey === "nome" ? " ↓" : ""}</th>
            <th className="th-sort" onClick={() => setSortKey("health")}>{t("Health")}{sortKey === "health" ? " ↓" : ""}</th>
            <th>{t("Agente")}</th>
            <th>{t("Módulos")}</th>
            <th style={{ textAlign: "right" }}>{t("MRR")}</th>
            <th className="th-sort" onClick={() => setSortKey("acesso")}>{t("Últ. acesso")}{sortKey === "acesso" ? " ↓" : ""}</th>
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
