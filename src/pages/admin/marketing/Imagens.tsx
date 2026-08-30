import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi, activeUnit } from "../../../lib/mktApi";

// ============================================================================
// Tela 4 — IMAGENS & CARROSSEL. Motor REAL = Gemini "Nano Banana Pro" (Crasto
// provê). O campo é uma IDEIA (brief): a IA cria a COPY a partir dela + Brand Kit
// (não renderiza o texto ao pé da letra). Formatos IG reais: Post/Carrossel 4:5
// (1080x1350), Story 9:16. Post/Story = 1 arte; Carrossel = 4 slides. Geração
// assíncrona (polling). Recursos: pedir AJUSTE (por imagem / por slide) e CANCELAR.
// ============================================================================

const FORMATS = [
  { key: "post", label: "▤ Post 4:5" },
  { key: "story", label: "▯ Story 9:16" },
  { key: "carrossel", label: "❏ Carrossel" },
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
  return lines.length ? lines : ["sua arte na marca"];
}

// Peça: imagem real (quando pronta) OU prévia na identidade da marca (enquanto gera/ajusta).
function Poster({ fmt, ci, slideNo, slideTot, colors, font, unitName, handle, imgUrl, loadingText }: any) {
  const isStory = fmt === "story";
  if (imgUrl) return <div className={"poster" + (isStory ? " ar916" : " ar45")}><img src={imgUrl} alt="" />{slideTot ? <div className="slide-no">{slideNo}/{slideTot}</div> : null}</div>;
  const cols = colors && colors.length ? colors : FALLBACK;
  const n = cols.length;
  const bg = cols[ci % n], accent = cols[(ci + 2) % n], fg = onColor(bg);
  const w = isStory ? 230 : 300, h = isStory ? 410 : 375; // 9:16 / 4:5
  const fam = font ? `'${font}', system-ui, sans-serif` : "system-ui, sans-serif";
  const lines = wrapLines("a arte na sua marca", Math.round(w / 13), 3);
  const fs = Math.round(w * 0.078);
  return (
    <div className="poster">
      <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        <rect width={w} height={h} fill={bg} />
        <circle cx={w * 0.86} cy={h * 0.84} r={w * 0.3} fill={accent} opacity="0.30" />
        <text x="22" y="34" fontFamily={fam} fontWeight="700" fontSize="14" fill={fg}>{unitName || "Sua marca"}</text>
        <rect x="22" y={h * 0.46} width="46" height="5" rx="2.5" fill={accent} />
        <text x="22" y={h * 0.46 + 30} fontFamily={fam} fontWeight="700" fontSize={fs} fill={fg}>
          {lines.map((l, i) => <tspan key={i} x="22" dy={i === 0 ? 0 : fs * 1.15}>{l}</tspan>)}
        </text>
        {handle ? <text x="22" y={h - 22} fontFamily={fam} fontSize="11" fill={fg} opacity="0.82">{handle}</text> : null}
      </svg>
      {loadingText ? <div className="img-genning"><div className="spin" />{loadingText}</div> : null}
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
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [adjustOpen, setAdjustOpen] = useState<Record<string, boolean>>({});
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
    } catch { /* sem brand kit → paleta neutra */ }
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
    let tries = 0; setProcessing(true);
    pollRef.current = window.setInterval(async () => {
      tries++;
      try {
        const r = await mktApi.get<any>("/marketing/images/generations/" + genId);
        setResults({ generation: r.generation, images: r.images });
        const busy = (r.images || []).some((im: any) => im.status === "pending" || im.status === "adjusting");
        setProcessing(busy);
        if (!busy || r.generation?.status === "cancelled" || tries > 60) {
          window.clearInterval(pollRef.current); pollRef.current = undefined; setProcessing(false); loadLib(); loadStatus();
        }
      } catch { if (tries > 60) { window.clearInterval(pollRef.current); setProcessing(false); } }
    }, 4000);
  }

  async function generate() {
    if (!engine?.enabled) { flash("Gerador de imagens em configuração."); return; }
    setGenBusy(true); setResults(null); setAdjust({}); setAdjustOpen({});
    try {
      const r = await mktApi.post<any>("/marketing/images/generate", { format: fmt, prompt: prompt.trim() || null, unitId, onBrand });
      setResults({ generation: r.generation, images: r.images });
      startPoll(r.generation.id);
    } catch (e: any) {
      const msg = String(e?.message || "");
      flash(msg.includes("limite mensal") ? "Limite mensal de imagens atingido." : msg.includes("configuração") ? "Gerador de imagens em configuração." : "Não foi possível gerar agora. Tente novamente em instantes.");
    } finally { setGenBusy(false); }
  }

  async function cancel() {
    const id = results?.generation?.id; if (!id) return;
    if (pollRef.current) window.clearInterval(pollRef.current);
    setProcessing(false);
    try { await mktApi.post("/marketing/images/generations/" + id + "/cancel"); flash("Geração cancelada"); } catch { /* ok */ }
    startPoll(id); // atualiza o estado final (o que já ficou pronto continua)
  }

  async function adjustOne(imageId: string) {
    const ins = (adjust[imageId] || "").trim(); if (!ins) { flash("Descreva o ajuste."); return; }
    const id = results?.generation?.id;
    try { await mktApi.post("/marketing/images/" + imageId + "/adjust", { instruction: ins }); flash("Ajuste enviado — a IA está refazendo a arte"); setAdjust((a) => ({ ...a, [imageId]: "" })); setAdjustOpen((a) => ({ ...a, [imageId]: false })); if (id) startPoll(id); }
    catch { flash("Não foi possível ajustar agora. Tente novamente."); }
  }

  async function adjustCarrossel() {
    const id = results?.generation?.id; if (!id) return;
    const adjustments = (results?.images || []).filter((im: any) => (adjust[im.id] || "").trim()).map((im: any) => ({ imageId: im.id, instruction: (adjust[im.id] || "").trim() }));
    if (!adjustments.length) { flash("Descreva o ajuste em pelo menos um slide."); return; }
    try { await mktApi.post("/marketing/images/generations/" + id + "/adjust", { adjustments }); flash("Ajustes enviados — a IA está refazendo os slides"); setAdjust({}); startPoll(id); }
    catch { flash("Não foi possível ajustar agora. Tente novamente."); }
  }

  async function use(imageId: string) {
    try { await mktApi.post("/marketing/images/" + imageId + "/use"); flash("Enviado para o Calendário (A agendar)"); loadLib(); }
    catch { flash("Não foi possível enviar agora. Tente novamente em instantes."); }
  }

  const brandProps = { colors, font, unitName: unit?.name, handle: unit?.handle ? "@" + String(unit.handle).replace(/^@/, "") : null };
  const imgs: any[] = results?.images || [];
  const isCarr = imgs[0]?.format === "carrossel";
  const total = imgs.length;
  const disabled = !engine?.enabled || genBusy;

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Produzir</div>
      <h1 className="page-title">Imagens & Carrossel</h1>
      <p className="page-sub">Descreva a ideia — a IA cria a arte <b>e a copy</b> na identidade da sua marca (usa o seu Brand Kit).</p>

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
          <div className="img-lbl">Qual a ideia? (a IA escreve a copy)</div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex.: como a IA ajuda a PME a responder cliente fora do horário — a IA cria o título e a arte na sua marca" />
          <div className="img-row">
            <button className={"img-toggle" + (onBrand ? " on" : "")} aria-label="Na identidade do meu Brand Kit" onClick={() => setOnBrand((v) => !v)} />
            <div>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>Na identidade do meu Brand Kit</div>
              <div className="img-motor">{onBrand ? "As artes saem com as suas cores, tipografia e o seu @." : "Geração livre — sem forçar a identidade da marca."}</div>
            </div>
          </div>
          <button className="bk-mini pri" style={{ width: "100%", padding: "11px 22px", fontSize: 14, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }} disabled={disabled} onClick={generate}>{genBusy ? "Enviando…" : (fmt === "carrossel" ? "✨ Gerar carrossel (4 slides)" : "✨ Gerar imagem")}</button>
          {engine?.cap ? <div className="img-motor" style={{ textAlign: "right", marginTop: 8 }}>{engine.used ?? 0}/{engine.cap} imagens neste mês</div> : null}
        </div>

        <aside className="img-brand">
          <div className="bh">Na identidade de</div>
          <div className="bnm">{unit?.name || "Sua marca"}</div>
          <div className="bsw">{(colors.length ? colors : FALLBACK).slice(0, 6).map((c, i) => <span key={i} style={{ background: c }} />)}</div>
          <div className="bfont" style={{ fontFamily: font ? `'${font}', system-ui, sans-serif` : undefined }}>{font ? font + " · Aa" : "Fonte da marca"}</div>
          <div className="bnote">{onBrand ? "A arte e a copy saem na sua marca — cores, tipografia e @." : "Geração livre — sem forçar a identidade da marca."}</div>
        </aside>
      </div>

      {results ? (
        <>
          <div className="img-sec">
            {isCarr ? "Carrossel" : "Resultado"}{processing ? " · gerando na identidade da sua marca…" : ""}
            {processing ? <button className="bk-mini" style={{ marginLeft: 12, verticalAlign: "middle" }} onClick={cancel}>Cancelar</button> : null}
          </div>
          <div className="img-results">
            {imgs.map((im: any, i: number) => {
              const carr = im.format === "carrossel";
              const ci = carr ? (im.slide_index ?? i) : (im.variation_index ?? i);
              const done = im.status === "done" && im.url;
              const overlay = im.status === "adjusting" ? "ajustando…" : (im.status === "pending" ? "gerando…" : null);
              return (
                <div className="img-card" key={im.id}>
                  <Poster {...brandProps} fmt={im.format} ci={ci} slideNo={(im.slide_index ?? i) + 1} slideTot={carr ? total : 0} imgUrl={done ? im.url : undefined} loadingText={overlay} />
                  <div className="img-acts">
                    {done && !carr ? <button className="bk-mini" onClick={() => setAdjustOpen((a) => ({ ...a, [im.id]: !a[im.id] }))}>Ajustar</button> : null}
                    {done ? <a className="bk-mini" href={im.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Baixar</a> : null}
                    {done ? <button className="bk-mini pri" onClick={() => use(im.id)}>Usar → Calendário</button> : null}
                    {im.status === "cancelled" ? <span className="img-motor">cancelada</span> : null}
                    {im.status === "failed" ? <span className="img-motor">falhou — gere de novo</span> : null}
                  </div>
                  {done && !carr && adjustOpen[im.id] ? (
                    <div className="img-adjust">
                      <input type="text" value={adjust[im.id] || ""} onChange={(e) => setAdjust((a) => ({ ...a, [im.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") adjustOne(im.id); }} placeholder="ex.: fundo mais claro, aumente o título, tire o ícone" />
                      <button className="bk-mini pri" onClick={() => adjustOne(im.id)}>Enviar ajuste</button>
                    </div>
                  ) : null}
                  {done && carr ? (
                    <div className="img-adjust">
                      <input type="text" value={adjust[im.id] || ""} onChange={(e) => setAdjust((a) => ({ ...a, [im.id]: e.target.value }))} placeholder={`Ajuste do slide ${(im.slide_index ?? i) + 1} (opcional)`} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {isCarr && imgs.some((im) => im.status === "done") ? (
            <div style={{ marginTop: 12 }}>
              <button className="bk-mini pri" style={{ padding: "10px 18px" }} disabled={processing} onClick={adjustCarrossel}>Aplicar ajustes aos slides</button>
              <span className="img-motor" style={{ marginLeft: 10 }}>Escreva o ajuste em cada slide que quiser mudar e envie tudo de uma vez.</span>
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <button className="bk-mini" disabled={disabled || processing} onClick={generate}>Gerar de novo</button>
          </div>
        </>
      ) : null}

      <div className="img-sec">Biblioteca</div>
      {lib == null ? (
        <div className="img-empty">Carregando…</div>
      ) : lib.length ? (
        <div className="img-lib">
          {lib.map((im: any, i: number) => (
            <Poster key={im.id} {...brandProps} fmt={im.format} ci={i} slideNo={1} slideTot={0} imgUrl={im.url} />
          ))}
        </div>
      ) : (
        <div className="img-empty">Nada por aqui ainda. Gere a sua primeira arte acima — ela fica salva na Biblioteca.</div>
      )}

      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}
