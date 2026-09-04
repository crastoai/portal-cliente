import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { mktApi, activeUnit } from "../../../lib/mktApi";
import { prepararReferencia } from "./_img";
import { MktModal } from "./_ui";

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
// --- Biblioteca (histórico): agrupar por dia e rotular ---
function mesmoDia(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function diaChave(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? "sem-data" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function diaLabel(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return "Sem data";
  const hoje = new Date();
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, new Date(hoje.getTime() - 86400000))) return "Ontem";
  const s = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  return d.getFullYear() !== hoje.getFullYear() ? `${s} de ${d.getFullYear()}` : s;
}
function horaLabel(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
const rotuloFormato = (f?: string) => (f === "carrossel" ? "Carrossel" : f === "story" ? "Story" : "Post");
// último recurso para nunca mostrar slug cru ("feed_retrato") na tela quando o
// catálogo não resolve o nome: "Feed Retrato"
const humanizar = (s: string) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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

// Ícones REAIS das redes (SVG de marca, inline — sem dependência externa). tiktok
// e x usam a cor do texto porque a marca é preta e sumiria no tema escuro.
const REDE_ICON: Record<string, { cor: string; d: string }> = {
  instagram: { cor: "#E4405F", d: "M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.31-1.46.72-2.12 1.38C1.35 2.67.94 3.34.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.8.72 1.47 1.38 2.13.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.8-.31 1.47-.72 2.13-1.38.66-.66 1.07-1.33 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.12A5.9 5.9 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0m0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88" },
  facebook: { cor: "#1877F2", d: "M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.08 24 18.09 24 12.07" },
  linkedin: { cor: "#0A66C2", d: "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12m1.78 13.02H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0" },
  youtube: { cor: "#FF0000", d: "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" },
  tiktok: { cor: "currentColor", d: "M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" },
  x: { cor: "currentColor", d: "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24H16.17l-5.21-6.82L4.99 21.75H1.68l7.73-8.84L1.25 2.25H8.08l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" },
  pinterest: { cor: "#BD081C", d: "M12.02 0C5.4 0 .03 5.37.03 11.99c0 5.08 3.16 9.42 7.62 11.16-.11-.95-.2-2.4.04-3.44.22-.94 1.41-5.96 1.41-5.96s-.36-.72-.36-1.78c0-1.66.97-2.91 2.17-2.91 1.02 0 1.52.77 1.52 1.69 0 1.03-.65 2.57-.99 3.99-.29 1.19.6 2.17 1.78 2.17 2.13 0 3.77-2.25 3.77-5.49 0-2.86-2.06-4.87-5.01-4.87-3.41 0-5.41 2.56-5.41 5.2 0 1.03.39 2.14.89 2.74.1.12.11.22.08.35-.09.37-.29 1.2-.33 1.36-.05.22-.17.27-.4.16-1.5-.69-2.43-2.88-2.43-4.65 0-3.78 2.75-7.25 7.92-7.25 4.16 0 7.39 2.97 7.39 6.92 0 4.14-2.61 7.46-6.23 7.46-1.21 0-2.35-.63-2.76-1.38l-.75 2.85c-.27 1.05-1 2.35-1.5 3.15 1.12.35 2.31.53 3.55.53 6.61 0 11.99-5.37 11.99-11.99C24.01 5.37 18.64 0 12.02 0z" },
  whatsapp: { cor: "#25D366", d: "M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.89 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41" },
};
function RedeIcon({ slug, size = 18 }: { slug: string; size?: number }) {
  const ic = REDE_ICON[slug];
  if (!ic) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={ic.cor} aria-hidden="true" style={{ flex: "0 0 auto" }}><path d={ic.d} /></svg>;
}

// Caixa de seleção (dropdown) com ícone; fecha ao clicar fora ou apertar Esc.
function SelectBox({ value, options, onChange, placeholder, minWidth }: {
  value: string | null;
  options: { value: string; label: string; sub?: string; icon?: ReactNode; right?: string }[];
  onChange: (v: string) => void;
  placeholder: string;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [open]);
  const sel = options.find((o) => o.value === value) || null;
  return (
    <div className="img-select" ref={ref} style={{ minWidth: minWidth || 200 }}>
      <button type="button" className={"img-select-btn" + (open ? " open" : "")} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        {sel?.icon ? <span className="img-select-ic">{sel.icon}</span> : null}
        <span className="img-select-lbl">{sel ? sel.label : <span style={{ color: "var(--muted)" }}>{placeholder}</span>}</span>
        {sel?.right ? <span className="img-select-right">{sel.right}</span> : null}
        <span className="img-select-caret">▾</span>
      </button>
      {open ? (
        <div className="img-select-list" role="listbox">
          {options.map((o) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value}
              className={"img-select-opt" + (o.value === value ? " on" : "")}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.icon ? <span className="img-select-ic">{o.icon}</span> : null}
              <span className="img-select-opt-tx">
                <span className="img-select-opt-lbl">{o.label}</span>
                {o.sub ? <span className="img-select-opt-sub">{o.sub}</span> : null}
              </span>
              {o.right ? <span className="img-select-right">{o.right}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Imagens() {
  const navegar = useNavigate();
  const location = useLocation();
  const [resultViewerIdx, setResultViewerIdx] = useState<number | null>(null); // visualizador aberto a partir do Resultado
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
  const [slides, setSlides] = useState(3);          // quantos slides no carrossel — flexível
  const slidesTocadoRef = useRef(false);            // o cliente já ajustou o nº na mão
  const [prompt, setPrompt] = useState("");
  const [estilo, setEstilo] = useState("");         // estilo/formato livre: "estilo tweet", meme, citação… (a IA interpreta)
  const refInspRef = useRef<string | null>(null);   // referência do Radar que inspirou (leva a estratégia até a legenda)
  // pré-preenchimento vindo do Radar de Referências ("criar post inspirado") — editável
  useEffect(() => {
    const p: any = (location.state as any)?.prefill;
    if (!p) return;
    if (p.prompt) setPrompt(String(p.prompt));
    if (p.estilo) setEstilo(String(p.estilo));
    if (p.refId) refInspRef.current = String(p.refId);
    if (p.formato === "carrossel") { setRede("instagram"); setSlotSel("carrossel"); }
    try { window.history.replaceState({}, ""); } catch { /* */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
      // _cb evita cache: uma cor recém-adicionada no Brand Kit precisa aparecer já
      const kit = await mktApi.get<any>("/marketing/brand-kit?unit=" + uid + "&_cb=" + Date.now());
      setColors(((kit?.colors || []) as any[]).map((c) => c.hex).filter(Boolean));
      setFont(((kit?.fonts || []) as any[]).find((f) => f.role === "title")?.family || null);
      setRefs(((kit?.assets || []) as any[]).filter((a) => a.kind === "reference").slice(0, 6));
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
        const busy = (r.images || []).some((im: any) => im.status === "pending" || im.status === "generating" || im.status === "adjusting");
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
      const r = await mktApi.post<any>("/marketing/images/generate", { network: rede, slot: slotSel, slides: ehCarrossel ? slidesVal : undefined, prompt: prompt.trim() || null, estilo: estilo.trim() || undefined, unitId, onBrand, refId: refInspRef.current || undefined, refs: refsPost.map((x) => x.dataUrl) });
      refInspRef.current = null; // a referência inspiradora vale só para esta geração
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

  // entende "carrossel de 3 slides", "5 cards", "faça 4 telas" na ideia e ajusta
  // o número — mas só enquanto o cliente não mexeu no controle com a própria mão
  useEffect(() => {
    if (slidesTocadoRef.current) return;
    const t = prompt.toLowerCase();
    let m = t.match(/(\d{1,2})\s*(?:slides?|cards?|telas?|imagens|p[áa]ginas)\b/);
    if (!m) m = t.match(/carross\w*\s+(?:de|com)?\s*(\d{1,2})\b/);
    if (m) { const n = parseInt(m[1], 10); if (n >= 2 && n <= 20) setSlides(n); }
  }, [prompt]);

  const usandoRef = useRef<Set<string>>(new Set());
  async function use(imageId: string) {
    if (usandoRef.current.has(imageId)) return; // trava o duplo-clique: um post só
    usandoRef.current.add(imageId);
    try { await mktApi.post("/marketing/images/" + imageId + "/use"); flash("Enviado para o Calendário (A agendar)"); loadLib(); }
    catch { flash("Não foi possível enviar agora. Tente novamente em instantes."); }
    finally { usandoRef.current.delete(imageId); }
  }

  /** Manda a GERAÇÃO INTEIRA (o carrossel todo, não um slide) para o Calendário. */
  async function usarPost(genId: string, caption?: string) {
    const chave = "g:" + genId;
    if (usandoRef.current.has(chave)) return;
    usandoRef.current.add(chave);
    try { await mktApi.post("/marketing/images/generations/" + genId + "/use", { caption }); flash("Enviado para o Calendário (A agendar)"); loadLib(); }
    catch { flash("Não foi possível enviar agora. Tente novamente em instantes."); }
    finally { usandoRef.current.delete(chave); }
  }

  /**
   * Marca/desmarca favorito. A estrela responde na hora (otimista), mas os
   * pedidos da MESMA peça vão em fila (um espera o outro): dois cliques rápidos
   * (ligar/desligar) chegariam ao banco fora de ordem e a estrela divergiria do
   * servidor. No fim, o estado vem da resposta do servidor — a verdade é dele.
   */
  const favFila = useRef<Record<string, Promise<any>>>({});
  function toggleFav(imageId: string, on: boolean) {
    setLib((l) => (l ? l.map((x) => (x.id === imageId ? { ...x, favorite: on } : x)) : l));
    const anterior = favFila.current[imageId] || Promise.resolve();
    const p = anterior.then(async () => {
      try {
        const r = await mktApi.post<any>("/marketing/images/" + imageId + "/favorite", { favorite: on });
        const real = typeof r?.favorite === "boolean" ? r.favorite : on;
        setLib((l) => (l ? l.map((x) => (x.id === imageId ? { ...x, favorite: real } : x)) : l));
      } catch {
        setLib((l) => (l ? l.map((x) => (x.id === imageId ? { ...x, favorite: !on } : x)) : l));
        flash("Não consegui salvar o favorito agora.");
      }
    });
    favFila.current[imageId] = p.catch(() => {});
  }

  const brandProps = { colors, font, unitName: unit?.name, handle: unit?.handle ? "@" + String(unit.handle).replace(/^@/, "") : null };
  const redeAtual = catalogo.find((r) => r.slug === rede);
  const slotAtual = redeAtual?.slots.find((s: any) => s.slug === slotSel);
  const ehCarrossel = !!slotAtual?.carrossel;
  const maxSlides = Math.min(slotAtual?.maxSlides || 20, 20);
  const slidesVal = Math.max(2, Math.min(slides, maxSlides));
  const mudarSlides = (n: number) => { slidesTocadoRef.current = true; setSlides(Math.max(2, Math.min(Math.round(n) || 2, maxSlides))); };
  // a proporção do resultado exibido vem do destino da GERAÇÃO (não do seletor):
  // numa retomada os dois podem diferir
  const aspectoResultado = aspectoDe(results?.generation?.network, results?.generation?.slot, results?.images?.[0]?.format);
  // ger para abrir o visualizador direto do Resultado (recém-gerado, ainda não postado)
  const redeNomeMain = (slug?: string | null) => catalogo.find((r) => r.slug === slug)?.rede || null;
  const slotNomeMain = (net?: string | null, sl?: string | null) => { const r = catalogo.find((x) => x.slug === net); return r?.slots.find((y: any) => y.slug === sl)?.nome || null; };
  const gerResultado = results?.generation ? {
    genId: results.generation.id, created_at: results.generation.created_at, prompt: results.generation.prompt,
    network: results.generation.network, slot: results.generation.slot, format: results.generation.format, status: null,
    pieces: (results.images || []).filter((im: any) => im.status === "done" && im.url).sort((a: any, b: any) => (a.slide_index ?? a.variation_index ?? 0) - (b.slide_index ?? b.variation_index ?? 0)),
  } : null;
  const imgs: any[] = results?.images || [];
  const isCarr = imgs[0]?.format === "carrossel";
  const total = imgs.length;
  // sem um destino resolvido (catálogo ainda carregando ou falhou) o Gerar fica
  // travado — nunca mandar um destino oculto que o cliente não viu escolher
  // trava o Gerar ENQUANTO uma geração está em andamento — sem isto, clicar de
  // novo criava um carrossel duplicado a cada clique (o trabalho segue no fundo)
  const disabled = !engine?.enabled || genBusy || !slotAtual || processing;
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
            <div className="img-destino">
              {/* 1ª caixa: a rede social, com o ícone real da marca */}
              <SelectBox
                placeholder="Escolha a rede" minWidth={210}
                value={rede}
                onChange={(v) => { destinoTocadoRef.current = true; setRede(v); const primeiro = catalogo.find((r) => r.slug === v)?.slots[0]?.slug; if (primeiro) setSlotSel(primeiro); }}
                options={catalogo.map((r) => ({ value: r.slug, label: r.rede, icon: <RedeIcon slug={r.slug} /> }))}
              />
              {/* 2ª caixa: o formato daquela rede, com o tamanho ao lado */}
              {redeAtual ? (
                <SelectBox
                  placeholder="Escolha o formato" minWidth={280}
                  value={slotSel}
                  onChange={(v) => { destinoTocadoRef.current = true; setSlotSel(v); }}
                  options={redeAtual.slots.map((s: any) => ({
                    value: s.slug,
                    label: s.nome + (s.carrossel ? " (carrossel)" : ""),
                    sub: `${s.forma || ""}${s.px ? ` · ${s.px}px` : ""}`,
                    right: s.px || "",
                  }))}
                />
              ) : null}
            </div>
          ) : (
            // vazio honesto, com motivo — nunca a pergunta sem opção e sem explicação
            <div className="img-motor" style={{ marginBottom: 8 }}>
              {catStatus === "erro" ? "Não consegui carregar os formatos agora. Recarregue a página." : "Carregando os formatos…"}
            </div>
          )}
          {slotAtual?.nota ? (
            <div className="img-motor" style={{ marginTop: 6, marginBottom: 4 }}>{slotAtual.nota}</div>
          ) : null}
          {/* Carrossel flexível: o cliente escolhe QUANTOS slides (não é mais 4 fixo).
              A ideia também é entendida ("carrossel de 3 slides" já ajusta o número). */}
          {ehCarrossel ? (
            <div className="img-slides">
              <span className="img-slides-lbl">Quantos slides?</span>
              <button type="button" className="img-slides-b" aria-label="Menos um slide" disabled={slidesVal <= 2} onClick={() => mudarSlides(slidesVal - 1)}>−</button>
              <input type="number" min={2} max={maxSlides} value={slidesVal} onChange={(e) => mudarSlides(Number(e.target.value))} />
              <button type="button" className="img-slides-b" aria-label="Mais um slide" disabled={slidesVal >= maxSlides} onClick={() => mudarSlides(slidesVal + 1)}>+</button>
              <span className="img-motor" style={{ marginLeft: 4 }}>de 2 a {maxSlides}</span>
            </div>
          ) : null}
          <div className="img-lbl" style={{ marginTop: 12 }}>Qual a ideia? (a IA escreve a copy)</div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex.: como a IA ajuda a PME a responder cliente fora do horário — a IA cria o título e a arte na sua marca" />
          <div className="img-estilo">
            <label className="img-estilo-lbl">Estilo <span>(opcional — a IA interpreta o que você pedir)</span></label>
            <input type="text" value={estilo} onChange={(e) => setEstilo(e.target.value)} placeholder="ex.: estilo print de tweet, meme, citação, foto realista, ilustração 3D…" />
            <div className="img-estilo-chips">
              {["Foto realista", "Ilustração", "Tipográfico", "Meme", "Print de tweet", "Citação", "Infográfico", "3D"].map((s) => (
                <button key={s} type="button" className={estilo === s ? "on" : ""} onClick={() => setEstilo((v) => (v === s ? "" : s))}>{s}</button>
              ))}
            </div>
          </div>

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
          <button className="bk-mini pri" style={{ width: "100%", padding: "11px 22px", fontSize: 14, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }} disabled={disabled} onClick={generate}>{genBusy ? "Enviando…" : (ehCarrossel ? `✨ Gerar carrossel (${slidesVal} slides)` : "✨ Gerar imagem")}</button>
          {engine?.cap ? <div className="img-motor" style={{ textAlign: "right", marginTop: 8 }}>{engine.used ?? 0}/{engine.cap} imagens neste mês</div> : null}
        </div>

        <aside className="img-brand">
          <div className="bh">Na identidade de</div>
          <div className="bnm">{unit?.name || "Sua marca"}</div>
          <div className="bsw">{(colors.length ? colors : FALLBACK).slice(0, 12).map((c, i) => <span key={i} style={{ background: c }} />)}</div>
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
            {/* terminou: abrir o visualizador completo (ficha, legenda, versões, excluir) */}
            {!processing && gerResultado && gerResultado.pieces.length ? (
              <button className="bk-mini pri" style={{ marginLeft: 12, verticalAlign: "middle", textTransform: "none", letterSpacing: 0 }} onClick={() => setResultViewerIdx(0)}>{isCarr ? "Abrir carrossel" : "Abrir"}</button>
            ) : null}
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
              const overlay = im.status === "adjusting" ? "ajustando…" : ((im.status === "pending" || im.status === "generating") ? "gerando…" : null);
              return (
                <div className="img-card" key={im.id}>
                  <Poster {...brandProps} aspect={aspectoResultado} ci={ci} slideNo={(im.slide_index ?? i) + 1} slideTot={carr ? total : 0} imgUrl={done ? im.url : undefined} loadingText={overlay} alt={done ? (results?.generation?.prompt ? "Arte: " + String(results.generation.prompt).slice(0, 80) : "Arte gerada") : undefined} />
                  <div className="img-acts">
                    {done && !carr ? <button className="bk-mini" onClick={() => setAdjustOpen((a) => ({ ...a, [im.id]: !a[im.id] }))}>Ajustar</button> : null}
                    {done ? <a className="bk-mini" href={im.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Baixar</a> : null}
                    {/* num carrossel, o post inteiro vai junto (botão único abaixo); num post, aqui mesmo */}
                    {done && !carr ? <button className="bk-mini pri" onClick={() => results?.generation?.id && usarPost(results.generation.id)}>Usar → Calendário</button> : null}
                    {im.status === "cancelled" ? <span className="img-motor">cancelada</span> : null}
                    {im.status === "failed" ? <button className="bk-mini pri" disabled={disabled || processing} onClick={generate}>Gerar de novo</button> : null}
                  </div>
                  {/* a tela nunca fica muda: quando não sai a arte, aparece o porquê */}
                  {im.error ? <div className="img-motor" style={{ marginTop: 6, color: im.status === "failed" ? "var(--danger, #B4232A)" : undefined }}>{im.error}</div> : null}
                  {done && !carr && adjustOpen[im.id] ? (
                    <div className="img-adjust col">
                      <textarea className="img-adjust-ta" rows={2} value={adjust[im.id] || ""} onChange={(e) => setAdjust((a) => ({ ...a, [im.id]: e.target.value }))} placeholder="Diga só o que mudar — imagem OU texto. Ex.: “deixe o fundo mais claro” (muda só a imagem) · “troque o título para: Sua PME em 2026” (muda só o texto)." />
                      <div className="img-adjust-row">
                        <span className="img-motor">A IA mexe só no que você pedir — o resto fica igual.</span>
                        <button className="bk-mini pri" disabled={!(adjust[im.id] || "").trim()} onClick={() => adjustOne(im.id)}>Enviar ajuste</button>
                      </div>
                    </div>
                  ) : null}
                  {done && carr ? (
                    <div className="img-adjust">
                      <textarea className="img-adjust-ta" rows={2} value={adjust[im.id] || ""} onChange={(e) => setAdjust((a) => ({ ...a, [im.id]: e.target.value }))} placeholder={`Slide ${(im.slide_index ?? i) + 1} — só o que mudar (ex.: “fundo mais claro” muda só a imagem · “troque o título” muda só o texto). Vazio = não mexe.`} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {isCarr && imgs.some((im) => im.status === "done") ? (
            <>
              <div style={{ marginTop: 12 }}>
                <button className="bk-mini pri" style={{ padding: "10px 18px" }} disabled={processing} onClick={adjustCarrossel}>Aplicar ajustes aos slides</button>
                <span className="img-motor" style={{ marginLeft: 10 }}>Em cada slide, escreva só o que quer mudar — imagem ou texto — e envie tudo de uma vez. A IA mexe só no que você pediu; o resto fica igual.</span>
              </div>
              {/* o carrossel inteiro (todos os slides) vai como UM post para o Calendário */}
              {!processing ? (
                <div style={{ marginTop: 10 }}>
                  <button className="bk-mini pri" style={{ padding: "10px 18px" }} onClick={() => results?.generation?.id && usarPost(results.generation.id)}>Enviar carrossel ao Calendário</button>
                  <span className="img-motor" style={{ marginLeft: 10 }}>Abra o carrossel na Biblioteca para gerar a legenda automática e agendar.</span>
                </div>
              ) : null}
            </>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <button className="bk-mini" disabled={disabled || processing} onClick={generate}>Gerar de novo</button>
          </div>
        </>
      ) : null}

      <Biblioteca lib={lib} catalogo={catalogo} brandProps={brandProps} onFav={toggleFav} onUse={use} onUsarPost={usarPost} onRecarregar={loadLib} onFlash={flash} unitName={unit?.name} />

      {resultViewerIdx != null && gerResultado && gerResultado.pieces.length ? (
        <Visualizador
          ger={gerResultado} idx={resultViewerIdx} catalogo={catalogo} unitName={unit?.name}
          onIdx={(v: number) => setResultViewerIdx(v)}
          onClose={() => setResultViewerIdx(null)} onFav={toggleFav} onUse={use} onUsarPost={usarPost}
          onCalendario={() => navegar("/admin/marketing/calendario")} onRecarregar={loadLib} onFlash={flash}
          redeNome={redeNomeMain} slotNome={slotNomeMain}
        />
      ) : null}
      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}

// proporção do slot pelo catálogo (para a prévia); irrelevante quando há imagem
function aspectDoCatalogo(catalogo: any[], network?: string | null, slot?: string | null, format?: string | null): string {
  const r = catalogo?.find((x) => x.slug === network);
  const s = r?.slots.find((y: any) => y.slug === slot);
  return s?.aspect || (format === "story" ? "9:16" : "4:5");
}

// --- status de postagem (real, do post ligado à peça) ---
const ORD_STATUS: Record<string, number> = { publicado: 4, agendado: 3, aprovar: 2, rascunho: 1 };
function statusDoGrupo(pieces: any[]): string | null {
  let best: string | null = null, bo = 0;
  for (const p of pieces) { const o = ORD_STATUS[p.post_status] || 0; if (o > bo) { bo = o; best = p.post_status; } }
  return best;
}
const statusLabel = (s: string | null) => (s === "publicado" ? "Publicado" : s === "agendado" ? "Agendado" : s === "aprovar" ? "Aguardando aprovação" : s === "rascunho" ? "A agendar" : "Ainda não postado");
const statusClasse = (s: string | null) => (s === "publicado" ? "pub" : s === "agendado" ? "age" : (s === "rascunho" || s === "aprovar") ? "rasc" : "nao");

const PERIODOS = [
  { value: "tudo", label: "Qualquer período" },
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "mes", label: "Este mês" },
];
function noPeriodo(iso: string, periodo: string): boolean {
  if (periodo === "tudo") return true;
  const d = new Date(iso); if (isNaN(d.getTime())) return false;
  const now = new Date();
  if (periodo === "hoje") return mesmoDia(d, now);
  if (periodo === "7d") return d.getTime() >= now.getTime() - 7 * 86400000;
  if (periodo === "30d") return d.getTime() >= now.getTime() - 30 * 86400000;
  if (periodo === "mes") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  return true;
}

// Card em BLOCO: passa os slides do carrossel no hover (estilo Canva) e traz os
// ícones de ação (favoritar, enviar ao Calendário, excluir) sem sair da grade.
function BlocoCard({ g, redeNome, onAbrir, onFav, onUsarPost, onExcluir }: any) {
  const [hi, setHi] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const capa = g.pieces.find((p: any) => p.url) || g.pieces[0];
  const url = g.pieces[hi]?.url || capa?.url;
  const favCapa = !!capa?.favorite;
  const parar = () => { if (timer.current) { window.clearInterval(timer.current); timer.current = undefined; } };
  useEffect(() => () => parar(), []);
  const entrar = () => {
    if (g.pieces.length < 2) return;
    parar();
    let k = 0;
    timer.current = window.setInterval(() => { k = (k + 1) % g.pieces.length; setHi(k); }, 850);
  };
  const sair = () => { parar(); setHi(0); };
  return (
    <div className="img-bloco" onMouseEnter={entrar} onMouseLeave={sair} onClick={() => onAbrir(g.genId, 0)}>
      <div className="img-bloco-thumb">
        {url ? <img src={url} alt={g.prompt ? "Arte: " + String(g.prompt).slice(0, 60) : "Arte"} /> : null}
        {g.pieces.length > 1 ? <span className="lib-row-n">{hi + 1}/{g.pieces.length}</span> : null}
        <span className={"img-bloco-status lib-status " + statusClasse(g.status)}>{statusLabel(g.status)}</span>
        <div className="img-bloco-acts" onClick={(e) => e.stopPropagation()}>
          <button className={"iba" + (favCapa ? " on" : "")} title={favCapa ? "Tirar dos favoritos" : "Favoritar"} onClick={() => capa && onFav(capa.id, !favCapa)}>★</button>
          {!g.status ? (
            <button className="iba" title="Enviar ao Calendário" onClick={() => onUsarPost(g.genId)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </button>
          ) : null}
          <button className="iba del" title="Excluir post" onClick={() => onExcluir(g.genId)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>
      <div className="img-bloco-meta">
        <span className="img-lib-badge">{g.network ? (redeNome(g.network) || rotuloFormato(g.format)) : rotuloFormato(g.format)}</span>
        <span className="img-lib-hora">{horaLabel(g.created_at)}</span>
      </div>
      <div className={"img-bloco-idea" + (g.prompt ? "" : " vazio")}>{g.prompt || "Sem ideia escrita"}</div>
    </div>
  );
}

// ============================================================================
// BIBLIOTECA — o acervo em LISTA. Cada post é uma linha recolhida (não explode a
// tela quando há muitos): a ideia, o destino, quando foi feito e o status de
// postagem. Expando a linha e aparecem as artes; clico numa arte e ela abre
// grande, com a ficha e as ações (postar/agendar/repostar). Busca pela ideia,
// filtro por período, por rede e favoritos. Tudo real do backend.
// ============================================================================
function Biblioteca({ lib, catalogo, brandProps, onFav, onUse, onUsarPost, onRecarregar, onFlash, unitName }: {
  lib: any[] | null;
  catalogo: { rede: string; slug: string; slots: any[] }[];
  brandProps: any;
  onFav: (id: string, on: boolean) => void;
  onUse: (id: string) => void;
  onUsarPost: (genId: string, caption?: string) => void;
  onRecarregar: () => void;
  onFlash: (m: string) => void;
  unitName?: string;
}) {
  const nav = useNavigate();
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState("tudo");
  const [fRede, setFRede] = useState<string | null>(null);
  const [soFav, setSoFav] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<{ genId: string; idx: number } | null>(null);
  const [modo, setModo] = useState<"lista" | "blocos">(() => { try { return (localStorage.getItem("mkt.img.modo") as any) || "lista"; } catch { return "lista"; } });
  const trocarModo = (m: "lista" | "blocos") => { setModo(m); try { localStorage.setItem("mkt.img.modo", m); } catch { /* ok */ } };

  // se a geração aberta no visualizador sumiu do acervo (ex.: recarregou), fecha
  useEffect(() => {
    if (viewer && lib && !lib.some((x) => x.generation_id === viewer.genId)) setViewer(null);
  }, [viewer, lib]);

  const redeNome = (slug?: string | null) => catalogo.find((r) => r.slug === slug)?.rede || null;
  const slotNome = (net?: string | null, sl?: string | null) => { const r = catalogo.find((x) => x.slug === net); return r?.slots.find((y: any) => y.slug === sl)?.nome || null; };

  if (lib == null) return (<><div className="img-sec">Biblioteca</div><div className="img-empty">Carregando…</div></>);
  if (!lib.length) return (<><div className="img-sec">Biblioteca</div><div className="img-empty">Nada por aqui ainda. Gere a sua primeira arte acima — ela fica salva na Biblioteca.</div></>);

  const redesPresentes = Array.from(new Set(lib.map((x) => x.network).filter(Boolean))) as string[];
  const termo = busca.trim().toLowerCase();
  const filt = lib.filter((im) => {
    if (soFav && !im.favorite) return false;
    if (fRede && im.network !== fRede) return false;
    if (!noPeriodo(im.created_at, periodo)) return false;
    if (termo && !String(im.prompt || "").toLowerCase().includes(termo)) return false;
    return true;
  });

  // agrupa por geração (lib já vem do mais novo), depois por dia
  const gers: any[] = []; const idxG: Record<string, any> = {};
  for (const im of filt) {
    let g = idxG[im.generation_id];
    if (!g) { g = { genId: im.generation_id, created_at: im.created_at, prompt: im.prompt, network: im.network, slot: im.slot, format: im.format, pieces: [] }; idxG[im.generation_id] = g; gers.push(g); }
    g.pieces.push(im);
  }
  for (const g of gers) { g.pieces.sort((a: any, b: any) => (a.slide_index ?? 0) - (b.slide_index ?? 0)); g.status = statusDoGrupo(g.pieces); g.fav = g.pieces.some((p: any) => p.favorite); }
  const dias: any[] = []; const idxD: Record<string, any> = {};
  for (const g of gers) { const k = diaChave(g.created_at); let d = idxD[k]; if (!d) { d = { chave: k, label: diaLabel(g.created_at), gers: [] }; idxD[k] = d; dias.push(d); } d.gers.push(g); }

  const temFiltro = !!(termo || fRede || soFav || periodo !== "tudo");
  const limpar = () => { setBusca(""); setFRede(null); setSoFav(false); setPeriodo("tudo"); };
  // o visualizador resolve a geração pelo ACERVO INTEIRO (não pela lista já
  // filtrada): assim ele não some se um filtro/desfavoritar tirar a arte da lista
  const gerCompleto = (genId: string): any => {
    const ps = (lib || []).filter((x) => x.generation_id === genId);
    if (!ps.length) return null;
    ps.sort((a: any, b: any) => (a.slide_index ?? 0) - (b.slide_index ?? 0));
    const f = ps[0];
    return { genId, created_at: f.created_at, prompt: f.prompt, network: f.network, slot: f.slot, format: f.format, pieces: ps, status: statusDoGrupo(ps) };
  };
  const abrir = (genId: string, idx: number) => setViewer({ genId, idx });
  async function excluirGer(genId: string) {
    if (!window.confirm("Excluir este post e todas as suas artes da Biblioteca? Não dá para desfazer.")) return;
    try { await mktApi.del("/marketing/images/generations/" + genId); onFlash?.("Post excluído."); onRecarregar?.(); }
    catch (e: any) { onFlash?.(e?.status === 409 ? String(e.message) : "Não foi possível excluir agora. Tente novamente."); }
  }

  // ações conforme o status: não postado -> enviar; publicado -> repostar; sempre
  // que já foi ao Calendário, um atalho para ver lá.
  function AcoesPost({ g }: { g: any }) {
    return (
      <>
        {!g.status ? <button className="bk-mini pri" onClick={(e) => { e.stopPropagation(); onUsarPost(g.genId); }}>Enviar ao Calendário</button> : null}
        {g.status === "publicado" ? <button className="bk-mini pri" onClick={(e) => { e.stopPropagation(); onUsarPost(g.genId); }}>Repostar</button> : null}
        {g.status ? <button className="bk-mini" onClick={(e) => { e.stopPropagation(); nav("/admin/marketing/calendario"); }}>Ver no Calendário</button> : null}
      </>
    );
  }

  return (
    <>
      <div className="img-sec">Biblioteca</div>
      <div className="img-lib-bar">
        <input className="img-lib-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pela ideia…" />
        <SelectBox placeholder="Qualquer período" minWidth={170} value={periodo} onChange={setPeriodo} options={PERIODOS} />
        {redesPresentes.length ? (
          <SelectBox placeholder="Todas as redes" minWidth={170} value={fRede}
            onChange={(v) => setFRede(v === "__todas" ? null : v)}
            options={[{ value: "__todas", label: "Todas as redes" }, ...redesPresentes.map((n) => ({ value: n, label: redeNome(n) || humanizar(n), icon: <RedeIcon slug={n} size={16} /> }))]} />
        ) : null}
        <button className={"img-lib-fav" + (soFav ? " on" : "")} onClick={() => setSoFav((v) => !v)} title="Só os favoritos">★ Favoritos</button>
        {temFiltro ? <button className="img-lib-limpar" onClick={limpar}>Limpar filtros</button> : null}
        {/* ver em lista (linhas) ou em blocos (grade de miniaturas) */}
        <div className="img-lib-modo" style={{ marginLeft: "auto" }}>
          <button className={modo === "lista" ? "on" : ""} onClick={() => trocarModo("lista")} title="Ver em lista" aria-label="Ver em lista">☰</button>
          <button className={modo === "blocos" ? "on" : ""} onClick={() => trocarModo("blocos")} title="Ver em blocos" aria-label="Ver em blocos">▦</button>
        </div>
      </div>

      {!dias.length ? (
        <div className="img-empty">Nenhuma arte encontrada com esse filtro. <button className="img-lib-linkbtn" onClick={limpar}>Limpar filtros</button></div>
      ) : (
        <div className="img-lib-col">
          {dias.map((d) => (
            <div key={d.chave} className="img-lib-dia">
              <div className="img-lib-dia-h">{d.label} <span className="img-lib-dia-n">{d.gers.length}</span></div>
              {modo === "blocos" ? (
                <div className="img-lib-blocos">
                  {d.gers.map((g: any) => (
                    <BlocoCard key={g.genId} g={g} redeNome={redeNome} onAbrir={abrir} onFav={onFav} onUsarPost={onUsarPost} onExcluir={excluirGer} />
                  ))}
                </div>
              ) : d.gers.map((g: any) => {
                const aberto = !!abertos[g.genId];
                const capa = g.pieces.find((p: any) => p.url) || g.pieces[0];
                return (
                  <div key={g.genId} className={"lib-row" + (aberto ? " aberta" : "")}>
                    <div className="lib-row-h" onClick={() => setAbertos((a) => ({ ...a, [g.genId]: !a[g.genId] }))}>
                      <button className="lib-row-cx" aria-label={aberto ? "Recolher" : "Expandir"}>{aberto ? "▾" : "▸"}</button>
                      <div className="lib-row-thumb" onClick={(e) => { e.stopPropagation(); abrir(g.genId, 0); }}>
                        {capa?.url ? <img src={capa.url} alt="" /> : null}
                        {g.pieces.length > 1 ? <span className="lib-row-n">{g.pieces.length}</span> : null}
                      </div>
                      <div className="lib-row-main">
                        <div className="lib-row-top">
                          <span className="img-lib-badge">{g.network ? (redeNome(g.network) || rotuloFormato(g.format)) : rotuloFormato(g.format)}</span>
                          {slotNome(g.network, g.slot) ? <span className="img-lib-badge2">{slotNome(g.network, g.slot)}</span> : null}
                          <span className={"lib-status " + statusClasse(g.status)}>{statusLabel(g.status)}</span>
                          <span className="img-lib-hora">{horaLabel(g.created_at)}</span>
                        </div>
                        <div className={"lib-row-idea" + (g.prompt ? "" : " vazio")}>{g.prompt || "Sem ideia escrita"}</div>
                      </div>
                      <div className="lib-row-acts" onClick={(e) => e.stopPropagation()}>
                        <button className="bk-mini" onClick={() => abrir(g.genId, 0)}>Abrir</button>
                        <AcoesPost g={g} />
                      </div>
                    </div>
                    {aberto ? (
                      <div className="lib-row-pieces">
                        {g.pieces.map((im: any, i: number) => (
                          <div className="img-lib-cel" key={im.id}>
                            <div className="poster" onClick={() => abrir(g.genId, i)} style={{ cursor: "pointer" }}>
                              {im.url ? <img src={im.url} alt={im.prompt ? "Arte: " + String(im.prompt).slice(0, 80) : "Arte gerada"} /> : null}
                              {g.pieces.length > 1 ? <div className="slide-no">{i + 1}/{g.pieces.length}</div> : null}
                            </div>
                            <button className={"img-fav" + (im.favorite ? " on" : "")} title={im.favorite ? "Tirar dos favoritos" : "Favoritar"} onClick={() => onFav(im.id, !im.favorite)}>★</button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {viewer ? (
        <Visualizador
          ger={gerCompleto(viewer.genId)} idx={viewer.idx} catalogo={catalogo} unitName={unitName}
          onIdx={(i: number) => setViewer((v) => (v ? { ...v, idx: i } : v))}
          onClose={() => setViewer(null)} onFav={onFav} onUse={onUse} onCalendario={() => nav("/admin/marketing/calendario")} onUsarPost={onUsarPost} onRecarregar={onRecarregar} onFlash={onFlash}
          redeNome={redeNome} slotNome={slotNome}
        />
      ) : null}
    </>
  );
}

// Visualizador: a arte grande, navegação entre as peças, a ficha (destino, data,
// status, referências usadas) e as ações. Abre via MktModal (createPortal no body).
function Visualizador({ ger, idx, onIdx, onClose, onFav, onUse, onCalendario, onUsarPost, onRecarregar, onFlash, redeNome, slotNome }: any) {
  const [detalhe, setDetalhe] = useState<{ refsPost: any[]; refsMarca: any[] } | null>(null);
  useEffect(() => {
    if (!ger?.genId) return;
    let vivo = true;
    mktApi.get<any>("/marketing/images/generations/" + ger.genId + "/detalhe").then((d) => { if (vivo) setDetalhe({ refsPost: d?.refsPost || [], refsMarca: d?.refsMarca || [] }); }).catch(() => { if (vivo) setDetalhe({ refsPost: [], refsMarca: [] }); });
    return () => { vivo = false; };
  }, [ger?.genId]);
  const total = ger?.pieces?.length || 0;
  const i = Math.max(0, Math.min(idx, total - 1));
  const im = ger?.pieces?.[i];

  // linhagem (v1 → v2 → v3) da peça aberta + ajuste (cria nova versão)
  const [versoes, setVersoes] = useState<any[]>([]);
  const [vSel, setVSel] = useState(-1);          // -1 = versão atual (cabeça)
  const [ajusteOn, setAjusteOn] = useState(false);
  const [ajusteTxt, setAjusteTxt] = useState("");
  const [ajustando, setAjustando] = useState(false);
  const [ajusteTodos, setAjusteTodos] = useState(false); // aplicar o ajuste a TODO o carrossel
  const pollRef = useRef<number | undefined>(undefined);
  const pararPoll = () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = undefined; } };
  useEffect(() => {
    if (!im?.id) { setVersoes([]); return; }
    // trocou de peça: zera o estado de ajuste (senão "ajustando…" ficaria preso
    // na peça nova) e para o poll da peça anterior
    let vivo = true; setVSel(-1); setAjusteOn(false); setAjusteTxt(""); setAjustando(false); pararPoll();
    mktApi.get<any>("/marketing/images/" + im.id + "/versoes").then((d) => { if (vivo) setVersoes(d?.versoes || []); }).catch(() => { if (vivo) setVersoes([]); });
    return () => { vivo = false; pararPoll(); };
  }, [im?.id]);

  async function enviarAjuste() {
    const ins = ajusteTxt.trim(); if (!ins || !im?.id) return;
    const todos = ajusteTodos && total > 1;
    setAjustando(true); setAjusteOn(false);
    const antes = versoes.length;
    const slidePos = im.slide_index ?? im.variation_index ?? i;
    try {
      if (todos) {
        // o MESMO ajuste em todos os slides de uma vez → nova versão de cada
        const adjustments = ger.pieces.map((p: any) => ({ imageId: p.id, instruction: ins }));
        await mktApi.post("/marketing/images/generations/" + ger.genId + "/adjust", { adjustments });
      } else {
        await mktApi.post("/marketing/images/" + im.id + "/adjust", { instruction: ins });
      }
      setAjusteTxt("");
      // acompanha pelo STATUS real (sabe dizer se deu certo OU falhou); para
      // "todos", espera nenhum slide continuar 'ajustando'
      let tentativas = 0;
      pollRef.current = window.setInterval(async () => {
        tentativas++;
        try {
          const st = await mktApi.get<any>("/marketing/images/generations/" + ger.genId);
          const imgs = st?.images || [];
          const aindaAjustando = todos ? imgs.some((x: any) => x.status === "adjusting") : ((imgs.find((x: any) => (x.slide_index ?? x.variation_index ?? -99) === slidePos) || imgs[i])?.status === "adjusting");
          if (!aindaAjustando) {
            pararPoll();
            const d = await mktApi.get<any>("/marketing/images/" + im.id + "/versoes").catch(() => null);
            const vs = d?.versoes || [];
            if (vs.length > antes) { setVersoes(vs); setVSel(-1); }
            const algumErro = imgs.find((x: any) => x.error)?.error;
            if (vs.length <= antes && algumErro) onFlash?.(algumErro);
            setAjustando(false); onRecarregar?.();
          } else if (tentativas > 90) {
            pararPoll(); setAjustando(false); onRecarregar?.();
            onFlash?.("O ajuste está demorando. Recarregue a Biblioteca em instantes para ver o resultado.");
          }
        } catch { if (tentativas > 90) { pararPoll(); setAjustando(false); } }
      }, 4000);
    } catch { setAjustando(false); onFlash?.("Não foi possível ajustar agora. Tente novamente."); }
  }

  // legenda automática (Yaya): analisa a arte + a marca + a ideia e escreve a legenda
  const [legenda, setLegenda] = useState("");
  const [gerandoLeg, setGerandoLeg] = useState(false);
  useEffect(() => { setLegenda(""); }, [ger?.genId]);
  async function gerarLegenda() {
    if (!ger?.genId) return;
    setGerandoLeg(true);
    try { const r = await mktApi.post<any>("/marketing/images/generations/" + ger.genId + "/legenda", {}); setLegenda(String(r?.legenda || "")); }
    catch { onFlash?.("Não consegui gerar a legenda agora. Tente novamente."); }
    finally { setGerandoLeg(false); }
  }
  async function excluirPost() {
    if (!ger?.genId) return;
    if (!window.confirm("Excluir este post e todas as suas artes da Biblioteca? Não dá para desfazer.")) return;
    try { await mktApi.del("/marketing/images/generations/" + ger.genId); onFlash?.("Post excluído."); onClose(); onRecarregar?.(); }
    catch (e: any) { onFlash?.(e?.status === 409 ? String(e.message) : "Não foi possível excluir agora. Tente novamente."); }
  }
  async function excluirSlide() {
    if (!im?.id) return;
    if (!window.confirm("Excluir este slide do carrossel? Não dá para desfazer.")) return;
    try { await mktApi.del("/marketing/images/" + im.id); onFlash?.("Slide excluído."); onRecarregar?.(); onIdx(Math.max(0, i - 1)); }
    catch (e: any) { onFlash?.(e?.status === 409 ? String(e.message) : "Não foi possível excluir agora. Tente novamente."); }
  }

  if (!ger || !im) return null;
  const rede = ger.network ? (redeNome(ger.network) || rotuloFormato(ger.format)) : rotuloFormato(ger.format);
  const fmt = slotNome(ger.network, ger.slot);
  const quando = new Date(ger.created_at);
  const dataTxt = isNaN(quando.getTime()) ? "" : quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) + " às " + horaLabel(ger.created_at);
  const pid = ger.pieces[0]?.id;
  // a arte mostrada: a versão escolhida na linhagem, ou a cabeça (atual)
  const arteUrl = vSel >= 0 && versoes[vSel] ? versoes[vSel].url : im.url;
  return (
    <MktModal wide title={ger.prompt ? String(ger.prompt).slice(0, 70) : "Arte da Biblioteca"} onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
          {arteUrl ? <a className="bk-mini" href={arteUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Baixar</a> : null}
          <button className="bk-mini" disabled={ajustando} onClick={() => setAjusteOn((v) => !v)}>{ajustando ? "Ajustando…" : "Ajustar"}</button>
          {/* o carrossel INTEIRO vai para o Calendário (não um slide solto), com a legenda */}
          {!ger.status ? <button className="bk-mini pri" onClick={() => onUsarPost(ger.genId, legenda || undefined)}>{total > 1 ? "Enviar carrossel ao Calendário" : "Enviar ao Calendário"}</button> : null}
          {/* já é rascunho: o botão salva a legenda no post que já está no Calendário (sem duplicar) */}
          {ger.status === "rascunho" ? <button className="bk-mini pri" disabled={!legenda} onClick={() => onUsarPost(ger.genId, legenda || undefined)}>Salvar legenda no Calendário</button> : null}
          {ger.status === "publicado" ? <button className="bk-mini pri" onClick={() => onUsarPost(ger.genId, legenda || undefined)}>Repostar</button> : null}
          {ger.status ? <button className="bk-mini" onClick={onCalendario}>Ver no Calendário</button> : null}
          <button className="bk-mini danger" onClick={excluirPost} style={{ marginLeft: "auto" }}>Excluir post</button>
        </div>
      }>
      <div className="viz">
        <div className="viz-arte">
          <div className="viz-arte-wrap">
            {arteUrl ? <img src={arteUrl} alt={ger.prompt ? "Arte: " + String(ger.prompt).slice(0, 80) : "Arte gerada"} /> : <div className="img-empty">Arte indisponível.</div>}
            {ajustando ? <div className="viz-ajustando"><div className="spin" />Refazendo a arte com o seu ajuste…</div> : null}
          </div>
          {/* Versões: cada ajuste é uma versão nova; a anterior fica guardada e navegável */}
          {versoes.length > 1 ? (
            <div className="viz-versoes">
              <span className="viz-refs-t">Versões</span>
              {versoes.map((v: any, k: number) => (
                <button key={v.id} className={"viz-vbtn" + ((vSel < 0 ? k === versoes.length - 1 : k === vSel) ? " on" : "")} onClick={() => setVSel(k === versoes.length - 1 ? -1 : k)}>v{v.version}</button>
              ))}
              {vSel >= 0 && vSel < versoes.length - 1 ? <span className="img-motor">(versão anterior — a atual é a v{versoes[versoes.length - 1].version})</span> : null}
            </div>
          ) : null}
          {ajusteOn ? (
            <div className="viz-ajuste">
              <textarea className="img-adjust-ta" rows={2} value={ajusteTxt} autoFocus placeholder={ajusteTodos ? "O que mudar em todos os slides — imagem OU texto. Ex.: “deixe todos mais claros” (só imagem)" : "Diga só o que mudar — imagem OU texto. Ex.: “fundo mais claro” (só imagem) · “troque o título” (só texto)"} onChange={(e) => setAjusteTxt(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") enviarAjuste(); }} />
              <button className="bk-mini pri" onClick={enviarAjuste} disabled={!ajusteTxt.trim()}>Enviar ajuste</button>
              {total > 1 ? (
                <label className="viz-ajuste-todos"><input type="checkbox" checked={ajusteTodos} onChange={(e) => setAjusteTodos(e.target.checked)} /> aplicar a todos os {total} slides</label>
              ) : null}
              <span className="img-motor" style={{ flexBasis: "100%" }}>Vira uma nova versão — a atual continua guardada.{total > 1 ? " Sem marcar, ajusta só este slide." : ""}</span>
            </div>
          ) : null}
          {total > 1 ? (
            <div className="viz-nav">
              <button disabled={ajustando} onClick={() => onIdx((i - 1 + total) % total)} aria-label="Anterior">‹</button>
              <span>{i + 1} / {total}</span>
              <button disabled={ajustando} onClick={() => onIdx((i + 1) % total)} aria-label="Próxima">›</button>
            </div>
          ) : null}
          {total > 1 ? (
            <div className="viz-tiras">
              {ger.pieces.map((p: any, k: number) => (
                <button key={p.id} className={"viz-tira" + (k === i ? " on" : "")} onClick={() => { if (!ajustando) onIdx(k); }} style={{ backgroundImage: p.url ? `url(${p.url})` : undefined }} aria-label={`Peça ${k + 1}`} />
              ))}
            </div>
          ) : null}
          {total > 1 ? <button className="viz-del-slide" onClick={excluirSlide}>Excluir este slide</button> : null}
        </div>
        <div className="viz-ficha">
          {/* Legenda automática: a Yaya lê a arte + a marca + a ideia e escreve */}
          <div className="viz-linha col">
            <span>Legenda {total > 1 ? "do carrossel" : "do post"}</span>
            {legenda ? (
              <>
                <textarea className="viz-legenda" value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={5} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="bk-mini" disabled={gerandoLeg} onClick={gerarLegenda}>{gerandoLeg ? "Gerando…" : "Gerar de novo"}</button>
                  <span className="img-motor">{legenda.length} caracteres · vai junto para o Calendário.</span>
                </div>
              </>
            ) : (
              <button className="bk-mini pri" disabled={gerandoLeg} onClick={gerarLegenda}>{gerandoLeg ? "A Yaya está escrevendo…" : "✨ Gerar legenda automática"}</button>
            )}
          </div>
          <div className="viz-linha"><span>Onde</span><b>{rede}{fmt ? " · " + fmt : ""}</b></div>
          <div className="viz-linha"><span>Quando</span><b>{dataTxt || "—"}</b></div>
          <div className="viz-linha"><span>Status</span><b className={"lib-status " + statusClasse(ger.status)}>{statusLabel(ger.status)}</b></div>
          {ger.prompt ? <div className="viz-linha col"><span>Ideia</span><p>{ger.prompt}</p></div> : null}
          <div className="viz-linha col">
            <span>Referências usadas</span>
            {detalhe == null ? <p className="viz-dim">carregando…</p>
              : (detalhe.refsPost.length || detalhe.refsMarca.length) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detalhe.refsPost.length ? (
                    <div>
                      <div className="viz-refs-t">Deste post</div>
                      <div className="viz-refs">{detalhe.refsPost.map((r: any, k: number) => <span key={k} style={{ backgroundImage: r.url ? `url(${r.url})` : undefined }} />)}</div>
                    </div>
                  ) : null}
                  {detalhe.refsMarca.length ? (
                    <div>
                      <div className="viz-refs-t">Da sua marca (logo e clima)</div>
                      <div className="viz-refs">{detalhe.refsMarca.map((r: any, k: number) => <span key={k} title={r.tipo === "logo" ? "Logo da marca" : "Referência da marca"} style={{ backgroundImage: r.url ? `url(${r.url})` : undefined }} />)}</div>
                    </div>
                  ) : null}
                </div>
              ) : <p className="viz-dim">Geração livre — sem referências e sem forçar a identidade da marca.</p>}
          </div>
          <div style={{ marginTop: 4 }}>
            <button className={"img-lib-fav" + (im?.favorite ? " on" : "")} onClick={() => im && onFav(im.id, !im.favorite)}>{im?.favorite ? "★ Favoritada" : "☆ Favoritar"}</button>
          </div>
        </div>
      </div>
    </MktModal>
  );
}
