import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi, activeUnit } from "../../../lib/mktApi";
import { prepararReferencia } from "./_img";

// ============================================================================
// Tela 4 — IMAGENS & CARROSSEL. Motor REAL = Gemini "Nano Banana Pro" (Crasto
// provê). O campo é uma IDEIA (brief): a IA cria a COPY a partir dela + Brand Kit
// (não renderiza o texto ao pé da letra). Formatos IG reais: Post/Carrossel 4:5
// (1080x1350), Story 9:16. Post/Story = 1 arte; Carrossel = 4 slides. Geração
// assíncrona (polling). Recursos: pedir AJUSTE (por imagem / por slide) e CANCELAR.
// ============================================================================

const FALLBACK = ["#0B1A33", "#2E6F9E", "#6E9CE8"];

// proporção "L:A" → razão largura/altura; e daí um quadro para a prévia (SVG),
// mais estreito quando é retrato para o placeholder não ficar gigante
function razaoAspecto(a: string): number {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a || "");
  if (!m) return 4 / 5;
  const w = parseFloat(m[1]), h = parseFloat(m[2]);
  return h > 0 ? w / h : 4 / 5;
}
function quadroPrevia(aspect: string): { w: number; h: number } {
  const r = razaoAspecto(aspect);            // >1 paisagem, <1 retrato
  const base = r < 1 ? 250 : 300;            // retrato mais estreito
  let h = Math.round(base / r);
  h = Math.max(130, Math.min(560, h));       // nem alto demais, nem baixo demais
  return { w: base, h };
}
// formato legado (sem rede/slot) → uma rede/slot coerente, para a retomada de
// gerações antigas cair num destino real do catálogo
const LEGADO_PARA_DESTINO: Record<string, { network: string; slot: string }> = {
  post: { network: "instagram", slot: "feed_retrato" },
  story: { network: "instagram", slot: "stories" },
  carrossel: { network: "instagram", slot: "carrossel" },
};

function lum(hex: string) {
  const h = (hex || "#000").replace("#", "");
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (hex: string) => (lum(hex) > 0.6 ? "#0B1A33" : "#FFFFFF");

// chave onde fica guardado o pedido que o cliente JÁ VIU e fechou — para a tela
// não reabrir sozinha o mesmo resultado a cada visita
const VISTO = "mkt.img.pedido-visto";

/** "hoje às 19:35" · "ontem às 14:02" · "em 01/09 às 10:12" */
function quandoFoi(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "há pouco";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const agora = new Date();
  if (dia(d) === dia(agora)) return `hoje às ${hora}`;
  if (dia(d) === dia(new Date(agora.getTime() - 86400000))) return `ontem às ${hora}`;
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}
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
function Poster({ aspect, ci, slideNo, slideTot, colors, font, unitName, handle, imgUrl, loadingText, alt }: any) {
  if (imgUrl) return <div className="poster"><img src={imgUrl} alt={alt || ""} />{slideTot ? <div className="slide-no">{slideNo}/{slideTot}</div> : null}</div>;
  const cols = colors && colors.length ? colors : FALLBACK;
  const n = cols.length;
  const bg = cols[ci % n], accent = cols[(ci + 2) % n], fg = onColor(bg);
  const { w, h } = quadroPrevia(aspect || "4:5"); // a prévia acompanha a proporção do formato escolhido
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
  const [refs, setRefs] = useState<any[]>([]);   // imagens de referência que entram na geração
  const [engine, setEngine] = useState<{ enabled: boolean; used?: number; cap?: number } | null>(null);
  // catálogo rede→formato (vem do backend, o front só renderiza) + a escolha atual
  const [catalogo, setCatalogo] = useState<{ rede: string; slug: string; slots: any[] }[]>([]);
  const [catStatus, setCatStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [rede, setRede] = useState("instagram");
  const [slotSel, setSlotSel] = useState("feed_retrato");
  const [prompt, setPrompt] = useState("");
  const [onBrand, setOnBrand] = useState(true);
  const [results, setResults] = useState<any | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [adjustOpen, setAdjustOpen] = useState<Record<string, boolean>>({});
  const [lib, setLib] = useState<any[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // referências SÓ deste post — somam às fixas do Brand Kit, sem substituí-las
  const [refsPost, setRefsPost] = useState<{ id: string; dataUrl: string }[]>([]);
  const [lendoRef, setLendoRef] = useState(false);
  const [decorrido, setDecorrido] = useState("");
  // quando a tela reencontra um pedido feito antes (recarregou a página, voltou
  // depois): guarda quando ele foi feito, para dizer isso em vez de fingir que
  // a arte acabou de sair
  const [retomada, setRetomada] = useState<string | null>(null);
  const pediuAquiRef = useRef(false);   // o cliente já pediu uma arte NESTA visita
  const destinoTocadoRef = useRef(false); // ele já escolheu a rede/formato com a própria mão
  const marcaTocadaRef = useRef(false); // ele já ligou/desligou a identidade da marca
  const naTelaRef = useRef(true);       // a tela ainda está aberta
  const inicioRef = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<number | undefined>(undefined);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };

  async function loadStatus() { try { const s = await mktApi.get<any>("/marketing/images/status"); setEngine({ enabled: !!s.enabled, used: s.used_this_month, cap: s.monthly_cap }); } catch { setEngine({ enabled: false }); } }
  async function loadLib() { try { setLib(await mktApi.get<any[]>("/marketing/images/library")); } catch { setLib([]); } }
  async function loadFormatos() {
    try {
      const r = await mktApi.get<any>("/marketing/images/formatos");
      if (r?.redes?.length) { setCatalogo(r.redes); setCatStatus("ok"); }
      else setCatStatus("erro");
    } catch { setCatStatus("erro"); }
  }
  // a proporção (rótulo) de um destino, para dimensionar a prévia; cai no padrão
  // quando é geração antiga sem rede/slot
  function aspectoDe(network?: string | null, slot?: string | null, format?: string | null): string {
    const r = catalogo.find((x) => x.slug === network);
    const s = r?.slots.find((y: any) => y.slug === slot);
    if (s?.aspect) return s.aspect;
    return format === "story" ? "9:16" : "4:5";
  }
  async function loadBrand(uid: string | null) {
    if (!uid) return;
    try {
      const kit = await mktApi.get<any>("/marketing/brand-kit?unit=" + uid);
      setColors(((kit?.colors || []) as any[]).map((c) => c.hex).filter(Boolean));
      setFont(((kit?.fonts || []) as any[]).find((f) => f.role === "title")?.family || null);
      setRefs(((kit?.assets || []) as any[]).filter((a) => a.kind === "reference").slice(0, 4));
    } catch { /* sem brand kit → paleta neutra */ }
  }

  /**
   * Reencontra o pedido ao abrir a tela. A tela promete que dá para sair no meio
   * da criação — quem sempre cumpriu essa promessa foi o servidor; era a tela
   * que perdia o fio ao recarregar e dava a impressão de trabalho perdido.
   * Ainda criando → volta a acompanhar, com o relógio contado pelo servidor.
   * Já pronta → aparece pronta (pode ter ficado pronta com a aba fechada).
   */
  async function retomar() {
    try {
      const r = await mktApi.get<any>("/marketing/images/generations/atual");
      const g = r?.generation;
      // um pedido novo feito agora manda: nunca sobrepor o que o cliente acabou de pedir.
      // e se ele já saiu da tela enquanto a resposta vinha, não começar a acompanhar
      // nada — o acompanhamento ficaria rodando sozinho, sem tela para mostrar.
      if (!g || pediuAquiRef.current || !naTelaRef.current) return;
      const criando = Number(r.pending || 0) > 0;
      // resultado já concluído que ele viu e fechou: a tela abre limpa (continua na Biblioteca)
      let visto: string | null = null;
      try { visto = localStorage.getItem(VISTO); } catch { /* navegador sem armazenamento */ }
      if (!criando && visto === g.id) return;
      setResults({ generation: g, images: r.images || [] });
      setRetomada(quandoFoi(g.created_at));
      // não pisar no que o cliente já escolheu ou escreveu nesta visita
      // restaura o destino do pedido reencontrado, sem pisar no que ele já escolheu:
      // rede/slot da geração, ou — se for antiga — um destino coerente pelo formato
      if (!destinoTocadoRef.current) {
        const dest = (g.network && g.slot) ? { network: g.network, slot: g.slot } : LEGADO_PARA_DESTINO[g.format as string];
        if (dest) { setRede(dest.network); setSlotSel(dest.slot); }
      }
      setPrompt((p) => (p.trim() ? p : String(g.prompt || "")));
      if (!marcaTocadaRef.current && typeof g.on_brand === "boolean") setOnBrand(g.on_brand);
      // o contador tem de dizer a verdade: o começo vem do relógio do servidor,
      // não do momento em que esta página foi carregada
      inicioRef.current = Date.now() - Math.max(0, Number(g.elapsed_sec) || 0) * 1000;
      if (criando) startPoll(g.id);
    } catch { /* sem retomada a tela abre normalmente */ }
  }

  useEffect(() => {
    naTelaRef.current = true;
    loadStatus(); loadLib();
    // o catálogo antes da retomada: senão, ao voltar no meio de uma geração
    // não-4:5, a prévia apareceria com a proporção errada até o catálogo chegar
    (async () => { await loadFormatos(); await retomar(); })();
    activeUnit().then(async (uid) => {
      setUnitId(uid); loadBrand(uid);
      try { const us = await mktApi.get<any[]>("/marketing/business-units"); const u = (us || []).find((x) => x.id === uid) || (us || [])[0]; if (u) setUnit({ name: u.name, handle: u.handle }); } catch { /* ok */ }
    }).catch(() => {});
    return () => { naTelaRef.current = false; if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  // relógio do "criando…": conta desde o início da geração e limpa ao terminar
  useEffect(() => {
    if (!processing) { setDecorrido(""); return; }
    if (!inicioRef.current) inicioRef.current = Date.now();
    const tick = () => {
      const s = Math.max(0, Math.round((Date.now() - inicioRef.current) / 1000));
      setDecorrido(s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => { window.clearInterval(t); };
  }, [processing]);

  useEffect(() => {
    if (!font) return;
    const href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(font).replace(/%20/g, "+") + ":wght@400;700&display=swap";
    let l = document.getElementById("mkt-gf-img") as HTMLLinkElement | null;
    if (!l) { l = document.createElement("link"); l.id = "mkt-gf-img"; l.rel = "stylesheet"; document.head.appendChild(l); }
    if (l.href !== href) l.href = href;
  }, [font]);

  // O servidor sempre chega a um fim (fecha o que estoura o prazo, com o motivo),
  // então acompanhamos um pouco além disso — nunca "para sempre". Uma arte 2K
  // com as referências da marca leva minutos; carrossel são 4 em fila.
  // precisa passar do prazo do servidor (28 min), senão a tela desiste de uma
  // arte que ainda vai sair — e é justamente a desistência que parece perda
  const LIMITE_ACOMPANHAR = 460; // ~30 min a cada 4s
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
        if (!busy || r.generation?.status === "cancelled") {
          window.clearInterval(pollRef.current); pollRef.current = undefined; setProcessing(false); loadLib(); loadStatus();
        } else if (tries > LIMITE_ACOMPANHAR) {
          window.clearInterval(pollRef.current); pollRef.current = undefined; setProcessing(false);
          flash("Esta arte está demorando mais que o normal. Recarregue a página: ela volta a aparecer aqui do jeito que estiver.");
        }
      } catch { if (tries > LIMITE_ACOMPANHAR) { window.clearInterval(pollRef.current); pollRef.current = undefined; setProcessing(false); } }
    }, 4000);
  }

  const MAX_REFS_POST = 6;
  /** Aceita arquivos (botão ou arrastar) e colagem (Ctrl+V) — o mesmo caminho. */
  async function juntarRefs(arquivos: File[]) {
    const imgs = arquivos.filter((f) => f && f.type.startsWith("image/"));
    if (!imgs.length) return;
    const espaco = MAX_REFS_POST - refsPost.length;
    if (espaco <= 0) { flash(`São no máximo ${MAX_REFS_POST} referências por post.`); return; }
    setLendoRef(true);
    try {
      const novas: { id: string; dataUrl: string }[] = [];
      let recusadas = 0;
      for (const f of imgs.slice(0, espaco)) {
        if (f.size > 20 * 1024 * 1024) { recusadas++; continue; }
        try {
          const d = await prepararReferencia(f);
          // rede de segurança: se ainda ficou pesada, a IA recusaria o pedido
          if (d.length > 1_200_000) { recusadas++; continue; }
          novas.push({ id: `${f.name}-${f.size}-${novas.length}-${Math.random().toString(36).slice(2, 7)}`, dataUrl: d });
        } catch { recusadas++; }
      }
      if (novas.length) setRefsPost((r) => [...r, ...novas]);
      if (recusadas) flash(recusadas === 1 ? "Não consegui usar uma das imagens. Salve como JPG ou PNG e tente de novo." : `Não consegui usar ${recusadas} imagens. Salve como JPG ou PNG e tente de novo.`);
      else if (imgs.length > espaco) flash(`Entraram ${espaco}: são no máximo ${MAX_REFS_POST} referências por post.`);
    } finally { setLendoRef(false); }
  }
  function colarRef(e: React.ClipboardEvent) {
    const arquivos = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter(Boolean) as File[];
    if (arquivos.length) { e.preventDefault(); void juntarRefs(arquivos); }
  }

  async function generate() {
    if (!engine?.enabled) { flash("Gerador de imagens em configuração."); return; }
    // a partir daqui manda o pedido novo: uma retomada que chegue atrasada não
    // pode substituir na tela o que o cliente acabou de pedir
    pediuAquiRef.current = true;
    setGenBusy(true); setResults(null); setRetomada(null); setAdjust({}); setAdjustOpen({}); inicioRef.current = Date.now();
    try {
      const r = await mktApi.post<any>("/marketing/images/generate", { network: rede, slot: slotSel, prompt: prompt.trim() || null, unitId, onBrand, refs: refsPost.map((x) => x.dataUrl) });
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
    // o relógio passa a contar ESTE ajuste — senão, numa arte reencontrada de
    // horas atrás, a tela diria que o ajuste já está levando horas
    inicioRef.current = Date.now(); setRetomada(null);
    try { await mktApi.post("/marketing/images/" + imageId + "/adjust", { instruction: ins }); flash("Ajuste enviado — a IA está refazendo a arte"); setAdjust((a) => ({ ...a, [imageId]: "" })); setAdjustOpen((a) => ({ ...a, [imageId]: false })); if (id) startPoll(id); }
    catch { flash("Não foi possível ajustar agora. Tente novamente."); }
  }

  async function adjustCarrossel() {
    const id = results?.generation?.id; if (!id) return;
    const adjustments = (results?.images || []).filter((im: any) => (adjust[im.id] || "").trim()).map((im: any) => ({ imageId: im.id, instruction: (adjust[im.id] || "").trim() }));
    if (!adjustments.length) { flash("Descreva o ajuste em pelo menos um slide."); return; }
    inicioRef.current = Date.now(); setRetomada(null);
    try { await mktApi.post("/marketing/images/generations/" + id + "/adjust", { adjustments }); flash("Ajustes enviados — a IA está refazendo os slides"); setAdjust({}); startPoll(id); }
    catch { flash("Não foi possível ajustar agora. Tente novamente."); }
  }

  /** Fecha o resultado reencontrado — a arte continua guardada na Biblioteca. */
  function fecharRetomada() {
    const id = results?.generation?.id;
    try { if (id) localStorage.setItem(VISTO, String(id)); } catch { /* navegador sem armazenamento */ }
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = undefined; }
    setResults(null); setRetomada(null); setAdjust({}); setAdjustOpen({});
  }

  async function use(imageId: string) {
    try { await mktApi.post("/marketing/images/" + imageId + "/use"); flash("Enviado para o Calendário (A agendar)"); loadLib(); }
    catch { flash("Não foi possível enviar agora. Tente novamente em instantes."); }
  }

  const brandProps = { colors, font, unitName: unit?.name, handle: unit?.handle ? "@" + String(unit.handle).replace(/^@/, "") : null };
  const redeAtual = catalogo.find((r) => r.slug === rede);
  const slotAtual = redeAtual?.slots.find((s: any) => s.slug === slotSel);
  const ehCarrossel = !!slotAtual?.carrossel;
  // a proporção do resultado exibido vem do destino da GERAÇÃO (não do seletor):
  // numa retomada os dois podem diferir
  const aspectoResultado = aspectoDe(results?.generation?.network, results?.generation?.slot, results?.images?.[0]?.format);
  const imgs: any[] = results?.images || [];
  const isCarr = imgs[0]?.format === "carrossel";
  const total = imgs.length;
  // sem um destino resolvido (catálogo ainda carregando ou falhou) o Gerar fica
  // travado — nunca mandar um destino oculto que o cliente não viu escolher
  const disabled = !engine?.enabled || genBusy || !slotAtual;
  // ajuste NÃO é criação: chamar os dois de "criando" faria a tela dizer que
  // uma arte já pronta está sendo feita de novo — e ela continua guardada
  const ajustando = imgs.some((im: any) => im.status === "adjusting");
  const aviso = ajustando
    ? "o ajuste que você pediu está sendo feito. Pode sair desta tela: a arte anterior continua guardada até o ajuste ficar pronto."
    : (retomada ? `você pediu esta arte ${retomada} e ela ainda está sendo criada — ` : "") +
      "pode sair desta tela: a arte continua sendo criada e fica na Biblioteca.";

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
          {/* Destino manda no formato: escolho a REDE e ela traz os formatos certos. */}
          <div className="img-lbl">Onde vai ser publicado?</div>
          {catalogo.length ? (
            <div className="img-fmt">
              {catalogo.map((r) => (
                <button key={r.slug} className={r.slug === rede ? "on" : ""}
                  onClick={() => { destinoTocadoRef.current = true; setRede(r.slug); const primeiro = r.slots[0]?.slug; if (primeiro) setSlotSel(primeiro); }}>{r.rede}</button>
              ))}
            </div>
          ) : (
            // vazio honesto, com motivo — nunca a pergunta sem opção e sem explicação
            <div className="img-motor" style={{ marginBottom: 8 }}>
              {catStatus === "erro" ? "Não consegui carregar os formatos agora. Recarregue a página." : "Carregando os formatos…"}
            </div>
          )}
          {redeAtual ? (
            <div className="img-fmt" style={{ marginTop: -6 }}>
              {redeAtual.slots.map((s: any) => (
                <button key={s.slug} className={s.slug === slotSel ? "on" : ""}
                  onClick={() => { destinoTocadoRef.current = true; setSlotSel(s.slug); }}
                  title={s.nota || ""}>{s.nome}{s.carrossel ? " ▦" : ""}</button>
              ))}
            </div>
          ) : null}
          {slotAtual ? (
            <div className="img-motor" style={{ marginTop: 2, marginBottom: 4 }}>
              {slotAtual.forma || ""}{slotAtual.px ? ` · ${slotAtual.px}px` : ""}{slotAtual.nota ? ` — ${slotAtual.nota}` : ""}
            </div>
          ) : null}
          <div className="img-lbl" style={{ marginTop: 12 }}>Qual a ideia? (a IA escreve a copy)</div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex.: como a IA ajuda a PME a responder cliente fora do horário — a IA cria o título e a arte na sua marca" />

          {/* Referências DESTE post. As fixas do Brand Kit continuam valendo —
              estas entram por cima, e pesam mais, porque foram escolhidas agora. */}
          <div className="img-lbl" style={{ marginTop: 14 }}>Referências deste post <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></div>
          <div className="img-refs" tabIndex={0} onPaste={colarRef}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag"); void juntarRefs(Array.from(e.dataTransfer?.files || [])); }}>
            {refsPost.map((r) => (
              <span key={r.id} className="img-ref" style={{ backgroundImage: `url(${r.dataUrl})` }}>
                <button type="button" title="Tirar esta referência" onClick={() => setRefsPost((x) => x.filter((y) => y.id !== r.id))}>×</button>
              </span>
            ))}
            {refsPost.length < MAX_REFS_POST ? (
              <button type="button" className="img-ref add" onClick={() => fileRef.current?.click()} disabled={lendoRef}>
                <b>{lendoRef ? "…" : "+"}</b><small>subir</small>
              </button>
            ) : null}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
              onChange={(e) => { void juntarRefs(Array.from(e.target.files || [])); e.currentTarget.value = ""; }} />
            <div className="img-refs-hint">
              {refsPost.length
                ? `${refsPost.length} de ${MAX_REFS_POST} — a IA usa o clima destas imagens nesta arte.`
                : "Clique aqui e cole com Ctrl+V, arraste, ou suba do computador. Valem só para esta arte."}
            </div>
          </div>

          <div className="img-row">
            <button className={"img-toggle" + (onBrand ? " on" : "")} aria-label="Na identidade do meu Brand Kit" onClick={() => { marcaTocadaRef.current = true; setOnBrand((v) => !v); }} />
            <div>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>Na identidade do meu Brand Kit</div>
              <div className="img-motor">{onBrand ? "As artes saem com as suas cores, tipografia e o seu @." : "Geração livre — sem forçar a identidade da marca."}</div>
            </div>
          </div>
          <button className="bk-mini pri" style={{ width: "100%", padding: "11px 22px", fontSize: 14, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }} disabled={disabled} onClick={generate}>{genBusy ? "Enviando…" : (ehCarrossel ? "✨ Gerar carrossel (4 slides)" : "✨ Gerar imagem")}</button>
          {engine?.cap ? <div className="img-motor" style={{ textAlign: "right", marginTop: 8 }}>{engine.used ?? 0}/{engine.cap} imagens neste mês</div> : null}
        </div>

        <aside className="img-brand">
          <div className="bh">Na identidade de</div>
          <div className="bnm">{unit?.name || "Sua marca"}</div>
          <div className="bsw">{(colors.length ? colors : FALLBACK).slice(0, 6).map((c, i) => <span key={i} style={{ background: c }} />)}</div>
          <div className="bfont" style={{ fontFamily: font ? `'${font}', system-ui, sans-serif` : undefined }}>{font ? font + " · Aa" : "Fonte da marca"}</div>
          <div className="bnote">{onBrand ? "A arte e a copy saem na sua marca — cores, tipografia e @." : "Geração livre — sem forçar a identidade da marca."}</div>
          {refsPost.length ? (
            <>
              <div className="bh" style={{ marginTop: 14 }}>Só neste post</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {refsPost.map((r) => (
                  <span key={r.id} title="Referência escolhida para esta arte" style={{ width: 44, height: 44, borderRadius: 8, backgroundImage: `url(${r.dataUrl})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--blue-2)" }} />
                ))}
              </div>
              <div className="bnote" style={{ marginTop: 6 }}>Estas pesam mais que as fixas — você as escolheu para esta arte.</div>
            </>
          ) : null}
          {onBrand && refs.length ? (
            <>
              <div className="bh" style={{ marginTop: 14 }}>Fixas da marca</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {refs.map((r) => (
                  <span key={r.id} title="A IA usa o clima visual desta imagem" style={{ width: 44, height: 44, borderRadius: 8, backgroundImage: `url(${r.url})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--border-2)" }} />
                ))}
              </div>
              <div className="bnote" style={{ marginTop: 6 }}>A IA pega daqui a luz, a textura e a composição — e cria algo novo nesse clima.</div>
              {/* sem isto a tela prometeria usar TODAS as referências, e o pedido
                  leva no máximo 6 imagens: o logo entra primeiro, depois as do
                  post, e as fixas ocupam o que sobrar */}
              <div className="bnote" style={{ marginTop: 6, opacity: 0.85 }}>Cada arte leva até 6 imagens: o logo, as deste post e, no que sobrar, estas.</div>
            </>
          ) : null}
        </aside>
      </div>

      {results ? (
        <>
          <div className="img-sec">
            {isCarr ? "Carrossel" : "Resultado"}{processing ? (ajustando ? " · ajustando a arte…" : " · criando na identidade da sua marca…") : ""}
            {processing ? <button className="bk-mini" style={{ marginLeft: 12, verticalAlign: "middle" }} onClick={cancel}>Cancelar</button> : null}
          </div>
          {/* Estado honesto: quanto já passou e a permissão de ir embora. Uma arte
              na identidade da marca leva alguns minutos — sem isto o cliente
              acha que travou (foi exatamente o que aconteceu). */}
          {processing ? (
            <div className="img-motor" style={{ marginTop: -6, marginBottom: 10 }}>
              {decorrido ? `${decorrido} · ` : ""}{aviso}
            </div>
          ) : retomada ? (
            /* nada se perdeu: este é o último pedido, reencontrado ao abrir a tela */
            <div className="img-motor" style={{ marginTop: -6, marginBottom: 10 }}>
              Este é o seu último pedido, feito {retomada}.
              <button className="bk-mini" style={{ marginLeft: 10, verticalAlign: "middle" }} onClick={fecharRetomada}>Fechar</button>
            </div>
          ) : null}
          <div className="img-results">
            {imgs.map((im: any, i: number) => {
              const carr = im.format === "carrossel";
              const ci = carr ? (im.slide_index ?? i) : (im.variation_index ?? i);
              const done = im.status === "done" && im.url;
              const overlay = im.status === "adjusting" ? "ajustando…" : (im.status === "pending" ? "gerando…" : null);
              return (
                <div className="img-card" key={im.id}>
                  <Poster {...brandProps} aspect={aspectoResultado} ci={ci} slideNo={(im.slide_index ?? i) + 1} slideTot={carr ? total : 0} imgUrl={done ? im.url : undefined} loadingText={overlay} alt={done ? (results?.generation?.prompt ? "Arte: " + String(results.generation.prompt).slice(0, 80) : "Arte gerada") : undefined} />
                  <div className="img-acts">
                    {done && !carr ? <button className="bk-mini" onClick={() => setAdjustOpen((a) => ({ ...a, [im.id]: !a[im.id] }))}>Ajustar</button> : null}
                    {done ? <a className="bk-mini" href={im.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Baixar</a> : null}
                    {done ? <button className="bk-mini pri" onClick={() => use(im.id)}>Usar → Calendário</button> : null}
                    {im.status === "cancelled" ? <span className="img-motor">cancelada</span> : null}
                    {im.status === "failed" ? <button className="bk-mini pri" disabled={disabled || processing} onClick={generate}>Gerar de novo</button> : null}
                  </div>
                  {/* a tela nunca fica muda: quando não sai a arte, aparece o porquê */}
                  {im.error ? <div className="img-motor" style={{ marginTop: 6, color: im.status === "failed" ? "var(--danger, #B4232A)" : undefined }}>{im.error}</div> : null}
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
            <Poster key={im.id} {...brandProps} aspect={aspectoDe(im.network, im.slot, im.format)} ci={i} slideNo={1} slideTot={0} imgUrl={im.url} alt={im.prompt ? "Arte: " + String(im.prompt).slice(0, 80) : "Arte gerada"} />
          ))}
        </div>
      ) : (
        <div className="img-empty">Nada por aqui ainda. Gere a sua primeira arte acima — ela fica salva na Biblioteca.</div>
      )}

      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}
