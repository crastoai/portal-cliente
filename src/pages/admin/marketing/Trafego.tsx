import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi } from "../../../lib/mktApi";
import { MktModal } from "./_ui";

// ============================================================================
// Tela 7 — MÍDIA PAGA (Tráfego Pago) · ROY. NATIVO no portal, ligado à marketing-api.
// Roy: RADAR REAL dos virais do segmento (YouTube) → adapta com a SUA voz (IA) →
// vira anúncio; contas de anúncio (BM), performance (ROI). Dados 100% reais:
// o radar só mostra vídeos reais; performance/virais vêm vazios até haver dado.
// Sem métricas de anúncio fabricadas (CTR/CPL não existem em vídeo orgânico).
// ============================================================================

type Ctx = { unitName?: string; cnpj?: string; segment?: string; radarSource?: boolean; adaptEngine?: boolean };
type Find = { id: string; title: string; channel?: string; url?: string; thumbnail?: string; views?: number; likes?: number; score?: number; published_at?: string; duration?: string };
type Acct = { platform: string; status?: string; validated_at?: string };

const AD_PLATFORMS = [
  { key: "meta", name: "Meta Business Manager", ic: "fb", label: "f", bg: "" },
  { key: "google", name: "Google Ads", ic: "", label: "G", bg: "#34A853" },
  { key: "tiktok", name: "TikTok Ads", ic: "tt", label: "TT", bg: "" },
  { key: "chatgpt", name: "ChatGPT Ads", ic: "", label: "✦", bg: "#10A37F", isNew: true },
];

function fmtViews(n?: number) {
  if (!n && n !== 0) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(".", ",") + "k";
  return String(n);
}
function fmtDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; }
}

export default function Trafego() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [segment, setSegment] = useState("");
  const [finds, setFinds] = useState<Find[]>([]);
  const [adaptations, setAdaptations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [campaign, setCampaign] = useState<any | null>(null);
  const [perf, setPerf] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adaptingId, setAdaptingId] = useState<string | null>(null);
  const [scriptModal, setScriptModal] = useState<{ title: string; script: string } | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3200); };

  async function loadCtx() { try { const c = await mktApi.get<Ctx>("/marketing/ads/context"); setCtx(c); if (c?.segment && !segment) setSegment(c.segment); } catch { setCtx({}); } }
  async function loadFinds() { try { setFinds(await mktApi.get<Find[]>("/marketing/ads/finds")); } catch { setFinds([]); } }
  async function loadAdapt() { try { setAdaptations(await mktApi.get<any[]>("/marketing/ads/adaptations")); } catch { setAdaptations([]); } }
  async function loadAccounts() { try { setAccounts(await mktApi.get<Acct[]>("/marketing/ads/accounts")); } catch { setAccounts([]); } }
  async function loadCampaign() { try { const c = await mktApi.get<any[]>("/marketing/ads/campaigns"); setCampaign((c || [])[0] || null); } catch { setCampaign(null); } }
  async function loadPerf() { try { setPerf(await mktApi.get<any[]>("/marketing/ads/performance")); } catch { setPerf([]); } }
  useEffect(() => { loadCtx(); loadFinds(); loadAdapt(); loadAccounts(); loadCampaign(); loadPerf(); }, []); // eslint-disable-line

  const acctStatus = (k: string) => accounts.find((a) => a.platform === k)?.status;
  const active = accounts.some((a) => a.status === "validated") || !!campaign;

  async function search() {
    setSearching(true);
    try {
      const r = await mktApi.post<{ segment: string; finds: Find[] }>("/marketing/ads/radar", { segment });
      setFinds(r.finds || []);
      flash(`Roy trouxe ${r.finds?.length || 0} virais do segmento.`);
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === "radar_source_off") flash("O radar de vídeos ainda não está ligado — já deixamos tudo pronto para ativar.");
      else if (code === "no_segment") flash("Defina o segmento (nicho) da sua unidade primeiro.");
      else flash(e?.message || "Falha ao buscar virais.");
    } finally { setSearching(false); }
  }

  async function adapt(f: Find) {
    setAdaptingId(f.id);
    try {
      const a = await mktApi.post<any>(`/marketing/ads/finds/${f.id}/adapt`, {});
      setScriptModal({ title: f.title, script: a.adapted_script || "" });
      loadAdapt();
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === "adapt_engine_off") flash("O motor de roteiro ainda não está ligado.");
      else flash(e?.message || "Falha ao gerar o roteiro.");
    } finally { setAdaptingId(null); }
  }

  async function validateAccount(k: string) {
    try { await mktApi.post(`/marketing/ads/accounts/connect`, { platform: k }); flash("Conta validada."); loadAccounts(); }
    catch (e: any) { flash(e?.message || "Falha ao validar a conta."); }
  }

  const sourceOff = ctx && ctx.radarSource === false;

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Mídia Paga (Tráfego Pago)</div>

      <div className="ap-header">
        <div className="ap-hl">
          <span className="roy-emoji">🎯</span>
          <div>
            <div className="ap-title">Roy · Tráfego Pago</div>
            <div className="ap-sub">Descobre o que já bombou no seu segmento · adapta com a sua voz · vira anúncio que vende</div>
          </div>
        </div>
        <div className="ap-hr">
          <span className={"ap-badge" + (active ? "" : " off")}>● {active ? "ATIVO" : "A CONFIGURAR"}</span>
        </div>
      </div>

      <div className="ap-grid">
        <div className="ap-main">

          {/* Radar */}
          <div className="ap-lbl">Radar de concorrência — por segmento</div>
          <div className="roy-radar">
            <div className="roy-cnpj">
              🏢 <b>{ctx?.cnpj || "CNPJ não cadastrado"}</b>
              {ctx?.segment ? <> · <span>{ctx.segment}</span></> : null}
              {ctx?.segment ? <span className="roy-pill">lido do seu cadastro</span> : null}
            </div>
            <div className="roy-search">
              <input className="roy-input" value={segment} onChange={(e) => setSegment(e.target.value)}
                placeholder="Ex.: Consultoria em IA para PME" />
              <button className="roy-b pri" style={{ width: "auto" }} disabled={searching} onClick={search}>
                {searching ? "Buscando…" : "Buscar o que está em alta"}
              </button>
            </div>
            <div className="roy-hint">💡 Roy lê o segmento do seu cadastro e vasculha o YouTube atrás dos vídeos que mais bombaram ali — depois adapta a ideia com a sua voz.</div>
          </div>

          {/* Top virais */}
          <div className="ap-lbl">Top virais do seu segmento (YouTube)</div>
          {finds.length ? finds.map((f) => (
            <div className="ap-post" key={f.id}>
              <div className="ap-thumb roy-thumb" style={f.thumbnail ? { backgroundImage: `url(${f.thumbnail})` } : undefined}>
                {f.duration ? <b>▶ {f.duration}</b> : <b>▶</b>}
                {f.score != null ? <span className="pill">nota {String(f.score).replace(".", ",")}</span> : null}
              </div>
              <div className="ap-pb">
                <div className="ap-tags">
                  <span className="ap-tag">CONCORRENTE</span>
                  <span className="ap-chip mono">{fmtViews(f.views)} views</span>
                  {f.channel ? <span className="ap-chip">{f.channel}</span> : null}
                </div>
                <div className="ap-pt">{f.title}</div>
                <div className="ap-pl">
                  {f.likes != null ? <>{fmtViews(f.likes)} curtidas · </> : null}
                  {f.published_at ? <>publicado {fmtDate(f.published_at)}</> : null}
                </div>
                <div className="ap-pf">
                  {f.url ? <a className="ap-when roy-link" href={f.url} target="_blank" rel="noreferrer">Abrir no YouTube ↗</a> : <span className="ap-when" />}
                  <span className="ap-acts">
                    <button className="roy-b pri" disabled={adaptingId === f.id} onClick={() => adapt(f)}>
                      {adaptingId === f.id ? "Adaptando…" : "Adaptar p/ mim"}
                    </button>
                  </span>
                </div>
              </div>
            </div>
          )) : (
            <div className="ap-empty">
              {sourceOff
                ? "Radar em preparação: a fonte de vídeos ainda está sendo ligada. A estrutura já está pronta — assim que ativarmos, os virais reais do seu segmento aparecem aqui."
                : "Clique em “Buscar o que está em alta” para o Roy trazer os vídeos que mais bombaram no seu segmento."}
            </div>
          )}

          {/* Adaptar para a sua voz */}
          <div className="ap-lbl">Adaptar para a sua voz (do concorrente → você)</div>
          <div className="roy-adapt">
            <div className="roy-flow">
              <div className="roy-step"><div className="rs-n">1</div><b>Fonte</b><span>viral do concorrente</span></div>
              <div className="roy-arrow">→</div>
              <div className="roy-step"><div className="rs-n">2</div><b>Entende</b><span>ideia + estrutura</span></div>
              <div className="roy-arrow">→</div>
              <div className="roy-step"><div className="rs-n">3</div><b>Reescreve</b><span>com a SUA voz</span></div>
              <div className="roy-arrow">→</div>
              <div className="roy-step"><div className="rs-n">4</div><b>Roteiro</b><span>sério e real</span></div>
            </div>
            <div className="roy-note">🎬 Roy pega o viral, entende por que funcionou e reescreve com as SUAS palavras — um roteiro sério e real pra você gravar (sem apelação) e bombar no seu segmento.</div>
          </div>

          {adaptations.length ? (
            <>
              <div className="ap-lbl">Roteiros já adaptados</div>
              {adaptations.map((a) => (
                <div className="roy-recs-item" key={a.id}>
                  <div className="rri-h">🎬 <b>{a.source_title || "Roteiro adaptado"}</b><span className="mono">{fmtDate(a.created_at)}</span></div>
                  <button className="roy-link" onClick={() => setScriptModal({ title: a.source_title || "Roteiro adaptado", script: a.adapted_script || "" })}>Ver roteiro</button>
                </div>
              ))}
            </>
          ) : null}

          {/* Contas de anúncio */}
          <div className="ap-lbl">Contas de anúncio — testar e validar (BM)</div>
          <div className="ap-accounts">
            {AD_PLATFORMS.map((p) => {
              const st = acctStatus(p.key);
              const on = st === "validated";
              return (
                <div className="ap-acc" key={p.key}>
                  <span className={"ap-ic" + (p.ic ? " " + p.ic : "")} style={p.bg ? { background: p.bg } : undefined}>{p.label}</span>
                  <div className="ap-acc-n">{p.name}{p.isNew ? <span className="roy-new">novo</span> : null}</div>
                  <div className={"ap-acc-s " + (on ? "on" : "off")}>{on ? "validado" : "não conectado"}</div>
                  {!on ? <button className="ap-connect" onClick={() => validateAccount(p.key)}>Testar &amp; validar</button> : null}
                </div>
              );
            })}
          </div>

          {/* Performance */}
          <div className="ap-lbl">Performance (ROI do tráfego pago)</div>
          {perf.length ? (
            <div className="kpi-grid roy-kpi">
              {(() => {
                const agg = perf.reduce((s: any, r: any) => { const m = r.metrics || {}; for (const k of ["invest", "roas", "cpl", "ctr", "cac", "roi"]) if (m[k] != null) { s[k] = (s[k] || 0) + Number(m[k]); s[`_n_${k}`] = (s[`_n_${k}`] || 0) + 1; } return s; }, {});
                const show = [
                  { k: "invest", l: "Investimento", pre: "R$ " }, { k: "roas", l: "ROAS", suf: "×" },
                  { k: "cpl", l: "CPL", pre: "R$ " }, { k: "ctr", l: "CTR", suf: "%" },
                  { k: "cac", l: "CAC", pre: "R$ " }, { k: "roi", l: "ROI", suf: "×" },
                ];
                return show.filter((s) => agg[s.k] != null).map((s) => {
                  const isSum = s.k === "invest";
                  const val = isSum ? agg[s.k] : agg[s.k] / (agg[`_n_${s.k}`] || 1);
                  return <div className="kpi" key={s.k}><div className="kl">{s.l}</div><div className="kv">{s.pre || ""}{Math.round(val * 10) / 10}{s.suf || ""}</div></div>;
                });
              })()}
            </div>
          ) : (
            <div className="ap-empty">Sem dados de performance ainda. Valide uma conta de anúncio e rode uma campanha — os números reais de ROI aparecem aqui.</div>
          )}
        </div>

        {/* Aside */}
        <aside className="ap-aside">
          <div className="ap-card">
            <div className="ap-ch">Quem é o Roy</div>
            <div className="ap-who">
              <span className="ap-who-ava">🎯</span>
              <div className="ap-who-body">
                <div className="ap-who-top">crasto.ai · <b>Roy</b> <span>(gestor de Tráfego Pago)</span></div>
                <div className="ap-who-row">Espiona os virais do seu segmento, adapta com a sua voz, testa e valida as contas de anúncio (BM) e otimiza CPL/ROAS — pra você vender mais.</div>
              </div>
            </div>
          </div>
          <div className="ap-card">
            <div className="ap-ch">Campanha <button className="ap-edit" onClick={() => setCfgOpen(true)}>{campaign ? "Editar" : "Criar"}</button></div>
            {campaign ? (
              <>
                <div className="ap-row"><span>Objetivo</span><b>{campaign.objective || "—"}</b></div>
                <div className="ap-row"><span>Orçamento/dia</span><b className="mono">{campaign.budget_day != null ? "R$ " + campaign.budget_day : "—"}</b></div>
                <div className="ap-row"><span>Público</span><b>{campaign.audience || "—"}</b></div>
                <div className="ap-row"><span>Redes</span><b>{(campaign.networks || []).join(" · ") || "—"}</b></div>
              </>
            ) : (
              <div className="ap-ct">Nenhuma campanha ainda. Clique em <b>Criar</b> para definir objetivo, orçamento e público — o Roy usa isso para otimizar.</div>
            )}
          </div>
          <div className="ap-card">
            <div className="ap-ch">Roy para os seus clientes</div>
            <div className="ap-ct">Roy lê o <b>plano diretor</b> de cada cliente, entende o que ele faz e adapta a estratégia de tráfego pago pra ele. Funciona pra <b>você primeiro</b> — depois você oferece o Roy como <b>serviço</b>.</div>
          </div>
        </aside>
      </div>

      {scriptModal ? (
        <MktModal title="Roteiro adaptado (na sua voz)" onClose={() => setScriptModal(null)}>
          <div className="roy-script-src">Referência: <b>{scriptModal.title}</b></div>
          <pre className="roy-script">{scriptModal.script}</pre>
        </MktModal>
      ) : null}

      {cfgOpen ? <CampaignModal current={campaign} onClose={() => setCfgOpen(false)} onSaved={() => { setCfgOpen(false); loadCampaign(); flash("Campanha salva."); }} /> : null}

      {toast ? createPortal(<div className="mkt-toast">{toast}</div>, document.body) : null}
    </div>
  );
}

function CampaignModal({ current, onClose, onSaved }: { current: any | null; onClose: () => void; onSaved: () => void }) {
  const [objective, setObjective] = useState(current?.objective || "Leads (mensagens)");
  const [budgetDay, setBudgetDay] = useState<string>(current?.budget_day != null ? String(current.budget_day) : "");
  const [audience, setAudience] = useState(current?.audience || "");
  const [networks, setNetworks] = useState<string[]>(current?.networks || ["meta"]);
  const [saving, setSaving] = useState(false);
  const NETS = [{ k: "meta", l: "Meta" }, { k: "google", l: "Google" }, { k: "tiktok", l: "TikTok" }, { k: "chatgpt", l: "ChatGPT" }];
  const toggleNet = (k: string) => setNetworks((n) => (n.includes(k) ? n.filter((x) => x !== k) : [...n, k]));

  async function save() {
    setSaving(true);
    try {
      await mktApi.post("/marketing/ads/campaigns", { objective, budgetDay: budgetDay ? Number(budgetDay) : null, audience, networks });
      onSaved();
    } catch { setSaving(false); }
  }

  return (
    <MktModal title="Campanha de tráfego pago" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" disabled={saving} onClick={save}>{saving ? "Salvando…" : "Salvar"}</button></>}>
      <div className="bkf">
        <label>Objetivo</label>
        <select value={objective} onChange={(e) => setObjective(e.target.value)}>
          <option>Leads (mensagens)</option><option>Vendas (conversão)</option><option>Alcance</option><option>Tráfego (site)</option>
        </select>
      </div>
      <div className="bkf"><label>Orçamento por dia (R$)</label><input type="number" min="0" value={budgetDay} onChange={(e) => setBudgetDay(e.target.value)} placeholder="Ex.: 40" /></div>
      <div className="bkf"><label>Público</label><input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex.: Donos de PME · BR" /></div>
      <div className="bkf">
        <label>Redes</label>
        <div className="roy-nets">{NETS.map((n) => <button key={n.k} className={"roy-net" + (networks.includes(n.k) ? " on" : "")} onClick={() => toggleNet(n.k)}>{n.l}</button>)}</div>
      </div>
    </MktModal>
  );
}
