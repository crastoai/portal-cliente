import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi, activeUnit } from "../../../lib/mktApi";

// ============================================================================
// Tela 4 — IMAGENS & CARROSSEL (BYO-credits ChatGPT). NATIVO no portal, ligado à
// marketing-api (banco `marketing`). O cliente conecta a conta OpenAI dele e gera
// com os créditos DELE; a geração usa a identidade do Brand Kit (real). Enquanto o
// motor de imagem (DALL·E/gpt-image) não está ligado, cada peça é uma PRÉVIA na
// marca (composição client-side com as cores/fontes reais do Brand Kit) — nada de
// foto fabricada; quando o motor gravar os bytes, a imagem real aparece no lugar.
// Modais/toasts via portal. Sem jargão. Origem: protótipo IMG_*.
// ============================================================================

const FORMATS = [
  { key: "post", label: "▢ Post 1:1" },
  { key: "story", label: "▯ Story 9:16" },
  { key: "carrossel", label: "▤ Carrossel" },
];
const FALLBACK = ["#0B1A33", "#2E6F9E", "#6E9CE8"];

function lum(hex: string) {
  const h = (hex || "#000").replace("#", "");
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (hex: string) => (lum(hex) > 0.6 ? "#0B1A33" : "#FFFFFF");
function wrapLines(txt: string, per: number, max: number): string[] {
  const words = (txt || "").split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > per) { lines.push(cur.trim()); cur = w; if (lines.length >= max - 1) break; }
    else cur = (cur + " " + w).trim();
  }
  if (cur && lines.length < max) lines.push(cur.trim());
  return lines.length ? lines : ["sua mensagem aqui"];
}

// Poster na identidade da marca (SVG client-side). Prévia até o motor gravar a arte.
function Poster({ prompt, fmt, ci, slideNo, slideTot, colors, font, unitName, handle, imgUrl }: any) {
  if (imgUrl) return <div className="poster"><img src={imgUrl} alt="" />{slideTot ? <div className="slide-no">{slideNo}/{slideTot}</div> : null}</div>;
  const cols = colors && colors.length ? colors : FALLBACK;
  const n = cols.length;
  const bg = cols[ci % n], accent = cols[(ci + 2) % n], fg = onColor(bg);
  const w = fmt === "story" ? 230 : 300, h = fmt === "story" ? 400 : 300;
  const fam = font ? `'${font}', system-ui, sans-serif` : "system-ui, sans-serif";
  const lines = wrapLines(prompt || "a sua mensagem em destaque", Math.round(w / 13), 3);
  const fs = Math.round(w * 0.082);
  return (
    <div className="poster">
      <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        <rect width={w} height={h} fill={bg} />
        <circle cx={w * 0.86} cy={h * 0.84} r={w * 0.3} fill={accent} opacity="0.30" />
        <text x="22" y="34" fontFamily={fam} fontWeight="700" fontSize="14" fill={fg}>{unitName || "Sua marca"}</text>
        <rect x="22" y={h * 0.44} width="46" height="5" rx="2.5" fill={accent} />
        <text x="22" y={h * 0.44 + 30} fontFamily={fam} fontWeight="700" fontSize={fs} fill={fg}>
          {lines.map((l, i) => <tspan key={i} x="22" dy={i === 0 ? 0 : fs * 1.15}>{l}</tspan>)}
        </text>
        {handle ? <text x="22" y={h - 22} fontFamily={fam} fontSize="11" fill={fg} opacity="0.82">{handle}</text> : null}
      </svg>
      {slideTot ? <div className="slide-no">{slideNo}/{slideTot}</div> : null}
    </div>
  );
}

export default function Imagens() {
  const [unitId, setUnitId] = useState<string | null>(null);
  const [unit, setUnit] = useState<{ name?: string; handle?: string | null } | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [font, setFont] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [fmt, setFmt] = useState("post");
  const [prompt, setPrompt] = useState("");
  const [onBrand, setOnBrand] = useState(true);
  const [results, setResults] = useState<any | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [lib, setLib] = useState<any[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2400); };

  async function loadStatus() { try { const s = await mktApi.get<any>("/marketing/images/status"); setConnected(!!s.connected); } catch { setConnected(false); } }
  async function loadLib() { try { setLib(await mktApi.get<any[]>("/marketing/images/library")); } catch { setLib([]); } }
  async function loadBrand(uid: string | null) {
    if (!uid) return;
    try {
      const kit = await mktApi.get<any>("/marketing/brand-kit?unit=" + uid);
      setColors(((kit?.colors || []) as any[]).map((c) => c.hex).filter(Boolean));
      setFont(((kit?.fonts || []) as any[]).find((f) => f.role === "title")?.family || null);
    } catch { /* sem brand kit ainda → paleta neutra */ }
  }

  useEffect(() => {
    loadStatus(); loadLib();
    activeUnit().then(async (uid) => {
      setUnitId(uid);
      loadBrand(uid);
      try { const us = await mktApi.get<any[]>("/marketing/business-units"); const u = (us || []).find((x) => x.id === uid) || (us || [])[0]; if (u) setUnit({ name: u.name, handle: u.handle }); } catch { /* ok */ }
    }).catch(() => {});
  }, []);

  // injeta a Google Font do título p/ o poster mostrar a fonte real da marca
  useEffect(() => {
    if (!font) return;
    const href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(font).replace(/%20/g, "+") + ":wght@400;700&display=swap";
    let l = document.getElementById("mkt-gf-img") as HTMLLinkElement | null;
    if (!l) { l = document.createElement("link"); l.id = "mkt-gf-img"; l.rel = "stylesheet"; document.head.appendChild(l); }
    if (l.href !== href) l.href = href;
  }, [font]);

  async function connectToggle() {
    try {
      if (connected) { await mktApi.post("/marketing/images/disconnect"); flash("ChatGPT desconectado"); }
      else { await mktApi.post("/marketing/images/connect", { scope: "images", connectedBy: "portal" }); flash("ChatGPT conectado — a geração usa os seus créditos"); }
      loadStatus();
    } catch { flash("Não foi possível concluir agora. Tente novamente em instantes."); }
  }

  async function generate() {
    if (!connected) { flash("Conecte o ChatGPT para gerar."); return; }
    setGenLoading(true); setResults(null);
    try {
      const r = await mktApi.post<any>("/marketing/images/generate", { format: fmt, prompt: prompt.trim() || null, unitId, onBrand });
      setResults(r);
    } catch (e: any) {
      flash(String(e?.message || "").includes("conecte") ? "Conecte o ChatGPT para gerar." : "Não foi possível gerar agora. Tente novamente em instantes.");
    } finally { setGenLoading(false); }
  }

  async function use(id: string) {
    try { await mktApi.post("/marketing/images/" + id + "/use"); flash("Enviado para o Calendário (A agendar)"); loadLib(); }
    catch { flash("Não foi possível enviar agora. Tente novamente em instantes."); }
  }

  const brandProps = { colors, font, unitName: unit?.name, handle: unit?.handle ? "@" + String(unit.handle).replace(/^@/, "") : null };
  const total = results?.images?.length || 0;

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Produzir</div>
      <h1 className="page-title">Imagens & Carrossel</h1>
      <p className="page-sub">Gere posts, stories e carrosséis na identidade da sua marca — a IA usa o seu Brand Kit automaticamente.</p>

      {/* barra: conectar a conta (BYO-credits) */}
      {connected === null ? null : connected ? (
        <div className="img-conn on">
          <span className="c-ic">✅</span>
          <div className="c-tx"><div className="c-t">ChatGPT conectado</div><div className="c-s">A geração usa os <b>seus créditos</b> da OpenAI.</div></div>
          <button className="bk-mini" onClick={connectToggle}>Desconectar</button>
        </div>
      ) : (
        <div className="img-conn off">
          <span className="c-ic">🔌</span>
          <div className="c-tx"><div className="c-t">Conecte o ChatGPT para gerar</div><div className="c-s">As imagens são geradas com os <b>seus créditos</b> da OpenAI — você mantém o controle do custo.</div></div>
          <button className="bk-mini pri" onClick={connectToggle}>Conectar ChatGPT</button>
        </div>
      )}

      {/* gerador + aside da marca */}
      <div className="img-gen">
        <div className="img-panel">
          <div className="img-fmt">
            {FORMATS.map((f) => <button key={f.key} className={f.key === fmt ? "on" : ""} onClick={() => setFmt(f.key)}>{f.label}</button>)}
          </div>
          <div className="img-lbl">O que você quer criar?</div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex.: 5 erros de IA que a sua PME comete — post chamativo com número grande" />
          <div className="img-row">
            <button className={"img-toggle" + (onBrand ? " on" : "")} aria-label="Na identidade do meu Brand Kit" onClick={() => setOnBrand((v) => !v)} />
            <div>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>Na identidade do meu Brand Kit</div>
              <div className="img-motor">{connected ? "Pronto para gerar com os seus créditos." : "Conecte o ChatGPT para gerar (seus créditos)."}</div>
            </div>
          </div>
          <button className="bk-mini pri" style={{ width: "100%", padding: "11px 22px", fontSize: 14, opacity: connected ? 1 : 0.5, cursor: connected ? "pointer" : "not-allowed" }} disabled={!connected || genLoading} onClick={generate}>{genLoading ? "Gerando…" : "✨ Gerar imagens"}</button>
        </div>

        <aside className="img-brand">
          <div className="bh">Na identidade de</div>
          <div className="bnm">{unit?.name || "Sua marca"}</div>
          <div className="bsw">{(colors.length ? colors : FALLBACK).slice(0, 6).map((c, i) => <span key={i} style={{ background: c }} />)}</div>
          <div className="bfont" style={{ fontFamily: font ? `'${font}', system-ui, sans-serif` : undefined }}>{font ? font + " · Aa" : "Fonte da marca"}</div>
          <div className="bnote">{onBrand ? "A arte sai com as suas cores, tipografia e o seu @." : "Geração livre — sem forçar a identidade da marca."}</div>
        </aside>
      </div>

      {/* resultados */}
      {genLoading ? (
        <><div className="img-sec">Resultados</div><div className="img-load"><div className="spin" />Gerando na identidade da sua marca…</div></>
      ) : results ? (
        <>
          <div className="img-sec">Resultados</div>
          <div className="img-results">
            {(results.images || []).map((im: any, i: number) => {
              const isCarr = im.format === "carrossel";
              const ci = isCarr ? (im.slide_index ?? i) : (im.variation_index ?? i);
              const headline = isCarr && (im.slide_index ?? i) > 0 ? "Slide " + ((im.slide_index ?? i) + 1) : prompt;
              return (
                <div className="img-card" key={im.id}>
                  <Poster {...brandProps} prompt={headline} fmt={im.format} ci={ci} slideNo={(im.slide_index ?? i) + 1} slideTot={isCarr ? total : 0} imgUrl={im.url} />
                  <div className="img-acts">
                    <button className="bk-mini" onClick={generate}>Gerar de novo</button>
                    {im.url ? <a className="bk-mini" href={im.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Baixar</a> : null}
                    <button className="bk-mini pri" onClick={() => use(im.id)}>Usar → Calendário</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* biblioteca */}
      <div className="img-sec">Biblioteca</div>
      {lib == null ? (
        <div className="img-empty">Carregando…</div>
      ) : lib.length ? (
        <div className="img-lib">
          {lib.map((im: any, i: number) => (
            <Poster key={im.id} {...brandProps} prompt={im.prompt || "arte da marca"} fmt={im.format} ci={i} slideNo={1} slideTot={0} imgUrl={im.url} />
          ))}
        </div>
      ) : (
        <div className="img-empty">Nada por aqui ainda. Gere a sua primeira arte acima — ela fica salva na Biblioteca.</div>
      )}

      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}
