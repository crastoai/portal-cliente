import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, Field, useToast } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

// Fornecedores (códigos aceitos pelo banco) + rótulo de exibição
const PROVIDERS = [
  { v: "anthropic", label: "Anthropic" }, { v: "openai", label: "OpenAI" },
  { v: "google", label: "Google" }, { v: "elevenlabs", label: "ElevenLabs" }, { v: "other", label: "Outro" },
];
const providerLabel = (v?: string) => PROVIDERS.find((p) => p.v === v)?.label ?? "";
// Catálogo de plataformas de IA (produto + fornecedor + finalidade padrão)
const PLATFORMS = [
  { v: "claude_api", provider: "anthropic", label: "Claude API", kind: "cliente", purpose: "Respostas dos agentes" },
  { v: "gemini", provider: "google", label: "Gemini / AI Studio", kind: "cliente", purpose: "Respostas (alternativa)" },
  { v: "gpt", provider: "openai", label: "GPT", kind: "cliente", purpose: "Respostas (alternativa)" },
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
    const [panel, orgs] = await Promise.all([
      services.finance.aiCost.panel(from, to),
      services.identity.organizations.listBrief(),
    ]);
    return { panel: panel ?? {}, orgs: (orgs as any[]) ?? [] };
  }, [from, to]);
  const panel = data?.panel ?? {}, orgs = data?.orgs ?? [];
  const s = panel.summary ?? { total: 0, prev_total: 0, platforms: 0, clients: 0, client_cost: 0 };
  const byPlatform: any[] = panel.by_platform ?? [];
  const byClient: any[] = panel.by_client ?? [];
  const total = Number(s.total || 0), prev = Number(s.prev_total || 0);
  const deltaPct = prev > 0 ? Math.round(((total - prev) / prev) * 100) : total > 0 ? 100 : 0;
  const avgClient = Number(s.clients || 0) > 0 ? Number(s.client_cost || 0) / Number(s.clients) : 0;

  const [busy, setBusy] = useState(false);
  // Feedback com cor semântica: erro=vermelho, alerta=laranja, sucesso=verde (toast--err/warn/ok).
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ ...E_EMPTY });

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
  // As Admin keys de billing são cadastradas em Console → APIs & Chaves. Aqui só mostramos o status.
  const [bkStatus, setBkStatus] = useState<{ anthropic_admin: boolean; openai_admin: boolean } | null>(null);
  useEffect(() => { services.finance.aiCost.billingStatus().then(setBkStatus).catch(() => {}); }, []);
  const [syncing, setSyncing] = useState(false);
  async function sincronizar() {
    setSyncing(true);
    try {
      const r = await services.finance.aiCost.sync(from, to);
      const ok = r.resultados.filter((x) => x.ok);
      const falhas = r.resultados.filter((x) => !x.ok);
      const oks = ok.map((x) => `${x.provider}: US$ ${Number(x.cost || 0).toFixed(2)}`);
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
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={sincronizar} disabled={syncing} title={t("Puxa o custo real das APIs de billing (Anthropic + OpenAI)")}><span className="crasto-btn__icon"><RefreshCw size={14} className={syncing ? "spin" : ""} /></span><span className="crasto-btn__label">{syncing ? t("Sincronizando…") : t("Sincronizar custos")}</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={newRow}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Registrar custo")}</span></button>
        </>} />}
      {embedded && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={sincronizar} disabled={syncing} title={t("Puxa o custo real das APIs de billing (Anthropic + OpenAI)")}><span className="crasto-btn__icon"><RefreshCw size={14} className={syncing ? "spin" : ""} /></span><span className="crasto-btn__label">{syncing ? t("Sincronizando…") : t("Sincronizar custos")}</span></button>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={newRow}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Registrar custo")}</span></button>
      </div>}

      {/* Status das Admin keys de billing — cadastradas em Console → APIs & Chaves */}
      <div className="note" style={{ marginBottom: 14 }}>
        <span><b>{t("Custo real automático:")}</b> Anthropic {bkStatus?.anthropic_admin ? "✓" : t("— falta a Admin key")} · OpenAI {bkStatus?.openai_admin ? "✓" : t("— falta a Admin key")}. {t("Cadastre as Admin keys (billing) em Console → APIs & Chaves e clique em \"Sincronizar custos\".")}</span>
      </div>

      {/* seletor de período */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="icobtn" title={t("Mês anterior")} onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <strong style={{ textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{monthLabel}</strong>
        <button className="icobtn" title={t("Próximo mês")} onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
      </div>

      {/* indicadores (clicáveis → detalhe) */}
      <div className="kpis" style={{ marginBottom: 18 }}>
        <button className="kpi kpi-btn g" onClick={() => scrollTo("cia-plataforma")}><div className="lab">{t("Custo total (mês)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(total)}</div><div className="delta">{t("todas as plataformas")}</div></button>
        <button className="kpi kpi-btn" onClick={() => scrollTo("cia-plataforma")}><div className="lab">{t("vs mês anterior")}</div><div className="val tnum" style={{ fontSize: 22, color: deltaPct > 0 ? "#B54708" : deltaPct < 0 ? "#1F8A5B" : undefined, display: "flex", alignItems: "center", gap: 6 }}>{deltaPct > 0 ? <TrendingUp size={18} /> : deltaPct < 0 ? <TrendingDown size={18} /> : null}{deltaPct > 0 ? "+" : ""}{deltaPct}%</div><div className="delta">{money(prev)} {t("no mês passado")}</div></button>
        <button className="kpi kpi-btn" onClick={() => scrollTo("cia-plataforma")}><div className="lab">{t("Plataformas com despesa")}</div><div className="val tnum" style={{ fontSize: 22 }}>{s.platforms || 0}</div><div className="delta">{t("Claude · Gemini · GPT · Code · Cowork · TTS")}</div></button>
        <button className="kpi kpi-btn" onClick={() => scrollTo("cia-cliente")}><div className="lab">{t("Custo médio / cliente")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(avgClient)}</div><div className="delta">{t("{n} cliente(s) com uso", { n: s.clients || 0 })}</div></button>
      </div>

      {loading ? <Empty>Carregando…</Empty> : byPlatform.length === 0 && byClient.length === 0 ? (
        <div className="card"><Empty><p><strong>{t("Nenhum custo de IA registrado neste mês.")}</strong> {t("Use \"Registrar custo\" para lançar o gasto de cada plataforma — ou aguarde a ingestão automática das APIs.")}</p></Empty></div>
      ) : (<>
        {/* por plataforma */}
        <div className="sec-h" id="cia-plataforma"><h2>{t("Custo por plataforma de IA")}</h2></div>
        <div className="tbl-wrap" style={{ marginBottom: 20 }}>
          <table className="tbl">
            <thead><tr><th>{t("Plataforma")}</th><th>{t("Para que serve")}</th><th>{t("Consumo")}</th><th style={{ textAlign: "right" }}>{t("Custo (mês)")}</th><th style={{ textAlign: "right" }}>{t("% do total")}</th><th>{t("Situação")}</th></tr></thead>
            <tbody>
              {byPlatform.map((r, i) => (
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
            <thead><tr><th>{t("Cliente")}</th><th>{t("Tipo")}</th><th>{t("Consumo")}</th><th style={{ textAlign: "right" }}>{t("Custo (mês)")}</th><th style={{ textAlign: "right" }}>{t("% do total")}</th></tr></thead>
            <tbody>
              {byClient.map((r, i) => (
                <tr key={i}>
                  <td className="nm" style={{ fontWeight: 600 }}>{r.organization_name}</td>
                  <td>{kindPill(r.kind)}</td>
                  <td className="tnum">{fmtTokens(Number(r.tokens_in || 0) + Number(r.tokens_out || 0))} {t("tokens")}</td>
                  <td className="tnum" style={{ textAlign: "right", fontWeight: 700 }}>{money(Number(r.cost || 0))}</td>
                  <td className="tnum" style={{ textAlign: "right" }}>{total > 0 ? Math.round((Number(r.cost || 0) / total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* lançamentos do período (editar/excluir) */}
        {(panel.rows ?? []).length > 0 && (<>
          <div className="sec-h" style={{ marginTop: 20 }}><h2>{t("Lançamentos do mês")}</h2></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t("Plataforma")}</th><th>{t("Cliente")}</th><th style={{ textAlign: "right" }}>{t("Custo")}</th><th></th></tr></thead>
              <tbody>
                {(panel.rows as any[]).map((r) => (
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
