import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi } from "../../../lib/mktApi";
import { MktModal } from "./_ui";

// ============================================================================
// Brand Kit (tela 2) — NATIVO no portal, ligado à marketing-api (banco `marketing`).
// Paridade com o protótipo aprovado: 3 painéis (nav lateral · editor · preview vivo).
// Dados 100% reais do back (GET/PUT /marketing/brand-kit?unit=). Multi-CNPJ pelo
// seletor de unidade (business-units). Nada fictício: começa vazio e o cliente
// (ou a IA) preenche. Modais via MktModal (createPortal → sempre centralizado).
// ============================================================================

type Unit = { id: string; name: string; cnpj: string | null; handle: string | null; segment: string | null; is_default?: boolean };
type Kit = any;

const SECTIONS = [
  { id: "material", label: "Material & fontes" },
  { id: "logo", label: "Logo & identidade" },
  { id: "cores", label: "Cores" },
  { id: "tipo", label: "Tipografia" },
  { id: "voz", label: "Tom de voz" },
  { id: "posic", label: "Público & posicionamento" },
  { id: "regras", label: "Regras & compliance" },
] as const;
type SecId = (typeof SECTIONS)[number]["id"];
const CORE: SecId[] = ["logo", "cores", "tipo", "voz", "posic", "regras"];

const PRESETS = [
  { key: "geral", label: "Geral" },
  { key: "oab", label: "Advocacia (OAB)" },
  { key: "susep", label: "Seguros/Saúde (SUSEP/ANS)" },
  { key: "cfm", label: "Saúde (CFM)" },
];

const FONT_OPTIONS: Record<string, string[]> = {
  title: ["Montserrat", "Plus Jakarta Sans", "Poppins", "Sora", "Space Grotesk", "Manrope", "Playfair Display", "Instrument Serif", "Inter"],
  body: ["Inter", "Roboto", "Open Sans", "Nunito Sans", "Source Sans 3", "Lato", "Work Sans", "Manrope"],
  num: ["JetBrains Mono", "IBM Plex Mono", "Space Mono", "Fira Code", "Roboto Mono"],
};
const ROLE_LABEL: Record<string, string> = { title: "Títulos", body: "Corpo de texto", num: "Números / código" };

// Ícones da nav (SVGs do protótipo aprovado). Renderizados via dangerouslySetInnerHTML.
const SEC_ICON: Record<SecId, string> = {
  material: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  cores: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  tipo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>',
  voz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  posic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  regras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
};
// escala de neutros (fixa) — mostrada no editor de Cores, igual ao protótipo
const NEUTRALS = ["#101828", "#344054", "#667085", "#98A2B3", "#D0D5DD", "#F0F2F5"];
const fontStack = (f: string) => `'${f}', system-ui, -apple-system, sans-serif`;
const onColor = (hex: string) => {
  const h = (hex || "#000").replace("#", "");
  if (h.length < 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#0b1a33" : "#fff";
};

export default function BrandKit() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<SecId>("logo");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { kind: string }>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);   // job de leitura do site
  const [analyzing, setAnalyzing] = useState(false);
  const fileKind = useRef<string>("reference");
  const fileEl = useRef<HTMLInputElement>(null);
  const jobPoll = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (jobPoll.current) window.clearInterval(jobPoll.current); }, []);

  // carrega unidades + kit da unidade ativa
  useEffect(() => {
    mktApi.get<Unit[]>("/marketing/business-units")
      .then((us) => {
        setUnits(us || []);
        const def = (us || []).find((u) => u.is_default) || (us || [])[0];
        if (def) setUnitId(def.id);
        else setErr("Nenhuma unidade de negócio cadastrada.");
      })
      .catch((e) => setErr(e.message || "erro ao listar unidades"));
  }, []);

  useEffect(() => {
    if (!unitId) return;
    setKit(null); setErr(null);
    mktApi.get<Kit>("/marketing/brand-kit?unit=" + unitId).then(setKit).catch((e) => setErr(e.message || "erro"));
  }, [unitId]);

  // injeta as Google Fonts escolhidas p/ o preview mostrar a fonte real
  useEffect(() => {
    const fams = ((kit?.fonts || []) as any[]).map((f) => f.family).filter(Boolean);
    if (!fams.length) return;
    const href = "https://fonts.googleapis.com/css2?" + fams.map((f) => "family=" + encodeURIComponent(f).replace(/%20/g, "+") + ":wght@400;600;700").join("&") + "&display=swap";
    let l = document.getElementById("mkt-gf") as HTMLLinkElement | null;
    if (!l) { l = document.createElement("link"); l.id = "mkt-gf"; l.rel = "stylesheet"; document.head.appendChild(l); }
    if (l.href !== href) l.href = href;
  }, [kit?.fonts]);

  function flash(m: string) { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2200); }

  async function patchKit(patch: any, msg = "Salvo") {
    if (!unitId) return;
    setSaving(true);
    try { const up = await mktApi.put<Kit>("/marketing/brand-kit?unit=" + unitId, patch); setKit(up); flash(msg); }
    catch (e: any) { flash("Erro: " + (e.message || "falha ao salvar")); }
    finally { setSaving(false); }
  }

  async function approve() {
    if (!unitId) return;
    try { const r = await mktApi.post<any>("/marketing/brand-kit/approve?unit=" + unitId, { note: "Aprovado no portal" });
      flash("Aprovado — v" + r.version);
      const up = await mktApi.get<Kit>("/marketing/brand-kit?unit=" + unitId); setKit(up);
    } catch (e: any) { flash("Erro: " + (e.message || "falha ao aprovar")); }
  }

  async function exportTokens() {
    if (!unitId) return;
    try {
      const tk = await mktApi.get<any>("/marketing/brand-kit/export?unit=" + unitId + "&fmt=tokens");
      const blob = new Blob([JSON.stringify(tk, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "brand-tokens-" + (unit()?.name || "unidade") + ".json"; a.click(); URL.revokeObjectURL(a.href);
      flash("Tokens exportados (JSON)");
    } catch (e: any) { flash("Erro: " + (e.message || "falha no export")); }
  }

  function pick(kind: string) { fileKind.current = kind; fileEl.current?.click(); }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !unitId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try { await mktApi.post("/marketing/brand-kit/assets?unit=" + unitId, { kind: fileKind.current, dataUrl: reader.result });
        const up = await mktApi.get<Kit>("/marketing/brand-kit?unit=" + unitId); setKit(up); flash("Imagem enviada");
      } catch (er: any) { flash("Erro: " + (er.message || "upload falhou")); }
    };
    reader.readAsDataURL(f); e.target.value = "";
  }

  /** Lê os sites conectados e mostra o que encontrou. Nunca diz "pronto" sem resultado. */
  async function analyze() {
    if (!unitId || analyzing) return;
    const sources = (kit?.sources || []) as any[];
    if (!sources.some((s) => ["site", "ds"].includes(s.type) && s.url)) {
      flash("Adicione o endereço do seu site em “Adicionar fonte” para eu poder ler.");
      setActive("material"); return;
    }
    setAnalyzing(true); setAnalysis(null);
    try {
      const r = await mktApi.post<any>("/marketing/brand-kit/analyze?unit=" + unitId, { sourceIds: sources.map((s) => s.id) });
      pollJob(r.job.id);
    } catch (e: any) { setAnalyzing(false); flash("Não consegui iniciar a leitura: " + (e.message || "falha")); }
  }

  function pollJob(id: string) {
    if (jobPoll.current) window.clearInterval(jobPoll.current);
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const j = await mktApi.get<any>("/marketing/brand-kit/jobs/" + id);
        if (j.status === "done" || j.status === "failed") {
          window.clearInterval(jobPoll.current); jobPoll.current = undefined;
          setAnalyzing(false); setAnalysis(j);
          if (j.status === "failed") flash((j.proposal?.notes || [])[0] || "Não consegui ler o site.");
          else setModal({ kind: "analysis" });
        } else if (tries > 40) {                       // ~2 min: honesto em vez de girar pra sempre
          window.clearInterval(jobPoll.current); jobPoll.current = undefined;
          setAnalyzing(false); flash("A leitura está demorando mais que o normal — tente de novo em instantes.");
        }
      } catch { /* falha de rede: a próxima tentativa resolve */ }
    };
    jobPoll.current = window.setInterval(tick, 3000);
    tick();
  }

  async function applyAnalysis(pick: { logo: boolean; colors: string[]; fonts: string[] }) {
    if (!unitId || !analysis) return;
    try {
      const r = await mktApi.post<any>(`/marketing/brand-kit/jobs/${analysis.id}/apply?unit=` + unitId, pick);
      const up = await mktApi.get<Kit>("/marketing/brand-kit?unit=" + unitId); setKit(up);
      setModal(null);
      flash(r.applied?.length ? "Aplicado: " + r.applied.join(", ") + "." : "Nada selecionado.");
    } catch (e: any) { flash("Erro ao aplicar: " + (e.message || "falha")); }
  }

  const unit = () => units.find((u) => u.id === unitId) || null;

  // ---- helpers de dados ----
  const colors: any[] = kit?.colors || [];
  const fonts: any[] = kit?.fonts || [];
  const guidelines: any[] = kit?.guidelines || [];
  const doList = guidelines.filter((g) => g.kind === "do");
  const dontList = guidelines.filter((g) => g.kind === "dont");
  const personas: any[] = kit?.personas || [];
  const rules: any[] = kit?.rules || [];
  const blocked: any[] = kit?.blocked || [];
  const assets: any[] = kit?.assets || [];
  const sources: any[] = kit?.sources || [];
  const assetOf = (k: string) => assets.find((a) => a.kind === k);

  function status(id: SecId): "ok" | "pend" | "ai" {
    switch (id) {
      case "material": return sources.length ? "ok" : "ai";
      case "logo": return assetOf("logo_principal") ? "ok" : "pend";
      case "cores": return colors.length ? "ok" : "pend";
      case "tipo": return fonts.length ? "ok" : "pend";
      case "voz": return kit?.voice ? "ok" : "pend";
      case "posic": return kit?.audience ? "ok" : "pend";
      case "regras": return doList.length || dontList.length ? "ok" : "pend";
      default: return "pend";
    }
  }
  const pct = kit ? Math.round((CORE.filter((s) => status(s) === "ok").length / CORE.length) * 100) : 0;

  // ---------------- render ----------------
  if (err) return shell(<div className="cock-note">Não foi possível carregar o Brand Kit agora. Tente novamente em instantes.</div>);
  if (!kit) return shell(<div className="cock-note">Carregando…</div>);

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Produzir</div>
      <h1 className="page-title">Brand Kit</h1>
      <p className="page-sub">A identidade da marca que a IA usa em tudo. Suba o que você já tem — ou crie do zero — e veja a marca montada ao lado, ao vivo.</p>

      {/* barra: unidade · % · versão · export · aprovar */}
      <div className="bk-bar">
        <div className="bk-unit" onClick={() => setModal({ kind: "units" })} title="Trocar unidade de negócio">
          <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--btn-grad)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>{(unit()?.name || "?").slice(0, 1).toUpperCase()}</span>
          <span><span className="u-n">{unit()?.name || "—"}</span><span className="u-c">{unit()?.cnpj || "sem CNPJ"}</span></span>
          <span className="u-ch">▾</span>
        </div>
        <span className="bk-sp" />
        <span className="st-lbl"><b style={{ color: "var(--heading)" }}>{pct}</b>% completo</span>
        <button className="bk-ver" onClick={() => setModal({ kind: "versions" })}><span>{kit.status === "approved" ? "✓" : "◷"}</span><span className="v-n">v{kit.version || 1}</span>{kit.status === "approved" ? "aprovado" : "rascunho"}</button>
        <button className="bk-mini" onClick={exportTokens}>Exportar ▾</button>
        <button className="bk-mini pri" onClick={approve} disabled={saving}>Salvar e aprovar</button>
      </div>

      {/* hero de ingestão */}
      <div className="bk-hero">
        <span className="h-ic">✨</span>
        <div className="h-tx">
          <div className="h-t">Já tem identidade? Deixe a IA montar pra você.</div>
          <div className="h-s">Cole o site e o @, ou suba o logo / o manual de marca em PDF. A IA lê, propõe cores, tipografia, tom e regras — você só aprova.</div>
        </div>
        <div className="h-btn">
          <button className="bk-mini" onClick={() => setActive("material")}>Suba seu material</button>
          <button className="bk-mini pri" disabled={analyzing} onClick={analyze}>{analyzing ? "Lendo o site…" : "✨ Analisar e montar"}</button>
        </div>
      </div>

      {/* 3 painéis */}
      <div className="bk3">
        <div className="bk3-nav">
          {SECTIONS.map((s, i) => {
            const dot = status(s.id);
            const sep = s.id === "cores" || s.id === "posic";
            return (
              <div key={s.id}>
                {sep ? <div className="n-sep" /> : null}
                <button className={"bk3-item" + (s.id === active ? " on" : "")} onClick={() => setActive(s.id)}>
                  <span className="n-ic" dangerouslySetInnerHTML={{ __html: SEC_ICON[s.id] }} />
                  <span className="n-t">{s.label}</span>
                  <span className={"bk3-dot " + dot} title={dot === "pend" ? "a completar" : dot === "ai" ? "sugestão da IA" : "pronto"} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="bk3-ed">{editor()}</div>

        <div className="bk3-prev">{board()}</div>
      </div>

      <input ref={fileEl} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
      {modal ? modalNode() : null}
    </div>
  );

  // ---------------- editores por seção ----------------
  function editor() {
    if (active === "material") return matEditor();
    if (active === "logo") return logoEditor();
    if (active === "cores") return coresEditor();
    if (active === "tipo") return tipoEditor();
    if (active === "voz") return vozEditor();
    if (active === "posic") return posicEditor();
    return regrasEditor();
  }

  function matEditor() {
    return (
      <>
        <div className="bk3-h"><span className="e-t">Material & fontes</span></div>
        <p className="bk3-sub">O que a IA vai ler para montar sua marca: site, Instagram, WhatsApp e PDFs. Adicione fontes e clique em analisar.</p>
        <div className="bk3-card">
          {sources.length ? sources.map((s) => (
            <div className="bk-src" key={s.id}>
              <span className="s-ico">{s.type === "ig" ? "📸" : s.type === "wa" ? "💬" : s.type === "pdf" ? "📄" : "🌐"}</span>
              <span><span className="s-n">{s.url || s.type}</span><span className="s-d">{s.type}</span></span>
              <span className="bk-sp" />
              <span className={"s-tag " + (s.status === "read" ? "ok" : "pend")}>{s.status === "read" ? "lido" : "pendente"}</span>
              <button className="bk-act" style={{ marginLeft: 8 }} onClick={() => removeSource(s.id)}>remover</button>
            </div>
          )) : <div className="bk-empty"><b>Nenhuma fonte ainda</b>Adicione o site, o @ do Instagram ou um PDF para a IA ler.</div>}
          <div style={{ marginTop: 14 }}>
            <button className="bk-mini pri" disabled={analyzing} onClick={analyze}>{analyzing ? "Lendo o site…" : "✨ Analisar e montar"}</button>{" "}
            <button className="bk-mini" onClick={() => setModal({ kind: "source" })}>+ Adicionar fonte</button>
          </div>
          <div className="bk-gap" style={{ marginTop: 11 }}>A IA extrai cores, tipografia, tom e regras do que você conectar — e propõe; você aprova.</div>
        </div>
      </>
    );
  }

  function logoEditor() {
    const LABELS: Record<string, string> = { logo_principal: "Logo principal", logo_clara: "Versão clara (fundo escuro)", simbolo: "Símbolo / ícone", favicon: "Favicon" };
    const slot = (k: string, dark?: boolean) => {
      const a = assetOf(k);
      return (
        <div className={"bk-drop" + (dark ? " dark" : "") + (a ? " has" : "")} onClick={() => pick(k)}>
          <span className="d-lbl">{LABELS[k]}</span>
          {a ? <><span className="d-x" onClick={(e) => { e.stopPropagation(); delAsset(a.id); }}>×</span><img src={a.url} alt="" /></> : <><span className="d-plus">+</span><span className="d-hint">PNG, SVG ou JPG</span></>}
        </div>
      );
    };
    const refs = assets.filter((a) => a.kind === "reference");
    const u = unit();
    return (
      <>
        <div className="bk3-h"><span className="e-t">Logo & identidade</span>
          <span className={"bk-org " + (assetOf("logo_principal") ? "you" : "pend")}>{assetOf("logo_principal") ? "você enviou" : "pendente"}</span>
          <span className="bk-sp" />
          <button className="bk-act" onClick={() => setModal({ kind: "identity" })}>Editar nome e @</button>
        </div>
        <p className="bk3-sub">Suba o seu logo em algumas versões. Aparece na hora no preview ao lado.</p>
        <div className="bk3-card"><div className="bk-logos">{slot("logo_principal")}{slot("logo_clara", true)}{slot("simbolo")}{slot("favicon")}</div></div>
        <div className="bk3-card"><div className="bk-h" style={{ marginBottom: 10 }}>Nome e endereços</div>
          <div className="bk-id"><div>
            <div className="bk-name">{u?.name || "—"}</div>
            <div className="bk-sub mono">{u?.handle ? "@" + u.handle.replace(/^@/, "") : "sem @"}{u?.cnpj ? " · " + u.cnpj : ""}</div>
          </div></div>
        </div>
        <div className="bk3-card"><div className="bk-h" style={{ marginBottom: 4 }}>Imagens de referência da marca</div>
          <div className="bk-gap" style={{ marginBottom: 11 }}>Fotos, padrões, mockups — o que ajuda a IA a entender o clima visual da marca.</div>
          <div className="bk-assets">
            {refs.map((a) => <div className="bk-asset" key={a.id} style={{ backgroundImage: `url(${a.url})` }}><span className="a-x" onClick={() => delAsset(a.id)}>×</span></div>)}
            <div className="bk-asset add" onClick={() => pick("reference")}>+</div>
          </div>
        </div>
      </>
    );
  }

  function coresEditor() {
    return (
      <>
        <div className="bk3-h"><span className="e-t">Cores</span>
          <span className="bk-sp" />
          <button className="bk-act" onClick={exportTokens}>Tokens</button>
          <button className="bk-mini pri" onClick={() => setModal({ kind: "colors" })}>Editar cores</button>
        </div>
        <p className="bk3-sub">A paleta da marca. A IA usa estas cores em posts, imagens e vídeos.</p>
        <div className="bk3-card">
          <div className="bk-cgroup" style={{ marginTop: 0 }}>Cores da marca</div>
          {colors.length ? <div className="bk-colors">
            {colors.map((c, i) => <span className="bk-sw" key={i} style={{ background: c.hex, color: onColor(c.hex) }}><i>{c.name}</i><b>{c.hex}</b></span>)}
          </div> : <div className="bk-empty"><b>Sem cores ainda</b>Adicione a paleta da marca (ou deixe a IA extrair do site).</div>}
          <div className="bk-cgroup">Neutros</div>
          <div className="bk-ramp">
            {NEUTRALS.map((c, i) => <span className="bk-rc" key={i} style={{ background: c }} />)}
            <span className="bk-rc lightborder" style={{ background: "#FFFFFF" }} />
          </div>
        </div>
      </>
    );
  }

  function tipoEditor() {
    return (
      <>
        <div className="bk3-h"><span className="e-t">Tipografia</span>
          <span className="bk-sp" />
          <button className="bk-mini pri" onClick={() => setModal({ kind: "fonts" })}>Editar fontes</button>
        </div>
        <p className="bk3-sub">As fontes da marca. A IA aplica em títulos, corpo e números.</p>
        <div className="bk3-card">
          {fonts.length ? fonts.map((f, i) => (
            <div className="bk-font" key={i}><span className="f-s">{ROLE_LABEL[f.role] || f.role}</span><span className="f-n" style={{ fontFamily: fontStack(f.family) }}>{f.family}</span></div>
          )) : <div className="bk-empty"><b>Sem fontes ainda</b>Escolha as fontes de títulos, corpo e números.</div>}
        </div>
      </>
    );
  }

  function vozEditor() {
    return (
      <>
        <div className="bk3-h"><span className="e-t">Tom de voz</span>
          <span className={"bk-org " + (kit.voice ? "you" : "pend")}>{kit.voice ? "definido" : "pendente"}</span>
          <span className="bk-sp" />
          <button className="bk-mini pri" onClick={() => setModal({ kind: "voice" })}>Editar</button>
        </div>
        <p className="bk3-sub">Como a marca fala. A IA escreve todo conteúdo neste tom.</p>
        <div className="bk3-card">
          {kit.voice ? <div className="bk-voice">{kit.voice}</div> : <div className="bk-empty"><b>Tom não definido</b>Descreva como a marca fala (ex.: especialista, direta, sem jargão).</div>}
        </div>
      </>
    );
  }

  function posicEditor() {
    return (
      <>
        <div className="bk3-h"><span className="e-t">Público & posicionamento</span>
          <span className="bk-sp" />
          <button className="bk-mini pri" onClick={() => setModal({ kind: "aud" })}>Editar</button>
        </div>
        <p className="bk3-sub">Para quem a marca fala e qual a promessa central.</p>
        <div className="bk3-card"><div className="bk-h" style={{ marginBottom: 8 }}>Público-alvo</div>
          {kit.audience ? <div className="bk-txt">{kit.audience}</div> : <span style={{ color: "var(--muted-2)", fontSize: 13 }}>Ainda não definido.</span>}
          {personas.length ? <div className="bk-rows" style={{ marginTop: 12 }}>{personas.map((p, i) => (
            <div className="bk-row" key={i}><div style={{ flex: 1 }}><div className="rw-t">{p.title}</div><div className="rw-d">Dor: {p.description}</div></div></div>
          ))}</div> : null}
          <div style={{ marginTop: 10 }}><button className="bk-act" onClick={() => setModal({ kind: "personas" })}>Editar personas</button></div>
        </div>
        <div className="bk3-card"><div className="bk-h" style={{ marginBottom: 8 }}>Promessa da marca <button className="bk-act" style={{ marginLeft: 6 }} onClick={() => setModal({ kind: "promise" })}>Editar</button></div>
          <div className="bk-txt">{kit.brand_promise || <span style={{ color: "var(--muted-2)" }}>Uma frase: o que a marca entrega de mais valioso.</span>}</div>
        </div>
      </>
    );
  }

  function regrasEditor() {
    const li = (a: any[]) => a.map((x, i) => <li key={i}>{x.text}</li>);
    return (
      <>
        <div className="bk3-h"><span className="e-t">Regras & compliance</span></div>
        <p className="bk3-sub">O que sempre fazer, o que nunca fazer, e as regras que a IA é obrigada a respeitar (compliance por setor).</p>
        <div className="bk3-card">
          <div className="bk-sub-h"><span className="sh-t">✅ Sempre · ❌ Nunca</span><span className="bk-sp" />
            <button className="bk-act" onClick={() => setModal({ kind: "do" })}>Editar Sempre</button>
            <button className="bk-act" onClick={() => setModal({ kind: "dont" })}>Editar Nunca</button>
          </div>
          {doList.length || dontList.length ? (
            <div className="bk-dodont">
              <div className="bk-do"><div className="bk-dh do">✅ Sempre</div><ul>{li(doList)}</ul></div>
              <div className="bk-do"><div className="bk-dh dont">❌ Nunca</div><ul>{li(dontList)}</ul></div>
            </div>
          ) : <div className="bk-empty"><b>Sem regras de estilo ainda</b>Defina o que a marca sempre e nunca faz.</div>}
        </div>
        <div className="bk3-card warn">
          <div className="bk-sub-h"><span className="sh-t" style={{ color: "var(--coral)" }}>⚠️ Compliance</span></div>
          <div className="bk-gap" style={{ marginBottom: 10 }}>Setor da marca (define as regras obrigatórias que a IA nunca viola):</div>
          <div className="bk-presets">
            {PRESETS.map((p) => <button key={p.key} className={"bk-preset" + (p.key === kit.compliance_preset ? " on" : "")} onClick={() => patchKit({ compliance_preset: p.key }, "Setor: " + p.label)}>{p.label}</button>)}
          </div>
          {rules.length ? <div className="bk-rules">{rules.map((r, i) => <div className="bk-rule" key={i}><span className="r-x">✕</span><span>{r.text}</span><span className="r-src">{r.source}</span></div>)}</div> : null}
          {blocked.length ? <div className="bk-blocked"><b>Bloqueado:</b> <s>{blocked[0].text}</s><br />Motivo: {blocked[0].reason}.</div> : null}
          <div className="bk-gap" style={{ marginTop: 11 }}>A IA respeita estas regras automaticamente em todo conteúdo — e avisa antes de publicar algo que as contrarie.</div>
        </div>
      </>
    );
  }

  // ---------------- preview / brand board ----------------
  function board() {
    const logoLight = assetOf("logo_principal");
    const logoDark = assetOf("logo_clara") || assetOf("logo_principal");
    const titleF = fonts.find((f) => f.role === "title")?.family;
    const bodyF = fonts.find((f) => f.role === "body")?.family;
    const c0 = colors[0]?.hex || "#0B1A33";
    const uname = unit()?.name || "Sua marca";
    const miniLogo = logoDark ? <img src={logoDark.url} alt="" style={{ maxHeight: 24 }} /> : <span style={{ color: onColor(c0), fontWeight: 700, fontSize: 13 }}>{uname.slice(0, 16)}</span>;
    return (
      <div className="bk-board">
        <div className="bd-h"><span className="live" />Sua marca</div>
        <div className="bd-logos">
          <div className="bd-logo light">{logoLight ? <img src={logoLight.url} alt="" /> : <span className="ph">logo principal</span>}</div>
          <div className="bd-logo dark">{logoDark ? <img src={logoDark.url} alt="" /> : <span className="ph">logo claro</span>}</div>
        </div>
        <div className="bd-sec"><div className="bd-lbl">Marca</div>
          {colors.length ? <div className="bd-sw">{colors.map((c, i) => <span key={i} style={{ background: c.hex }} />)}</div> : <span className="ph" style={{ fontSize: 11, color: "var(--muted-2)" }}>sem cores</span>}
        </div>
        <div className="bd-sec" style={{ paddingTop: 0 }}><div className="bd-lbl">Tipografia</div>
          <div className="bd-type"><div className="t-h" style={{ fontFamily: titleF ? fontStack(titleF) : undefined, color: c0 }}>{uname}</div>
            <div className="t-b" style={{ fontFamily: bodyF ? fontStack(bodyF) : undefined }}>Texto de corpo na fonte da marca — o parágrafo que a IA usa nas peças.</div></div>
        </div>
        {kit.voice ? <div className="bd-sec" style={{ paddingTop: 0 }}><div className="bd-lbl">Tom de voz</div><div className="bd-voice" style={{ borderColor: colors[2]?.hex || colors[1]?.hex || "var(--blue-2)" }}>{kit.voice}</div></div> : null}
        <div className="bd-sec" style={{ paddingTop: 0 }}><div className="bd-lbl">Aplicada</div>
          <div className="bd-card">
            <div className="c-top" style={{ background: c0 }}>
              <span style={{ maxHeight: 26, display: "flex", alignItems: "center" }}>{miniLogo}</span>
              <span className="c-nm" style={{ color: onColor(c0), fontFamily: titleF ? fontStack(titleF) : undefined }}>{uname}</span>
            </div>
            <div className="c-bd">Prévia de como a marca aparece aplicada — logo, cor e fonte juntos.</div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- modais (todos via MktModal / createPortal) ----------------
  function modalNode() {
    const k = modal!.kind;
    if (k === "units") return (
      <MktModal title="Trocar unidade de negócio" onClose={() => setModal(null)}>
        {units.map((u) => (
          <button key={u.id} className="bkc-slot" style={{ width: "100%", marginBottom: 8 }} onClick={() => { setUnitId(u.id); setModal(null); }}>
            <span className="bkc-chip" style={{ background: "var(--btn-grad)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>{u.name.slice(0, 1).toUpperCase()}</span>
            <span className="sl-t"><span className="sl-n">{u.name}{u.id === unitId ? " ·  (atual)" : ""}</span><span className="sl-h">{u.cnpj || "sem CNPJ"}</span></span>
          </button>
        ))}
      </MktModal>
    );
    if (k === "versions") return <VersionsModal unitId={unitId!} onClose={() => setModal(null)} />;
    if (k === "identity") return <IdentityModal unit={unit()!} onClose={() => setModal(null)} onSave={saveIdentity} />;
    if (k === "source") return <SourceModal onClose={() => setModal(null)} onAdd={addSource} />;
    if (k === "analysis") return <AnalysisModal job={analysis} onClose={() => setModal(null)} onApply={applyAnalysis} />;
    if (k === "colors") return <ColorsModal colors={colors} onClose={() => setModal(null)} onSave={(cs) => { patchKit({ colors: cs }, "Cores salvas"); setModal(null); }} />;
    if (k === "fonts") return <FontsModal fonts={fonts} onClose={() => setModal(null)} onSave={(fs) => { patchKit({ fonts: fs }, "Fontes salvas"); setModal(null); }} />;
    if (k === "voice") return <TextModal title="Tom de voz" value={kit.voice || ""} placeholder="ex.: Especialista sério, direto, prova com número. Nunca jargão sem explicar." onClose={() => setModal(null)} onSave={(v) => { patchKit({ voice: v }, "Tom salvo"); setModal(null); }} />;
    if (k === "aud") return <TextModal title="Público-alvo" value={kit.audience || ""} placeholder="ex.: Donos de PME 35-55 que perdem lead por não responder rápido." onClose={() => setModal(null)} onSave={(v) => { patchKit({ audience: v }, "Público salvo"); setModal(null); }} />;
    if (k === "promise") return <TextModal title="Promessa da marca" value={kit.brand_promise || ""} placeholder="ex.: Implantar IA com segurança — e ver o retorno em ~30 dias." onClose={() => setModal(null)} onSave={(v) => { patchKit({ brand_promise: v }, "Promessa salva"); setModal(null); }} />;
    if (k === "personas") return <ListModal title="Personas" cols={["title", "description"]} labels={["Título", "Dor / contexto"]} rows={personas} onClose={() => setModal(null)} onSave={(rows) => { patchKit({ personas: rows }, "Personas salvas"); setModal(null); }} />;
    if (k === "do" || k === "dont") {
      const cur = (k === "do" ? doList : dontList).map((g) => ({ text: g.text }));
      return <ListModal title={k === "do" ? "✅ Sempre fazer" : "❌ Nunca fazer"} cols={["text"]} labels={["Regra"]} rows={cur} onClose={() => setModal(null)}
        onSave={(rows) => {
          const other = (k === "do" ? dontList : doList).map((g) => ({ kind: g.kind, text: g.text }));
          const mine = rows.filter((r) => r.text).map((r) => ({ kind: k, text: r.text }));
          patchKit({ guidelines: [...other, ...mine] }, "Regras salvas"); setModal(null);
        }} />;
    }
    return null;
  }

  // ---------------- ações de fonte de ingestão / assets ----------------
  async function addSource(type: string, url: string) {
    if (!unitId) return;
    try { await mktApi.post("/marketing/brand-kit/sources?unit=" + unitId, { type, url });
      const up = await mktApi.get<Kit>("/marketing/brand-kit?unit=" + unitId); setKit(up); flash("Fonte adicionada"); setModal(null);
    } catch (e: any) { flash("Erro: " + (e.message || "falha")); }
  }
  async function saveIdentity(name: string, handle: string) {
    if (!unitId) return;
    try {
      await mktApi.patch("/marketing/business-units/" + unitId, { name, handle: handle.replace(/^@/, "") || null });
      const us = await mktApi.get<Unit[]>("/marketing/business-units"); setUnits(us || []);
      flash("Identidade salva"); setModal(null);
    } catch (e: any) { flash("Erro: " + (e.message || "falha ao salvar")); }
  }
  async function removeSource(id: string) {
    try { await mktApi.del("/marketing/brand-kit/sources/" + id);
      const up = await mktApi.get<Kit>("/marketing/brand-kit?unit=" + unitId); setKit(up); flash("Fonte removida");
    } catch (e: any) { flash("Erro: " + (e.message || "falha")); }
  }
  async function delAsset(id: string) {
    try {
      await mktApi.del("/marketing/brand-kit/assets/" + id);
      const up = await mktApi.get<Kit>("/marketing/brand-kit?unit=" + unitId); setKit(up); flash("Imagem removida");
    } catch (e: any) { flash("Erro: " + (e.message || "falha ao remover")); }
  }

  function shell(inner: React.ReactNode) {
    return (
      <div className="mkt-root">
        <div className="eyebrow">Marketing · Produzir</div>
        <h1 className="page-title">Brand Kit</h1>
        {inner}
      </div>
    );
  }
}

// ============================== sub-modais ==============================
function VersionsModal({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { mktApi.get<any[]>("/marketing/brand-kit/versions?unit=" + unitId).then(setRows).catch(() => setRows([])); }, [unitId]);
  return (
    <MktModal title="Histórico de versões" onClose={onClose}>
      {!rows ? <div style={{ color: "var(--muted)" }}>carregando…</div> :
        rows.length ? rows.map((v, i) => (
          <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <b style={{ color: "var(--heading)" }}>v{v.version}</b> · <span style={{ color: "var(--muted)" }}>{v.changed_at} · {v.author}</span>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{v.note}</div>
          </div>
        )) : <div style={{ color: "var(--muted-2)" }}>Sem versões aprovadas ainda. Clique em “Salvar e aprovar” para gerar a v1.</div>}
    </MktModal>
  );
}

function IdentityModal({ unit, onClose, onSave }: { unit: Unit; onClose: () => void; onSave: (name: string, handle: string) => void }) {
  const [name, setName] = useState(unit?.name || "");
  const [handle, setHandle] = useState(unit?.handle ? "@" + unit.handle.replace(/^@/, "") : "");
  return (
    <MktModal title="Nome e @" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" onClick={() => onSave(name.trim(), handle.trim())} disabled={!name.trim()}>Salvar</button></>}>
      <div className="bkf"><label>Nome da marca / unidade</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Crasto.AI" /></div>
      <div className="bkf"><label>@ (Instagram / handle)</label><input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@suamarca" /></div>
      <div style={{ fontSize: 12, color: "var(--muted-2)", lineHeight: 1.5 }}>O nome e o @ aparecem no preview da marca e são usados pela IA nas peças.</div>
    </MktModal>
  );
}

function SourceModal({ onClose, onAdd }: { onClose: () => void; onAdd: (type: string, url: string) => void }) {
  const [type, setType] = useState("site");
  const [url, setUrl] = useState("");
  return (
    <MktModal title="Adicionar fonte" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" onClick={() => onAdd(type, url)} disabled={!url}>Adicionar</button></>}>
      <div className="bkf"><label>Tipo</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="site">Site</option><option value="ds">Design system</option><option value="ig">Instagram (@)</option><option value="wa">WhatsApp</option><option value="pdf">PDF (URL)</option>
        </select>
      </div>
      <div className="bkf"><label>Endereço</label><input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={type === "ig" ? "@suamarca" : "https://…"} /></div>
    </MktModal>
  );
}

/** O que a leitura do site encontrou — o cliente escolhe o que vira o Brand Kit dele. */
function AnalysisModal({ job, onClose, onApply }: { job: any; onClose: () => void; onApply: (p: { logo: boolean; colors: string[]; fonts: string[] }) => void }) {
  const p = job?.proposal || {};
  const colors: any[] = p.colors || [];
  const fonts: any[] = p.fonts || [];
  const notes: string[] = p.notes || [];
  const sources: any[] = p.sources || [];
  const [useLogo, setUseLogo] = useState(!!p.logo);
  const [onCol, setOnCol] = useState<boolean[]>(() => colors.map((_, i) => i < 6));
  const [onFnt, setOnFnt] = useState<boolean[]>(() => fonts.map(() => true));
  const nada = !p.logo && !colors.length && !fonts.length;
  const nSel = (useLogo ? 1 : 0) + onCol.filter(Boolean).length + onFnt.filter(Boolean).length;
  const lbl = { title: "Títulos", body: "Corpo", num: "Números / código" } as Record<string, string>;

  return (
    <MktModal title="O que encontrei na sua marca" onClose={onClose} wide
      footer={<>
        <button className="bk-mini" onClick={onClose}>Fechar</button>
        <button className="bk-mini pri" disabled={!nSel} onClick={() => onApply({
          logo: useLogo,
          colors: colors.filter((_, i) => onCol[i]).map((c) => c.hex),      // só a seleção: os valores saem da proposta no servidor
          fonts: fonts.filter((_, i) => onFnt[i]).map((f) => f.family),
        })}>Aplicar ao meu Brand Kit</button>
      </>}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
        {sources.map((s, i) => (
          <div key={i}>{s.ok ? "✅" : "⚠️"} {s.url}{s.ok ? "" : ` — ${s.reason || "não consegui ler"}`}</div>
        ))}
      </div>

      {notes.length ? (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
          {notes.map((n, i) => <div key={i}>• {n}</div>)}
        </div>
      ) : null}

      {nada ? (
        <div style={{ fontSize: 13.5, color: "var(--text)" }}>Não consegui extrair identidade desse endereço. Suba o seu logo e defina as cores à mão — leva 2 minutos.</div>
      ) : null}

      {p.logo ? (
        <>
          <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", margin: "4px 0 8px" }}>Logo encontrado</div>
          <label style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", marginBottom: 16 }}>
            <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
            <span style={{ width: 96, height: 64, display: "grid", placeItems: "center", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 10, overflow: "hidden" }}>
              {p.logo.url ? <img src={p.logo.url} alt="" style={{ maxWidth: "84%", maxHeight: "84%", objectFit: "contain" }} /> : "—"}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{p.logo.from}<br /><span style={{ fontSize: 11 }}>vira o seu logo principal</span></span>
          </label>
        </>
      ) : null}

      {colors.length ? (
        <>
          <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", margin: "4px 0 8px" }}>Cores ({onCol.filter(Boolean).length} de {colors.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {colors.map((c, i) => (
              <button key={c.hex} onClick={() => setOnCol((v) => v.map((x, j) => (j === i ? !x : x)))}
                title={c.name || c.hex}
                style={{ border: onCol[i] ? "2px solid var(--blue-3)" : "1px solid var(--border-2)", background: "var(--surface)", borderRadius: 10, padding: 6, cursor: "pointer", display: "grid", gap: 4, justifyItems: "center", width: 92, opacity: onCol[i] ? 1 : 0.45 }}>
                <span style={{ width: "100%", height: 34, borderRadius: 6, background: c.hex, border: "1px solid rgba(0,0,0,.12)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text)" }}>{c.hex}</span>
                {c.name ? <span style={{ fontSize: 9.5, color: "var(--muted)", lineHeight: 1.2, textAlign: "center" }}>{c.name}</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {fonts.length ? (
        <>
          <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", margin: "4px 0 8px" }}>Tipografia</div>
          <div style={{ display: "grid", gap: 8 }}>
            {fonts.map((f, i) => (
              <label key={f.family} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "9px 12px" }}>
                <input type="checkbox" checked={!!onFnt[i]} onChange={() => setOnFnt((v) => v.map((x, j) => (j === i ? !x : x)))} />
                <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{f.family}</span>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{lbl[f.role] || f.role}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}
    </MktModal>
  );
}

function TextModal({ title, value, placeholder, onClose, onSave }: { title: string; value: string; placeholder?: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <MktModal title={title} onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" onClick={() => onSave(v.trim())}>Salvar</button></>}>
      <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} rows={5}
        style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "11px 13px", color: "var(--text)", fontFamily: "var(--font-ui)", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical" }} />
    </MktModal>
  );
}

function ListModal({ title, cols, labels, rows, onClose, onSave }: { title: string; cols: string[]; labels: string[]; rows: any[]; onClose: () => void; onSave: (rows: any[]) => void }) {
  const [list, setList] = useState<any[]>(rows.length ? rows.map((r) => ({ ...r })) : [Object.fromEntries(cols.map((c) => [c, ""]))]);
  const set = (i: number, c: string, val: string) => setList((l) => l.map((r, j) => (j === i ? { ...r, [c]: val } : r)));
  const inputStyle = { width: "100%", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "9px 12px", color: "var(--text)", fontFamily: "var(--font-ui)", fontSize: 14, outline: "none", boxSizing: "border-box" as const };
  return (
    <MktModal title={title} onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" onClick={() => onSave(list.filter((r) => cols.some((c) => (r[c] || "").trim())))}>Salvar</button></>}>
      {list.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9, alignItems: "flex-start" }}>
          <div style={{ flex: 1, display: "grid", gap: 6 }}>
            {cols.map((c, ci) => <input key={c} type="text" value={r[c] || ""} placeholder={labels[ci]} onChange={(e) => set(i, c, e.target.value)} style={inputStyle} />)}
          </div>
          <button className="bk-act" style={{ marginTop: 2 }} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="bk-add" onClick={() => setList((l) => [...l, Object.fromEntries(cols.map((c) => [c, ""]))])}>+ Adicionar</button>
    </MktModal>
  );
}

function ColorsModal({ colors, onClose, onSave }: { colors: any[]; onClose: () => void; onSave: (cs: any[]) => void }) {
  const [list, setList] = useState<any[]>(colors.length ? colors.map((c) => ({ name: c.name, hex: c.hex })) : [{ name: "", hex: "#111111" }]);
  const set = (i: number, key: string, val: string) => setList((l) => l.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  const inputStyle = { background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "9px 12px", color: "var(--text)", fontFamily: "var(--font-ui)", fontSize: 14, outline: "none", boxSizing: "border-box" as const };
  return (
    <MktModal title="Editar cores" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" onClick={() => onSave(list.filter((c) => c.hex))}>Salvar</button></>}>
      {list.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9, alignItems: "center" }}>
          <input type="color" value={c.hex} onChange={(e) => set(i, "hex", e.target.value)} style={{ width: 44, height: 42, padding: 2, border: "1px solid var(--border-2)", borderRadius: 10, background: "var(--surface-2)", cursor: "pointer" }} />
          <input type="text" value={c.name} placeholder="Nome (ex.: Navy)" onChange={(e) => set(i, "name", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input type="text" value={c.hex} onChange={(e) => set(i, "hex", e.target.value)} style={{ ...inputStyle, width: 96, fontFamily: "var(--font-mono)", textTransform: "uppercase" }} />
          <button className="bk-act" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="bk-add" onClick={() => setList((l) => [...l, { name: "", hex: "#808080" }])}>+ Adicionar cor</button>
    </MktModal>
  );
}

function FontsModal({ fonts, onClose, onSave }: { fonts: any[]; onClose: () => void; onSave: (fs: any[]) => void }) {
  const initial = (role: string) => fonts.find((f) => f.role === role)?.family || FONT_OPTIONS[role][0];
  const [title, setTitle] = useState(initial("title"));
  const [body, setBody] = useState(initial("body"));
  const [num, setNum] = useState(initial("num"));
  const selStyle = { width: "100%", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "10px 13px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" as const, cursor: "pointer" };
  const row = (role: string, val: string, set: (v: string) => void) => (
    <div className="bkf" key={role}><label>{ROLE_LABEL[role]}</label>
      <select value={val} onChange={(e) => set(e.target.value)} style={selStyle}>{FONT_OPTIONS[role].map((f) => <option key={f} value={f}>{f}</option>)}</select>
      <div style={{ fontFamily: fontStack(val), fontSize: 20, color: "var(--heading)", marginTop: 8 }}>{val} · Aa Bb 123</div>
    </div>
  );
  return (
    <MktModal title="Editar fontes" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" onClick={() => onSave([{ role: "title", family: title, source: "google" }, { role: "body", family: body, source: "google" }, { role: "num", family: num, source: "google" }])}>Salvar</button></>}>
      {row("title", title, setTitle)}{row("body", body, setBody)}{row("num", num, setNum)}
    </MktModal>
  );
}
