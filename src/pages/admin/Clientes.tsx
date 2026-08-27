// ============================================================================
// Módulo "Empresas" — lista admin (prospectos, leads, oportunidades e clientes).
// Farol de saúde + funil + filtros cruzados (trial/churned/ativos/inativos/oculto/país/período),
// colunas ordenáveis, timestamps completos (dd/mm/aaaa hh:mm), ações inline (sem lixeira).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Eye, Power, ArrowRightLeft, ShieldCheck, Trash2, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, Filter, ChevronDown, X, List, LayoutGrid } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { services as api, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, money, initials, Field, Pill, useToast } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { useT } from "../../lib/i18n";
import { fetchClients, fmtDateTime, type Client } from "../../lib/adminData";
import { COUNTRIES, countryOf, STAGES, PIPELINE_STAGES, WON_STAGE, LOST_STAGE, stageOf, tempOf, DIAL_CODES } from "../../lib/countries";
import PersonaStats from "./PersonaStats";

const EMPTY = { name: "", stage: "prospecto", country: "BR", tax_id: "", founded_on: "", website: "", owner_name: "", whatsapp: "", ddi: "+55", plan: "", email: "", contact_name: "" };
const FAROL: Record<string, string> = { ok: "#1D9E75", green: "#1D9E75", saudavel: "#1D9E75", warn: "#EF9F27", amber: "#EF9F27", atencao: "#EF9F27", crit: "#E24B4A", red: "#E24B4A", risco: "#E24B4A" };
const PAPEL_LABEL: Record<string, string> = { fornecedor: "Fornecedor", prestador_servico: "Prestador", representante_comercial: "Representante", indicador: "Indicador", colaborador: "Colaborador" };
const FLAGS = [
  { key: "trial", label: "Em trial", bg: "#FAEEDA", fg: "#633806" },
  { key: "churned", label: "Churned", bg: "#FCEBEB", fg: "#791F1F" },
  { key: "ativos", label: "Ativos", bg: "#E1F5EE", fg: "#085041" },
  { key: "inativos", label: "Inativos", bg: "var(--crasto-bg-2)", fg: "var(--crasto-text-body)" },
  { key: "oculto", label: "Cliente oculto", bg: "var(--crasto-bg-2)", fg: "var(--crasto-text-body)" },
];

export default function Clientes() {
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, reload } = useAsync(fetchClients, []);
  const { data: agentsOvRaw } = useAsync(() => api.crmAccess.agentsOverview().catch(() => ({})), []);
  const all = (data ?? []) as Client[];
  const agentsOv = (agentsOvRaw ?? {}) as Record<string, { agentes: number; no_ar: number; farol: string }>;

  const [tab, setTab] = useState<string>("todos");
  const [flag, setFlag] = useState<string>("");
  const [pais, setPais] = useState<string>("");
  const [periodo, setPeriodo] = useState<string>("");
  const [dataDe, setDataDe] = useState<string>("");
  const [dataAte, setDataAte] = useState<string>("");
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Visão da aba: lista (padrão — o Crasto prefere) ⇄ cards (kanban por estágio). Persistida por navegador.
  const [view, setView] = useState<"list" | "cards">(() => (localStorage.getItem("crm_empresas_view") === "cards" ? "cards" : "list"));
  useEffect(() => { try { localStorage.setItem("crm_empresas_view", view); } catch { /* storage off */ } }, [view]);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "created_at", dir: -1 });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Excluir empresa (modal digite-o-nome). delAlvo = empresa a excluir; delNome = texto digitado.
  const [delAlvo, setDelAlvo] = useState<Client | null>(null);
  const [delNome, setDelNome] = useState("");
  const [delBusy, setDelBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: all.length };
    STAGES.forEach((s) => (c[s.key] = all.filter((x) => x.stage === s.key).length));
    return c;
  }, [all]);

  function agentesOf(c: Client) { return agentsOv[c.id]?.agentes ?? null; }
  function hasEnv(c: Client) { return (c.modules?.length ?? 0) > 0 || c.stage === WON_STAGE || !!agentsOv[c.id]; }
  function farolOf(c: Client): string | null {
    if (!hasEnv(c)) return null;
    const tone = (agentsOv[c.id]?.farol || c.health_v2?.tone || "").toLowerCase();
    return FAROL[tone] ?? null;
  }
  function trialDays(c: Client): number | null {
    if (!c.trial_fim) return null;
    const ms = new Date(c.trial_fim).getTime() - Date.now();
    return ms > 0 ? Math.ceil(ms / 86400000) : 0;
  }
  function isTrial(c: Client) { return c.trial_resultado === "em_andamento" || (trialDays(c) ?? 0) > 0; }

  function matchFlag(c: Client) {
    const active = (c.org_status ?? "active") === "active";
    switch (flag) {
      case "trial": return isTrial(c);
      case "churned": return !!c.churned_em;
      case "ativos": return active && !c.churned_em;
      case "inativos": return !active;
      case "oculto": return !!c.cliente_oculto;
      default: return true;
    }
  }
  function inPeriodo(c: Client) {
    if (periodo === "custom") {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      if (dataDe && d < new Date(dataDe + "T00:00:00")) return false;
      if (dataAte && d > new Date(dataAte + "T23:59:59")) return false;
      return true;
    }
    const m = ({ "12m": 12, "24m": 24, "36m": 36 } as Record<string, number>)[periodo];
    if (!m || !c.created_at) return true;
    const cut = new Date(); cut.setMonth(cut.getMonth() - m);
    return new Date(c.created_at) >= cut;
  }
  const periodoLabel = periodo === "custom" ? t("personalizado") : ({ "12m": "12m", "24m": "2 anos", "36m": "3 anos" } as Record<string, string>)[periodo] || "";
  const filtrosAtivos = !!(pais || periodo);
  function limparFiltros() { setFlag(""); setPais(""); setPeriodo(""); setDataDe(""); setDataAte(""); }

  function sortVal(c: Client): number | string {
    switch (sort.col) {
      case "name": return (c.name || "").toLowerCase();
      case "stage": return STAGES.findIndex((s) => s.key === c.stage);
      case "proposta": return c.deal_value ?? (c.mrr || 0);
      case "created_at": return c.created_at ? new Date(c.created_at).getTime() : 0;
      case "convertido_em": return c.convertido_em ? new Date(c.convertido_em).getTime() : 0;
      case "agentes": return agentesOf(c) ?? -1;
      case "farol": { const cor = farolOf(c); return cor === FAROL.crit ? 0 : cor === FAROL.warn ? 1 : cor === FAROL.ok ? 2 : 3; }
      default: return 0;
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = all.filter((c) =>
      (tab === "todos" || c.stage === tab) && matchFlag(c) && (!pais || c.country === pais) && inPeriodo(c) &&
      (!q || [c.name, c.tax_id, c.email, c.owner_name, c.phone].some((v) => (v || "").toLowerCase().includes(q))));
    return filtered.sort((a, b) => { const va = sortVal(a), vb = sortVal(b); return va < vb ? -sort.dir : va > vb ? sort.dir : 0; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, agentsOv, tab, flag, pais, periodo, dataDe, dataAte, query, sort]);

  // Kanban (visão cards): agrupa por estágio TODAS as empresas que passam nos filtros cruzados
  // (ignora o `tab` do funil — no kanban as 5 colunas aparecem sempre). Cada coluna ordena por mais recente.
  const byStage = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pass = all.filter((c) =>
      matchFlag(c) && (!pais || c.country === pais) && inPeriodo(c) &&
      (!q || [c.name, c.tax_id, c.email, c.owner_name, c.phone].some((v) => (v || "").toLowerCase().includes(q))));
    const map: Record<string, Client[]> = {};
    STAGES.forEach((s) => (map[s.key] = []));
    pass.forEach((c) => { (map[c.stage] ?? (map[c.stage] = [])).push(c); });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0)));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, flag, pais, periodo, dataDe, dataAte, query]);

  function toggleSort(col: string) { setSort((s) => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : 1 })); }
  const SortIcon = ({ col }: { col: string }) => sort.col === col ? (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />;

  // ── ações ──
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  function ver(c: Client, e: React.MouseEvent) { stop(e); nav(`/admin/cliente/${c.id}`); }
  async function ativar(c: Client, e: React.MouseEvent) {
    stop(e); const next = (c.org_status ?? "active") === "active" ? "inactive" : "active";
    try { await api.identity.organizations.update(c.id, { status: next }); toast.ok(next === "active" ? t("Empresa ativada") : t("Empresa inativada")); reload(); }
    catch { toast.err(t("Erro ao mudar o status.")); }
  }
  async function promover(c: Client, e: React.MouseEvent) {
    stop(e);
    // Promover anda SÓ na trilha linear (Prospecto→Lead→Oportunidade→Ganho); Perdido é terminal e
    // fora da trilha — não se "promove" até Perdido. Empresa já Perdida se reabre pela ficha.
    if (c.stage === LOST_STAGE) { toast.ok(t("Empresa perdida — reabra pela ficha.")); return; }
    const idx = PIPELINE_STAGES.findIndex((s) => s.key === c.stage);
    const next = PIPELINE_STAGES[Math.min(idx + 1, PIPELINE_STAGES.length - 1)];
    if (next.key === c.stage) { toast.ok(t("Já está no último estágio.")); return; }
    try { await api.identity.organizations.setStage(c.id, next.key); toast.ok(t("Promovido para {s}", { s: t(next.label) })); reload(); }
    catch { toast.err(t("Erro ao promover.")); }
  }
  // "Permissões & acessos" da empresa → tela por-usuário (Acessar como / Reenviar / Permissões /
  // Excluir usuário) já aberta nessa empresa (deep-link `?org=`). Consolidou entrar+resetar+editar-acessos.
  function acessos(c: Client, e: React.MouseEvent) { stop(e); nav(`/admin/console/permissoes?org=${c.id}`); }
  // Excluir empresa — IRREVERSÍVEL (admin-delete-client: apaga logins + org em cascata → some tudo).
  // Confirmação por digitar o nome (delNome === delAlvo.name). Só admin (checado no backend/edge).
  async function excluirEmpresa() {
    if (!delAlvo || delNome.trim() !== (delAlvo.name || "").trim()) return;
    setDelBusy(true);
    try {
      const r = await api.identity.clients.remove(delAlvo.id);
      if (!r.ok) throw new Error(r.error || t("Falha ao excluir a empresa."));
      toast.ok(t("Empresa excluída ✓")); setDelAlvo(null); setDelNome(""); reload();
    } catch (e) { toast.err(errorMessage(e)); }
    finally { setDelBusy(false); }
  }

  async function submit() {
    if (!f.name.trim()) { setErr(t("Informe o nome da empresa.")); return; }
    setBusy(true); setErr("");
    const co = countryOf(f.country);
    let org: { id: string; name: string };
    try {
      org = await api.identity.organizations.create({
        name: f.name.trim(), stage: f.stage, country: f.country, tax_id: f.tax_id || null, tax_id_type: co.idType,
        founded_on: f.founded_on || null, website: f.website || null, owner_name: f.owner_name || null, plan: f.plan || null,
      });
    } catch (e) { setErr(t("Erro ao criar:") + " " + errorMessage(e)); setBusy(false); return; }
    if (f.whatsapp.trim()) {
      try { await api.crm.phones.add({ organization_id: org.id, label: "WhatsApp", country_code: f.ddi, number: f.whatsapp.trim(), is_primary: true }); } catch { /* opcional */ }
    }
    if (f.email.trim()) {
      try { await api.identity.users.create({ email: f.email.trim(), full_name: f.contact_name || f.owner_name || f.name, organization_id: org.id, role: "client_owner" }); } catch { /* não bloqueia */ }
    }
    setBusy(false); setOpen(false); setF({ ...EMPTY }); toast.ok(t("\"{n}\" cadastrada.", { n: f.name })); reload();
  }
  const co = countryOf(f.country);

  return (
    <div className="crmpage">
      {toast.node}
      <PageHead eyebrow="Painel Admin" title="Empresas" sub="Prospectos, leads, oportunidades, ganhos e perdidos num só lugar."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => { setF({ ...EMPTY }); setErr(""); setOpen(true); }}><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">{t("Nova empresa")}</span></button>} />

      {/* Indicadores de persona (agregado, filtra por estágio) — decisão Crasto 2026-07-27 */}
      <PersonaStats />

      {/* funil */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {[{ key: "todos", label: "Todos" }, ...STAGES].map((s) => (
          <button key={s.key} className={"stagetab" + (tab === s.key ? " on" : "")} onClick={() => setTab(s.key)} style={view === "cards" ? { opacity: 0.5 } : undefined} title={view === "cards" ? t("No modo cards, todas as etapas aparecem em colunas.") : undefined}>
            {"dot" in s && <span className="dot" style={{ background: (s as any).dot }} />}{t(s.label)} <b>{counts[s.key] ?? 0}</b>
          </button>
        ))}
        {/* alternância Lista ⇄ Cards (kanban) — decisão Crasto: lista é o padrão, cards é opcional */}
        <div style={{ marginLeft: "auto", display: "inline-flex", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-pill)", overflow: "hidden" }}>
          {([["list", List, t("Lista")], ["cards", LayoutGrid, t("Cards")]] as const).map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)} title={label}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", background: view === v ? "var(--crasto-bg-2)" : "transparent", color: view === v ? "var(--crasto-text-primary)" : "var(--crasto-text-muted)" }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* filtros cruzados */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {FLAGS.map((fl) => (
          <button key={fl.key} className="chip" onClick={() => setFlag((v) => (v === fl.key ? "" : fl.key))}
            style={{ cursor: "pointer", border: "1px solid " + (flag === fl.key ? "transparent" : "var(--crasto-border-soft)"), background: flag === fl.key ? fl.bg : "transparent", color: flag === fl.key ? fl.fg : "var(--crasto-text-body)" }}>{t(fl.label)}</button>
        ))}
        <div style={{ position: "relative" }}>
          <button className="chip" onClick={() => setFiltrosOpen((o) => !o)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid " + (filtrosAtivos ? "transparent" : "var(--crasto-border-soft)"), background: filtrosAtivos ? "var(--crasto-navy-05)" : "transparent", color: "var(--crasto-text-body)" }}>
            <Filter size={13} />{t("Filtros")}{filtrosAtivos ? ` · ${[pais ? countryOf(pais).name : null, periodoLabel].filter(Boolean).join(", ")}` : ""}<ChevronDown size={12} />
          </button>
          {filtrosOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, background: "var(--crasto-surface)", border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-md)", boxShadow: "var(--crasto-shadow-md)", padding: 14, width: 290 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><b style={{ fontSize: 13 }}>{t("Filtros")}</b><button className="iconbtn" style={{ width: 24, height: 24 }} onClick={() => setFiltrosOpen(false)}><X size={14} /></button></div>
              <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginBottom: 4 }}>{t("País")}</div>
              <select className="inp" style={{ width: "100%" }} value={pais} onChange={(e) => setPais(e.target.value)}>
                <option value="">{t("Todos os países")}</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
              <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", margin: "12px 0 4px" }}>{t("Período (por data de criação)")}</div>
              <select className="inp" style={{ width: "100%" }} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="">{t("Tudo")}</option>
                <option value="12m">{t("Últimos 12 meses")}</option>
                <option value="24m">{t("Últimos 2 anos")}</option>
                <option value="36m">{t("Últimos 3 anos")}</option>
                <option value="custom">{t("Personalizado (escolher datas)")}</option>
              </select>
              {periodo === "custom" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}>{t("De")}</div><input className="inp" type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} /></div>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}>{t("Até")}</div><input className="inp" type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} /></div>
                </div>
              )}
              <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" style={{ marginTop: 12 }} onClick={limparFiltros}><span className="crasto-btn__label">{t("Limpar filtros")}</span></button>
            </div>
          )}
        </div>
        {filtrosAtivos && <button className="chip" onClick={limparFiltros} style={{ cursor: "pointer", border: "none", color: "var(--crasto-blue)" }}>{t("Limpar filtros")}</button>}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 10, color: "var(--crasto-text-faint)" }} />
          <input className="inp" style={{ paddingLeft: 34, minWidth: 220 }} placeholder={t("Buscar por nome, CNPJ, e-mail, telefone…")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {view === "cards" ? (
        loading ? <Empty>Carregando…</Empty> : (
          <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(248px, 1fr)", gap: 12, overflowX: "auto", paddingBottom: 6, alignItems: "start" }}>
            {STAGES.map((s) => (
              <div key={s.key} style={{ background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)", padding: 10, minWidth: 248 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 4px 10px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot }} />
                  <b style={{ fontSize: 13, color: "var(--crasto-text-primary)" }}>{t(s.label)}</b>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--crasto-text-muted)", fontWeight: 600 }}>{byStage[s.key]?.length ?? 0}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(byStage[s.key] ?? []).length === 0 ? (
                    <div className="mt" style={{ padding: "6px 4px", fontSize: 12, opacity: 0.6 }}>{t("Vazio")}</div>
                  ) : (byStage[s.key] ?? []).map((c) => {
                    const cor = farolOf(c); const propVal = c.deal_value ?? (c.mrr > 0 ? c.mrr : null);
                    return (
                      <div key={c.id} className="card" onClick={() => nav(`/admin/cliente/${c.id}`)} style={{ padding: 12, cursor: "pointer", boxShadow: "var(--crasto-shadow-xs)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span title={cor ? (cor === FAROL.ok ? t("Saudável") : cor === FAROL.warn ? t("Atenção") : t("Em risco")) : t("Sem ambiente ainda")}
                            style={{ width: 9, height: 9, borderRadius: "50%", background: cor || "transparent", border: cor ? "none" : "1.5px solid var(--crasto-border)", flex: "none" }} />
                          <div style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 700, background: "linear-gradient(145deg, var(--crasto-navy), #0a2350)", flex: "none" }}>{initials(c.name)}</div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "var(--crasto-text-primary)", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                            <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.owner_name || c.email || "—"}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          {isTrial(c) && <span className="chip" style={{ background: "#FAEEDA", color: "#633806" }}>{t("Trial")}</span>}
                          {c.churned_em && <span className="chip" style={{ background: "#FCEBEB", color: "#791F1F" }}>{t("Churned")}</span>}
                          {c.lead_temperature && tempOf(c.lead_temperature) && <span className="chip" style={{ background: tempOf(c.lead_temperature)!.bg, color: tempOf(c.lead_temperature)!.fg }}>{t(tempOf(c.lead_temperature)!.label)}</span>}
                          {(c.papeis || []).filter((p) => p !== "cliente").map((p) => <span key={p} className="chip" style={{ background: "#EEEDFE", color: "#26215C" }}>{t(PAPEL_LABEL[p] || p)}</span>)}
                          {propVal != null && <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 12.5, color: "var(--crasto-text-primary)" }}>{money(propVal)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty><p><strong>{t("Nada por aqui.")}</strong> {t("Ajuste os filtros ou clique em \"Nova empresa\".")}</p></Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ cursor: "pointer", textAlign: "center" }} onClick={() => toggleSort("farol")}>{t("Farol")} <SortIcon col="farol" /></th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("name")}>{t("Empresa")} <SortIcon col="name" /></th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stage")}>{t("Categoria")} <SortIcon col="stage" /></th>
                <th>{t("Contato")}</th>
                <th>{t("Telefone")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("proposta")}>{t("Proposta")} <SortIcon col="proposta" /></th>
                <th>{t("Soluções")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("created_at")}>{t("Criado em")} <SortIcon col="created_at" /></th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("convertido_em")}>{t("Convertido em")} <SortIcon col="convertido_em" /></th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("agentes")}>{t("Agentes")} <SortIcon col="agentes" /></th>
                <th style={{ textAlign: "right" }}>{t("Ações")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const st = stageOf(c.stage); const cor = farolOf(c); const td = trialDays(c); const ag = agentesOf(c);
                const propVal = c.deal_value ?? (c.mrr > 0 ? c.mrr : null);
                return (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => nav(`/admin/cliente/${c.id}`)}>
                    <td style={{ textAlign: "center" }}>
                      <span title={cor ? (cor === FAROL.ok ? t("Saudável") : cor === FAROL.warn ? t("Atenção") : t("Em risco")) : t("Sem ambiente ainda")}
                        style={{ display: "inline-block", width: 11, height: 11, borderRadius: "50%", background: cor || "transparent", border: cor ? "none" : "1.5px solid var(--crasto-border)" }} />
                    </td>
                    <td>
                      <div className="cust"><div className="logo">{initials(c.name)}</div>
                        <div><div className="nm">{c.name}
                          {isTrial(c) && <span className="chip" style={{ marginLeft: 6, background: "#FAEEDA", color: "#633806" }}>{t("Trial")}{td != null ? ` · ${td}d` : ""}</span>}
                          {c.churned_em && <span className="chip" style={{ marginLeft: 6, background: "#FCEBEB", color: "#791F1F" }}>{t("Churned")}</span>}
                          {(c.org_status ?? "active") !== "active" && !c.churned_em && <span className="chip" style={{ marginLeft: 6 }}>{t("Inativo")}</span>}
                        </div><div className="em">{c.owner_name || c.email || "—"}</div></div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Pill tone={st.tone}>{t(st.label)}</Pill>
                        {(c.papeis || []).filter((p) => p !== "cliente").map((p) => <span key={p} className="chip" style={{ background: "#EEEDFE", color: "#26215C" }}>{t(PAPEL_LABEL[p] || p)}</span>)}
                        {c.lead_temperature && tempOf(c.lead_temperature) && <span className="chip" style={{ background: tempOf(c.lead_temperature)!.bg, color: tempOf(c.lead_temperature)!.fg }} title={t("Temperatura")}>{t(tempOf(c.lead_temperature)!.label)}</span>}
                      </div>
                    </td>
                    <td style={{ color: "var(--crasto-text-body)" }}>{c.owner_name || "—"}</td>
                    <td className="tnum" style={{ color: "var(--crasto-text-body)", whiteSpace: "nowrap" }}>{c.phone || "—"}</td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-text-primary)" }}>{propVal != null ? money(propVal) : "—"}</td>
                    <td onClick={(e) => ver(c, e)} style={{ color: "var(--crasto-blue)", whiteSpace: "nowrap", cursor: "pointer" }}>
                      {(c.modules?.length ?? 0) > 0 ? <>{c.modules!.length} {c.modules!.length === 1 ? t("solução") : t("soluções")} <ChevronRight size={12} style={{ verticalAlign: "-1px" }} /></> : "—"}
                    </td>
                    <td className="tnum" style={{ color: "var(--crasto-text-muted)", whiteSpace: "nowrap" }}>{fmtDateTime(c.created_at)}</td>
                    <td className="tnum" style={{ color: "var(--crasto-text-muted)", whiteSpace: "nowrap" }}>{fmtDateTime(c.convertido_em)}</td>
                    <td className="tnum" style={{ color: "var(--crasto-text-body)" }}>{ag != null ? ag : "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span className="rowacts">
                        <button className="iconbtn" title={t("Ver detalhes")} onClick={(e) => ver(c, e)}><Eye size={16} /></button>
                        <button className="iconbtn" title={t("Permissões & acessos (acessar como, reenviar, excluir usuário)")} onClick={(e) => acessos(c, e)}><ShieldCheck size={16} color="var(--crasto-blue)" /></button>
                        <button className="iconbtn" title={(c.org_status ?? "active") === "active" ? t("Inativar") : t("Ativar")} onClick={(e) => ativar(c, e)}><Power size={16} color={(c.org_status ?? "active") === "active" ? "#1D9E75" : "var(--crasto-text-faint)"} /></button>
                        <button className="iconbtn" title={t("Promover de estágio")} onClick={(e) => promover(c, e)}><ArrowRightLeft size={16} /></button>
                        <button className="iconbtn" title={t("Excluir empresa (irreversível)")} onClick={(e) => { stop(e); setDelAlvo(c); setDelNome(""); }}><Trash2 size={16} color="var(--crasto-red, #E74C3C)" /></button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* glossário das ações */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontSize: 11.5, color: "var(--crasto-text-muted)" }}>
        <span><Eye size={13} style={{ verticalAlign: "-2px" }} /> {t("ver detalhes")}</span>
        <span><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> {t("permissões & acessos (por usuário: acessar como, reenviar, excluir)")}</span>
        <span><Power size={13} style={{ verticalAlign: "-2px" }} /> {t("ativar / inativar")}</span>
        <span><ArrowRightLeft size={13} style={{ verticalAlign: "-2px" }} /> {t("promover de estágio")}</span>
        <span style={{ color: "var(--crasto-red, #E74C3C)" }}><Trash2 size={13} style={{ verticalAlign: "-2px" }} /> {t("excluir empresa (IRREVERSÍVEL — apaga tudo em cascata)")}</span>
      </div>

      <Modal title={t("Excluir empresa")} open={!!delAlvo} onClose={() => { setDelAlvo(null); setDelNome(""); }}
        footer={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => { setDelAlvo(null); setDelNome(""); }}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
          <button className="crasto-btn crasto-btn--sm" style={{ background: "var(--crasto-red, #E74C3C)", color: "#fff", borderColor: "transparent" }} disabled={delBusy || delNome.trim() !== (delAlvo?.name || "").trim()} onClick={excluirEmpresa}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">{delBusy ? t("Excluindo…") : t("Excluir definitivamente")}</span></button>
        </>}>
        {delAlvo && (<>
          <div className="alert alert--warn" style={{ marginBottom: 12 }}>⚠️ {t("Ação IRREVERSÍVEL. Apaga a empresa, TODOS os usuários (Portal + login) e TODOS os dados em cascata: financeiro, reuniões, módulos, histórico. Não tem lixeira.")}</div>
          <Field label={t("Para confirmar, digite o nome exato da empresa:")}><input value={delNome} onChange={(e) => setDelNome(e.target.value)} placeholder={delAlvo.name} autoFocus /></Field>
          <div className="note" style={{ marginTop: 8 }}><span>{t("Empresa")}: <b>{delAlvo.name}</b></span></div>
        </>)}
      </Modal>

      <Modal title={t("Nova empresa")} open={open} onClose={() => setOpen(false)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={submit}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Cadastrar")}</span></button></>}>
        {err && <div className="formerr">{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Categoria (estágio)"><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>{STAGES.filter((s) => s.key !== WON_STAGE && s.key !== LOST_STAGE).map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}</select></Field>
          <Field label="País"><select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value, ddi: countryOf(e.target.value).ddi })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select></Field>
        </div>
        <Field label="Nome da empresa *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("Ex.: Connect Solar Ltda")} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={co.idLabel}><input value={f.tax_id} onChange={(e) => setF({ ...f, tax_id: e.target.value })} placeholder={co.idLabel} /></Field>
          <Field label="Dono / Presidente"><input value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} placeholder={t("Nome")} /></Field>
        </div>
        <Field label="WhatsApp">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={f.ddi} onChange={(e) => setF({ ...f, ddi: e.target.value })} style={{ width: 116, flex: "none" }}>{DIAL_CODES.map((d, i) => <option key={i} value={d.ddi}>{d.flag} {d.ddi}</option>)}</select>
            <input style={{ flex: 1 }} value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder={t("(11) 91234-5678")} />
          </div>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="E-mail do responsável"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={t("cria login se preenchido")} /></Field>
          <Field label="Nome do responsável"><input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} placeholder={t("Nome")} /></Field>
        </div>
        <div className="note" style={{ marginTop: 4 }}><span>{t("Mais dados (CNPJs, filiais, pessoas, papéis, origem) você completa no detalhe da empresa.")}</span></div>
      </Modal>
    </div>
  );
}
