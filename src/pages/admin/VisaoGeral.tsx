import { useState } from "react";
import { UserPlus, Clock, SlidersHorizontal, Bot, Activity, DollarSign, ShieldCheck, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, useAsync, money, initials, Field } from "../../ui/ui";
import { fetchClients, healthScore, timeAgo, modShort } from "../../lib/adminData";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

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
    const [clients, ov] = await Promise.all([fetchClients(), services.analytics.admin.consoleOverview().catch(() => null)]);
    return { clients: clients ?? [], ov: ov as any };
  }, []);
  const clients = data?.clients ?? [];
  const ov = data?.ov ?? null;
  const ops = ov?.ops ?? null;
  const agentByOrg: Record<string, any> = Object.fromEntries((ov?.clients ?? []).map((c: any) => [c.organization_id, c]));
  const mrr = clients.reduce((s, c) => s + Number(c.mrr), 0);
  const modules = clients.reduce((s, c) => s + (c.modules?.length ?? 0), 0);
  const risk = clients.filter((c) => healthScore(c).tone === "crit").length;

  async function enterCrm(c: any) {
    try { await services.analytics.admin.auditRecord({ action: "impersonate_attempt", target_type: "org", target_id: c.id, organization_id: c.id, context: { via: "console_dashboard" } }); } catch { /* auditoria é best-effort aqui */ }
    setToast(t("Acesso registrado na auditoria. O WhatsApp CRM abre aqui quando estiver no ar.")); setTimeout(() => setToast(""), 6000);
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
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Cliente")}</th><th>{t("Módulos")}</th><th>{t("Últ. acesso")}</th><th>{t("Health (entrega)")}</th><th>{t("Agente (IA)")}</th><th>{t("MRR")}</th><th style={{ textAlign: "right" }}>{t("ação")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr> :
              clients.map((c) => {
                const h = healthScore(c);
                const stale = c.last_access && (Date.now() - new Date(c.last_access).getTime()) > 20 * 86400000;
                const color = h.tone === "ok" ? "#1F8A5B" : h.tone === "warn" ? "#B8863A" : "#B83A3A";
                const reasons = (h.reasons ?? []) as string[];
                return (
                  <tr key={c.id}>
                    <td><div className="cust"><div className="logo">{initials(c.name)}</div><div><div className="nm">{c.name}</div><div className="em">{c.email || "—"}</div></div></div></td>
                    <td><div className="modchips">{(c.modules ?? []).map((m, i) => <span className="chip" key={i}>{modShort(m)}</span>)}</div></td>
                    <td style={{ color: stale ? "var(--crasto-danger)" : "var(--crasto-text-body)", fontWeight: 500 }}><Clock size={12} style={{ verticalAlign: -1, marginRight: 4, opacity: .6 }} />{timeAgo(c.last_access)}</td>
                    <td>
                      <span className="health" title={reasons.join(" · ")}><span className="d" style={{ background: color }} />{h.score} · {h.label}</span>
                      {reasons.length > 0 && <div style={{ fontSize: 11, color: "var(--crasto-text-muted)", marginTop: 2 }}>{reasons[0]}{reasons.length > 1 ? ` +${reasons.length - 1}` : ""}</div>}
                    </td>
                    <td>{(() => { const a = AGENT_FAROL[agentByOrg[c.id]?.agent ?? "none"]; return <Pill tone={a.tone as any}>{t(a.label)}</Pill>; })()}</td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-text-primary)" }}>{money(c.mrr)}</td>
                    <td style={{ textAlign: "right" }}><button className="linkbtn" onClick={() => enterCrm(c)}>{t("Entrar no CRM")} <ArrowRight size={12} /></button></td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

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
