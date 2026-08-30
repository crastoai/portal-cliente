import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi, activeUnit } from "../../../lib/mktApi";

// ============================================================================
// Tela 4 — IMAGENS & CARROSSEL. NATIVO no portal, ligado à marketing-api.
// Motor REAL de imagem = Gemini "Nano Banana Pro" (a Crasto provê; sem conexão
// do cliente). A geração usa a identidade do Brand Kit (cores/fonte/voz + logo)
// → imagem na marca. Cada peça leva ~20-30s, então a geração é ASSÍNCRONA: o
// servidor devolve na hora e as artes aparecem progressivamente (polling).
// Enquanto a arte não chega, mostra uma prévia na marca (SVG). Sem jargão.
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

// Peça: imagem real (quando pronta) OU prévia na identidade da marca (enquanto gera).
function Poster({ prompt, fmt, ci, slideNo, slideTot, colors, font, unitName, handle, imgUrl, loading }: any) {
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
      {loading ? <div className="img-genning"><div className="spin" />gerando…</div> : null}
      {slideTot ? <div className="slide-no">{slideNo}/{slideTot}</div> : null}
    </div>
  );
}

export default function Imagens() {
  const [unitId, setUnitId] = useState<string | null>(null);
  const [unit, setUnit] = useState<{ name?: string; handle?: string | null } | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [font, setFont] = useState<string | null>(null);
  const [engine, setEngine] = useState<{ enabled: boolean; used?: number; cap?: number } | null>(null);
  const [fmt, setFmt] = useState("post");
  const [prompt, setPrompt] = useState("");
  const [onBrand, setOnBrand] = useState(true);
  const [results, setResults] = useState<any | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lib, setLib] = useState<any[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<number | undefined>(undefined);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };

  async function loadStatus() { try { const s = await mktApi.get<any>("/marketing/images/status"); setEngine({ enabled: !!s.enabled, used: s.used_this_month, cap: s.monthly_cap }); } catch { setEngine({ enabled: false }); } }
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
      setUnitId(uid); loadBrand(uid);
      try { const us = await mktApi.get<any[]>("/marketing/business-units"); const u = (us || []).find((x) => x.id === uid) || (us || [])[0]; if (u) setUnit({ name: u.name, handle: u.handle }); } catch { /* ok */ }
    }).catch(() => {});
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!font) return;
    const href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(font).replace(/%20/g, "+") + ":wght@400;700&display=swap";
    let l = document.getElementById("mkt-gf-img") as HTMLLinkElement | null;
    if (!l) { l = document.createElement("link"); l.id = "mkt-gf-img"; l.rel = "stylesheet"; document.head.appendChild(l); }
    if (l.href !== href) l.href = href;
  }, [font]);

  function startPoll(genId: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let tries = 0;
    setProcessing(true);
    pollRef.current = window.setInterval(async () => {
      tries++;
      try {
        const r = await mktApi.get<any>("/marketing/images/generations/" + genId);
        setResults({ generation: r.generation, images: r.images });
        const done = (r.images || []).every((im: any) => im.url);
        if ((r.generation && r.generation.status === "done") || done || tries > 45) {
          window.clearInterval(pollRef.current); pollRef.current = undefined;
          setProcessing(false); loadLib(); loadStatus();
        }
      } catch { /* mantém tentando até o teto de tentativas */ if (tries > 45) { window.clearInterval(pollRef.current); setProcessing(false); } }
    }, 4000);
  }

  async function generate() {
    if (!engine?.enabled) { flash("Gerador de imagens em configuração."); return; }
    setGenBusy(true); setResults(null);
    try {
      const r = await mktApi.post<any>("/marketing/images/generate", { format: fmt, prompt: prompt.trim() || null, unitId, onBrand });
      setResults({ generation: r.generation, images: r.images });
      startPoll(r.generation.id);
    } catch (e: any) {
      const msg = String(e?.message || "");
      flash(msg.includes("limite mensal") ? "Limite mensal de imagens atingido." : msg.includes("configuração") ? "Gerador de imagens em configuração." : "Não foi possível gerar agora. Tente novamente em instantes.");
    } finally { setGenBusy(false); }
  }

  async function use(id: string) {
    try { await mktApi.post("/marketing/images/" + id + "/use"); flash("Enviado para o Calendário (A agendar)"); loadLib(); }
    catch { flash("Não foi possível enviar agora. Tente novamente em instantes."); }
  }

  const brandProps = { colors, font, unitName: unit?.name, handle: unit?.handle ? "@" + String(unit.handle).replace(/^@/, "") : null };
  const imgs: any[] = results?.images || [];
  const total = imgs.length;
  const disabled = !engine?.enabled || genBusy;

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Produzir</div>
      <h1 className="page-title">Imagens & Carrossel</h1>
      <p className="page-sub">Gere posts, stories e carrosséis na identidade da sua marca — a IA usa o seu Brand Kit automaticamente.</p>

      {engine && !engine.enabled ? (
        <div className="img-conn off">
          <span className="c-ic">🛠️</span>
          <div className="c-tx"><div className="c-t">Gerador de imagens em configuração</div><div className="c-s">Já já você poderá gerar posts e carrosséis na identidade da sua marca.</div></div>
        </div>
      ) : null}

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
              <div className="img-motor">{onBrand ? "As artes saem com as suas cores, tipografia e o seu @." : "Geração livre — sem forçar a identidade da marca."}</div>
            </div>
          </div>
          <button className="bk-mini pri" style={{ width: "100%", padding: "11px 22px", fontSize: 14, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }} disabled={disabled} onClick={generate}>{genBusy ? "Enviando…" : "✨ Gerar imagens"}</button>
          {engine?.cap ? <div className="img-motor" style={{ textAlign: "right", marginTop: 8 }}>{engine.used ?? 0}/{engine.cap} imagens neste mês</div> : null}
        </div>

        <aside className="img-brand">
          <div className="bh">Na identidade de</div>
          <div className="bnm">{unit?.name || "Sua marca"}</div>
          <div className="bsw">{(colors.length ? colors : FALLBACK).slice(0, 6).map((c, i) => <span key={i} style={{ background: c }} />)}</div>
          <div className="bfont" style={{ fontFamily: font ? `'${font}', system-ui, sans-serif` : undefined }}>{font ? font + " · Aa" : "Fonte da marca"}</div>
          <div className="bnote">{onBrand ? "A arte sai com as suas cores, tipografia e o seu @." : "Geração livre — sem forçar a identidade da marca."}</div>
        </aside>
      </div>

      {results ? (
        <>
          <div className="img-sec">Resultados{processing ? " · gerando na identidade da sua marca…" : ""}</div>
          <div className="img-results">
            {imgs.map((im: any, i: number) => {
              const isCarr = im.format === "carrossel";
              const ci = isCarr ? (im.slide_index ?? i) : (im.variation_index ?? i);
              const headline = isCarr && (im.slide_index ?? i) > 0 ? "Slide " + ((im.slide_index ?? i) + 1) : prompt;
              return (
                <div className="img-card" key={im.id}>
                  <Poster {...brandProps} prompt={headline} fmt={im.format} ci={ci} slideNo={(im.slide_index ?? i) + 1} slideTot={isCarr ? total : 0} imgUrl={im.url} loading={processing && !im.url} />
                  <div className="img-acts">
                    <button className="bk-mini" onClick={generate} disabled={disabled}>Gerar de novo</button>
                    {im.url ? <a className="bk-mini" href={im.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Baixar</a> : null}
                    <button className="bk-mini pri" onClick={() => use(im.id)} disabled={!im.url}>Usar → Calendário</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

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
