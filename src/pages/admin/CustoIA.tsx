import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, Field, useToast, useSort, SortTh } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

// Fornecedores (códigos aceitos pelo banco) + rótulo de exibição
const PROVIDERS = [
  { v: "anthropic", label: "Anthropic" }, { v: "openai", label: "OpenAI" },
  { v: "google", label: "Google" }, { v: "deepseek", label: "DeepSeek 🔥" },
  { v: "elevenlabs", label: "ElevenLabs" }, { v: "other", label: "Outro" },
];
const providerLabel = (v?: string) => PROVIDERS.find((p) => p.v === v)?.label ?? "";
// Catálogo de plataformas de IA (produto + fornecedor + finalidade padrão)
const PLATFORMS = [
  { v: "claude_api", provider: "anthropic", label: "Claude API", kind: "cliente", purpose: "Respostas dos agentes" },
  { v: "gemini", provider: "google", label: "Gemini / AI Studio", kind: "cliente", purpose: "Respostas (alternativa)" },
  { v: "gpt", provider: "openai", label: "GPT", kind: "cliente", purpose: "Respostas (alternativa)" },
  // DeepSeek — custo estimado por AiCostSyncService.deepseek() lendo tokens do wacrm × pricing oficial.
  { v: "deepseek_api", provider: "deepseek", label: "DeepSeek 🔥", kind: "cliente", purpose: "Respostas dos agentes (mais barato)" },
  { v: "claude_code", provider: "anthropic", label: "Claude Code", kind: "interno", purpose: "Desenvolvimento da plataforma" },
  { v: "claude_cowork", provider: "anthropic", label: "Claude Cowork", kind: "interno", purpose: "Operação interna" },
  { v: "elevenlabs", provider: "elevenlabs", label: "Voz (TTS)", kind: "cliente", purpose: "Respostas em áudio" },
  { v: "other", provider: "other", label: "Outro", kind: "cliente", purpose: "" },
];
const platMeta = (v: string) => PLATFORMS.find((p) => p.v === v);
const platLabel = (row: { provider?: string; platform?: string }) => {
  const m = platMeta(row.platform || "");
  const prov = providerLabel(row.provider || m?.provider);
  const lab = m?.label || row.platform || "—";
  return prov ? `${prov} — ${lab}` : lab;
};
const monthISO = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
const monthEndISO = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
const fmtTokens = (n: number) => (!n ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));
const E_EMPTY = { id: "", organization_id: "", provider: "", platform: "claude_api", purpose: "", kind: "cliente", status: "active", tokens_in: "", tokens_out: "", cost: "", period_start: "", period_end: "" };

export default function CustoIA({ embedded }: { embedded?: boolean } = {}) {
  const t = useT();
  const [ref, setRef] = useState(() => new Date());
  const from = monthISO(ref), to = monthEndISO(ref);
  const { data, loading, reload } = useAsync(async () => {
    const [panel, orgs, gcpMap] = await Promise.all([
      services.finance.aiCost.panel(from, to),
      services.identity.organizations.listBrief(),
      services.finance.aiCost.gcpMap().catch(() => [] as any[]),
    ]);
    return { panel: panel ?? {}, orgs: (orgs as any[]) ?? [], gcpMap: (gcpMap as any[]) ?? [] };
  }, [from, to]);
  const panel = data?.panel ?? {}, orgs = data?.orgs ?? [], gcpMap = data?.gcpMap ?? [];
  const s = panel.summary ?? { total: 0, prev_total: 0, platforms: 0, clients: 0, client_cost: 0 };
  const byPlatform: any[] = panel.by_platform ?? [];
  const byClient: any[] = panel.by_client ?? [];
  const total = Number(s.total || 0), prev = Number(s.prev_total || 0);
  const deltaPct = prev > 0 ? Math.round(((total - prev) / prev) * 100) : total > 0 ? 100 : 0;
  const avgClient = Number(s.clients || 0) > 0 ? Number(s.client_cost || 0) / Number(s.clients) : 0;
  // Ordenação por coluna (padrão: maior custo primeiro) — uma instância por tabela.
  const { sort: sortP, toggle: toggleP, sorted: sortedP } = useSort("cost", -1);
  const { sort: sortC, toggle: toggleC, sorted: sortedC } = useSort("cost", -1);
  const { sort: sortL, toggle: toggleL, sorted: sortedL } = useSort("cost", -1);

  const [busy, setBusy] = useState(false);
  // Feedback com cor semântica: erro=vermelho, alerta=laranja, sucesso=verde (toast--err/warn/ok).
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...E_EMPTY });
  // FILTRO por fornecedor. '' = todos. Afeta as tabelas de plataforma/cliente/lançamentos
  // (mas o KPI "Custo total" continua mostrando o total geral pra referência).
  const [provFilter, setProvFilter] = useState<string>("");
  const provsPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const r of byPlatform) { const p = r.provider || platMeta(r.platform || "")?.provider; if (p) set.add(p); }
    return Array.from(set);
  }, [byPlatform]);
  const filtrar = <T extends { provider?: string; platform?: string }>(rows: T[]): T[] => {
    if (!provFilter) return rows;
    return rows.filter((r) => (r.provider || platMeta(r.platform || "")?.provider) === provFilter);
  };
  const byPlatformF = filtrar(byPlatform);
  const totalF = byPlatformF.reduce((s, r) => s + Number((r as any).cost || 0), 0);

  const monthLabel = useMemo(() => ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }), [ref]);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  function newRow() { const m = platMeta("claude_api")!; setF({ ...E_EMPTY, platform: "claude_api", provider: m.provider, purpose: m.purpose, kind: m.kind, period_start: from, period_end: to }); setOpen(true); }
  function editRow(r: any) {
    setF({ id: r.id, organization_id: r.organization_id || "", provider: r.provider || "", platform: r.platform || "other", purpose: r.purpose || "", kind: r.kind || "cliente", status: r.status || "active", tokens_in: String(r.tokens_in ?? ""), tokens_out: String(r.tokens_out ?? ""), cost: String(r.cost ?? ""), period_start: r.period_start || from, period_end: r.period_end || to });
    setOpen(true);
  }
  function pickPlatform(v: string) { const m = platMeta(v); setF((x: any) => ({ ...x, platform: v, provider: m?.provider ?? x.provider, purpose: x.purpose || m?.purpose || "", kind: m?.kind ?? x.kind })); }
  async function save() {
    if (!f.platform || !f.cost) { toast.warn(t("Informe a plataforma e o custo.")); return; }
    setBusy(true);
    try { await services.finance.aiCost.save({ ...f, cost: f.cost || 0, tokens_in: f.tokens_in || 0, tokens_out: f.tokens_out || 0 }); setOpen(false); reload(); toast.ok(t("Custo registrado ✓")); }
    catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }
  async function del(r: any) { if (!confirm(t("Excluir este registro de custo?"))) return; await services.finance.aiCost.remove(r.id); reload(); }
  // --- Mapeamento GCP project → cliente (custo real do Gemini por-cliente) ---
  const [newProjId, setNewProjId] = useState(""); const [newProjOrg, setNewProjOrg] = useState(""); const [newProjName, setNewProjName] = useState("");
  async function saveGcpMap(project_id: string, organization_id: string, project_name?: string | null, ignore?: boolean) {
    if (!project_id.trim()) { toast.warn(t("Informe o project_id do GCP.")); return; }
    try { await services.finance.aiCost.gcpMapSave({ project_id: project_id.trim(), organization_id: organization_id || null, project_name: project_name || null, ignore: ignore ?? undefined }); reload(); toast.ok(t("Projeto GCP salvo ✓")); }
    catch (e) { toast.err(errorMessage(e)); }
  }
  async function delGcpMap(project_id: string) {
    if (!confirm(t("Remover este mapeamento? O custo desse projeto volta a aparecer como \"Interno / plataforma\" no próximo sync."))) return;
    try { await services.finance.aiCost.gcpMapDelete(project_id); reload(); }
    catch (e) { toast.err(errorMessage(e)); }
  }
  async function addGcpMap() {
    await saveGcpMap(newProjId, newProjOrg, newProjName);
    setNewProjId(""); setNewProjOrg(""); setNewProjName("");
  }
  // As Admin keys de billing são cadastradas em Console → APIs & Chaves. Aqui só mostramos o status.
  const [bkStatus, setBkStatus] = useState<{ anthropic_admin: boolean; openai_admin: boolean; google_billing?: boolean } | null>(null);
  useEffect(() => { services.finance.aiCost.billingStatus().then(setBkStatus).catch(() => {}); }, []);
  const [syncing, setSyncing] = useState(false);
  async function sincronizar() {
    setSyncing(true);
    try {
      const r = await services.finance.aiCost.sync(from, to);
      const ok = r.resultados.filter((x) => x.ok);
      const falhas = r.resultados.filter((x) => !x.ok);
      const oks = ok.map((x) => `${x.provider}: ${Number(x.cost || 0).toFixed(2)}`);
      reload();
      if (falhas.length) toast.err([...falhas.map((x) => `${x.provider}: ${x.erro}`), ...oks].join(" · "));
      else toast.ok(oks.length ? oks.join(" · ") : t("Nada para sincronizar."));
    } catch (e) { toast.err(errorMessage(e)); } finally { setSyncing(false); }
  }
  const kindPill = (k: string) => (k === "interno" ? <Pill tone="mute">{t("Interno")}</Pill> : <Pill tone="info">{t("Cliente")}</Pill>);
  const statusPill = (st: string) => (st === "waiting_key" ? <Pill tone="warn">{t("Aguardando chave")}</Pill> : st === "internal" ? <Pill tone="mute">{t("Interno")}</Pill> : <Pill tone="ok">{t("Ativo")}</Pill>);

  return (
    <div>
      {!embedded && <PageHead eyebrow="Painel Admin · Financeiro 🔒" title="Gestão Financeira — Custo de IA"
        sub="Todos os custos de IA da Crasto.AI, por plataforma e por cliente. Clique num indicador para ir ao detalhe."
        right={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={sincronizar} disabled={syncing} title={t("Puxa o custo real das APIs de billing (Anthropic + OpenAI + Gemini)")}><span className="crasto-btn__icon"><RefreshCw size={14} className={syncing ? "spin" : ""} /></span><span className="crasto-btn__label">{syncing ? t("Sincronizando…") : t("Sincronizar custos")}</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={newRow}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Registrar custo")}</span></button>
        </>} />}
      {embedded && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={sincronizar} disabled={syncing} title={t("Puxa o custo real das APIs de billing (Anthropic + OpenAI + Gemini)")}><span className="crasto-btn__icon"><RefreshCw size={14} className={syncing ? "spin" : ""} /></span><span className="crasto-btn__label">{syncing ? t("Sincronizando…") : t("Sincronizar custos")}</span></button>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={newRow}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Registrar custo")}</span></button>
      </div>}

      {/* Status das Admin keys de billing — cadastradas em Console → APIs & Chaves */}
      <div className="note" style={{ marginBottom: 14 }}>
        <span><b>{t("Custo real automático:")}</b> Anthropic {bkStatus?.anthropic_admin ? "✓" : t("— falta a Admin key")} · OpenAI {bkStatus?.openai_admin ? "✓" : t("— falta a Admin key")} · Gemini {bkStatus?.google_billing ? "✓" : t("— falta a Service Account (Google)")}. {t("Cadastre em Console → Integrações & pagamentos (Admin keys + Google Cloud Billing) e clique em \"Sincronizar custos\".")}</span>
      </div>

      {/* seletor de período */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="icobtn" title={t("Mês anterior")} onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <strong style={{ textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{monthLabel}</strong>
        <button className="icobtn" title={t("Próximo mês")} onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
      </div>

      {/* FILTRO por fornecedor — chips clicáveis. Filtra a tabela "por plataforma" e o total
          filtrado abaixo. "Todos" volta ao geral. Aparece só quando há mais de 1 fornecedor. */}
      {provsPresentes.length > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <span className="muted" style={{ fontSize: 13 }}>{t("Filtrar por fornecedor:")}</span>
          <button className={"pill" + (!provFilter ? " pill--on" : "")} onClick={() => setProvFilter("")} style={{ cursor: "pointer" }}>{t("Todos")}</button>
          {provsPresentes.map((p) => (
            <button key={p} className={"pill" + (provFilter === p ? " pill--on" : "")} onClick={() => setProvFilter(p)} style={{ cursor: "pointer" }}>{providerLabel(p) || p}</button>
          ))}
          {provFilter && <span className="muted" style={{ fontSize: 12 }}>{t("Filtrado: {sum} — {n} plataforma(s)", { sum: money(totalF), n: byPlatformF.length })}</span>}
        </div>
      )}

      {/* indicadores (clicáveis → detalhe) */}
      <div className="kpis" style={{ marginBottom: 18 }}>
        <button className="kpi kpi-btn g" onClick={() => scrollTo("cia-plataforma")}><div className="lab">{t("Custo total (mês)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(total)}</div><div className="delta">{t("todas as plataformas")}</div></button>
        <button className="kpi kpi-btn" onClick={() => scrollTo("cia-plataforma")}><div className="lab">{t("vs mês anterior")}</div><div className="val tnum" style={{ fontSize: 22, color: deltaPct > 0 ? "#B54708" : deltaPct < 0 ? "#1F8A5B" : undefined, display: "flex", alignItems: "center", gap: 6 }}>{deltaPct > 0 ? <TrendingUp size={18} /> : deltaPct < 0 ? <TrendingDown size={18} /> : null}{deltaPct > 0 ? "+" : ""}{deltaPct}%</div><div className="delta">{money(prev)} {t("no mês passado")}</div></button>
        <button className="kpi kpi-btn" onClick={() => scrollTo("cia-plataforma")}><div className="lab">{t("Plataformas com despesa")}</div><div className="val tnum" style={{ fontSize: 22 }}>{s.platforms || 0}</div><div className="delta">{provsPresentes.length ? provsPresentes.map((p) => providerLabel(p) || p).join(" · ") : t("nenhuma")}</div></button>
        <button className="kpi kpi-btn" onClick={() => scrollTo("cia-cliente")}><div className="lab">{t("Custo médio / cliente")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(avgClient)}</div><div className="delta">{t("{n} cliente(s) com uso", { n: s.clients || 0 })}</div></button>
      </div>

      {loading ? <Empty>Carregando…</Empty> : byPlatform.length === 0 && byClient.length === 0 ? (
        <div className="card"><Empty><p><strong>{t("Nenhum custo de IA registrado neste mês.")}</strong> {t("Use \"Registrar custo\" para lançar o gasto de cada plataforma — ou aguarde a ingestão automática das APIs.")}</p></Empty></div>
      ) : (<>
        {/* por plataforma */}
        <div className="sec-h" id="cia-plataforma"><h2>{t("Custo por plataforma de IA")}</h2></div>
        <div className="tbl-wrap" style={{ marginBottom: 20 }}>
          <table className="tbl">
            <thead><tr>
              <SortTh col="platform" sort={sortP} toggle={toggleP}>{t("Plataforma")}</SortTh>
              <SortTh col="purpose" sort={sortP} toggle={toggleP}>{t("Para que serve")}</SortTh>
              <SortTh col="usage" sort={sortP} toggle={toggleP}>{t("Consumo")}</SortTh>
              <SortTh col="cost" sort={sortP} toggle={toggleP} right>{t("Custo (mês)")}</SortTh>
              <SortTh col="pct" sort={sortP} toggle={toggleP} right>{t("% do total")}</SortTh>
              <SortTh col="status" sort={sortP} toggle={toggleP}>{t("Situação")}</SortTh>
            </tr></thead>
            <tbody>
              {sortedP(byPlatformF, (r, col) => {
                switch (col) {
                  case "platform": return platLabel(r);
                  case "purpose": return r.purpose || platMeta(r.platform)?.purpose || "";
                  case "usage": return Number(r.tokens_in || 0) + Number(r.tokens_out || 0);
                  case "status": return r.status || "";
                  default: return Number(r.cost || 0);
                }
              }).map((r, i) => (
                <tr key={i}>
                  <td className="nm" style={{ fontWeight: 600 }}>{platLabel(r)}</td>
                  <td className="mt">{r.purpose || platMeta(r.platform)?.purpose || "—"}</td>
                  <td className="tnum">{fmtTokens(Number(r.tokens_in || 0) + Number(r.tokens_out || 0))} {t("tokens")}</td>
                  <td className="tnum" style={{ textAlign: "right", fontWeight: 700 }}>{money(Number(r.cost || 0))}</td>
                  <td className="tnum" style={{ textAlign: "right" }}>{total > 0 ? Math.round((Number(r.cost || 0) / total) * 100) : 0}%</td>
                  <td>{statusPill(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* por cliente */}
        <div className="sec-h" id="cia-cliente"><h2>{t("Custo por cliente")}</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <SortTh col="client" sort={sortC} toggle={toggleC}>{t("Cliente")}</SortTh>
              <SortTh col="kind" sort={sortC} toggle={toggleC}>{t("Tipo")}</SortTh>
              <SortTh col="usage" sort={sortC} toggle={toggleC}>{t("Consumo")}</SortTh>
              <SortTh col="cost" sort={sortC} toggle={toggleC} right>{t("Custo (mês)")}</SortTh>
              <SortTh col="pct" sort={sortC} toggle={toggleC} right>{t("% do total")}</SortTh>
            </tr></thead>
            <tbody>
              {(() => {
                // MERGE: clientes com custo no período + clientes com mapeamento GCP mas SEM custo ainda
                // (aguardando billing export do Google — janela ~24-48h). Assim a tela mostra os 5
                // clientes esperando em vez de ficar vazia.
                const orgsComCusto = new Set(byClient.filter((r: any) => r.organization_id).map((r: any) => r.organization_id));
                const esperando = gcpMap
                  .filter((m: any) => m.organization_id && !m.ignore && !orgsComCusto.has(m.organization_id))
                  .map((m: any) => ({ organization_id: m.organization_id, organization_name: m.organization_name || m.project_name, kind: "cliente", tokens_in: 0, tokens_out: 0, cost: 0, _waiting: true }));
                const linhas = [...byClient, ...esperando];
                return sortedC(linhas, (r, col) => {
                  switch (col) {
                    case "client": return r.organization_name || "";
                    case "kind": return r.kind || "";
                    case "usage": return Number(r.tokens_in || 0) + Number(r.tokens_out || 0);
                    default: return Number(r.cost || 0);
                  }
                }).map((r: any, i: number) => (
                  <tr key={i} style={r._waiting ? { opacity: 0.65 } : undefined}>
                    <td className="nm" style={{ fontWeight: 600 }}>{r.organization_name}</td>
                    <td>{kindPill(r.kind)}</td>
                    <td className="tnum">
                      {r._waiting
                        ? <span className="muted" style={{ fontSize: 12 }}>{t("aguardando billing export do Google (~24–48h)")}</span>
                        : <>{fmtTokens(Number(r.tokens_in || 0) + Number(r.tokens_out || 0))} {t("tokens")}</>}
                    </td>
                    <td className="tnum" style={{ textAlign: "right", fontWeight: 700 }}>{r._waiting ? "—" : money(Number(r.cost || 0))}</td>
                    <td className="tnum" style={{ textAlign: "right" }}>{r._waiting ? "—" : (total > 0 ? Math.round((Number(r.cost || 0) / total) * 100) : 0) + "%"}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        {/* lançamentos do período (editar/excluir) */}
        {(panel.rows ?? []).length > 0 && (<>
          <div className="sec-h" style={{ marginTop: 20 }}><h2>{t("Lançamentos do mês")}</h2></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <SortTh col="platform" sort={sortL} toggle={toggleL}>{t("Plataforma")}</SortTh>
                <SortTh col="client" sort={sortL} toggle={toggleL}>{t("Cliente")}</SortTh>
                <SortTh col="cost" sort={sortL} toggle={toggleL} right>{t("Custo")}</SortTh>
                <th></th>
              </tr></thead>
              <tbody>
                {sortedL(panel.rows as any[], (r, col) => {
                  switch (col) {
                    case "platform": return platLabel(r);
                    case "client": return r.organization_name || "";
                    default: return Number(r.cost || 0);
                  }
                }).map((r) => (
                  <tr key={r.id}>
                    <td>{platLabel(r)}</td>
                    <td>{r.organization_name}</td>
                    <td className="tnum" style={{ textAlign: "right" }}>{money(Number(r.cost || 0))}</td>
                    <td><div style={{ display: "flex", gap: 4 }}>
                      <button className="icobtn" title={t("Editar")} onClick={() => editRow(r)}><Pencil size={13} /></button>
                      <button className="icobtn rm" title={t("Excluir")} onClick={() => del(r)}><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </>)}

      {/* Mapa GCP project → cliente — usado pelo sync do Gemini para separar o custo por cliente.
          Sem mapeamento, o custo do projeto cai como "Interno / plataforma". */}
      <div className="sec-h" style={{ marginTop: 20 }}><h2>{t("Projetos GCP (Gemini) — mapeamento por cliente")}</h2></div>
      <div className="tbl-wrap" style={{ marginBottom: 12 }}>
        <table className="tbl">
          <thead><tr>
            <th>{t("Project ID (GCP)")}</th>
            <th>{t("Nome do projeto")}</th>
            <th>{t("Cliente (organização)")}</th>
            <th style={{ width: 80, textAlign: "center" }} title={t("Se marcado, o sync ignora este projeto (útil para chave global antiga ou projeto pessoal)")}>{t("Ignorar")}</th>
            <th style={{ width: 60 }}></th>
          </tr></thead>
          <tbody>
            {gcpMap.map((m: any) => (
              <tr key={m.project_id} style={m.ignore ? { opacity: 0.6 } : undefined}>
                <td className="mono" style={{ fontSize: 12 }}>{m.project_id}</td>
                <td>{m.project_name || "—"}</td>
                <td>
                  <select defaultValue={m.organization_id || ""} disabled={m.ignore} onChange={(e) => saveGcpMap(m.project_id, e.target.value, m.project_name)}>
                    <option value="">{t("Interno / plataforma")}</option>
                    {orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={!!m.ignore} onChange={(e) => saveGcpMap(m.project_id, m.organization_id || "", m.project_name, e.target.checked)} />
                </td>
                <td><button className="icobtn rm" title={t("Remover mapeamento")} onClick={() => delGcpMap(m.project_id)}><Trash2 size={13} /></button></td>
              </tr>
            ))}
            {gcpMap.length === 0 && <tr><td colSpan={5}><div className="muted" style={{ padding: 8 }}>{t("Nenhum projeto mapeado ainda. Cadastre o project_id do GCP (ex.: gen-lang-client-0916045718) e vincule ao cliente correspondente para separar os custos.")}</div></td></tr>}
            {/* Linha para adicionar novo */}
            <tr>
              <td><input className="inp mono" style={{ fontSize: 12, width: "100%" }} value={newProjId} onChange={(e) => setNewProjId(e.target.value)} placeholder="gen-lang-client-…" /></td>
              <td><input className="inp" style={{ width: "100%" }} value={newProjName} onChange={(e) => setNewProjName(e.target.value)} placeholder={t("Ex.: SR BRASIL CORRETORA E SEGUROS")} /></td>
              <td>
                <select value={newProjOrg} onChange={(e) => setNewProjOrg(e.target.value)}>
                  <option value="">{t("Interno / plataforma")}</option>
                  {orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </td>
              <td></td>
              <td><button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={addGcpMap} disabled={!newProjId.trim()}><span className="crasto-btn__icon"><Plus size={12} /></span></button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginBottom: 14 }}>
        <span>{t("Como funciona:")} {t("cada chave criada no AI Studio pertence a 1 projeto GCP. O sync agrupa o custo do Gemini por projeto e usa este mapa para saber o cliente. Cadastre 1× por projeto — o resto é automático a cada \"Sincronizar custos\".")}</span>
      </div>

      <div className="note" style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div><strong>{t("Causa raiz financeira:")}</strong> {t("cada valor vem do consumo real (tokens/uso) por plataforma, registrado por cliente. A ingestão automática das APIs (Anthropic, OpenAI, Google, ElevenLabs) entra numa próxima fase; por ora o lançamento é manual por período.")}</div>
      </div>

      {/* Modal registrar/editar */}
      <Modal title={f.id ? t("Editar custo de IA") : t("Registrar custo de IA")} open={open} onClose={() => setOpen(false)} wide
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        <div className="grid3">
          <Field label="Plataforma *"><select value={f.platform} onChange={(e) => pickPlatform(e.target.value)}>{PLATFORMS.map((p) => <option key={p.v} value={p.v}>{providerLabel(p.provider) ? `${providerLabel(p.provider)} — ${p.label}` : p.label}</option>)}</select></Field>
          <Field label="Fornecedor"><select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}</select></Field>
          <Field label="Finalidade"><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
        </div>
        <div className="grid3">
          <Field label="Cliente (opcional)"><select value={f.organization_id} onChange={(e) => setF({ ...f, organization_id: e.target.value })}><option value="">{t("Interno / plataforma")}</option>{orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
          <Field label="Finalidade (tipo)"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="cliente">{t("Cliente")}</option><option value="interno">{t("Interno")}</option></select></Field>
          <Field label="Situação"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">{t("Ativo")}</option><option value="internal">{t("Interno")}</option><option value="waiting_key">{t("Aguardando chave")}</option></select></Field>
        </div>
        <div className="grid3">
          <Field label="Tokens de entrada"><input type="number" value={f.tokens_in} onChange={(e) => setF({ ...f, tokens_in: e.target.value })} /></Field>
          <Field label="Tokens de saída"><input type="number" value={f.tokens_out} onChange={(e) => setF({ ...f, tokens_out: e.target.value })} /></Field>
          <Field label="Custo (R$) *"><input type="number" step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
        </div>
        <div className="grid2">
          <Field label="Início do período"><input type="date" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></Field>
          <Field label="Fim do período"><input type="date" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></Field>
        </div>
      </Modal>

      {toast.node}
    </div>
  );
}
