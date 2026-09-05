import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { mktApi } from "../../../lib/mktApi";
import { MktModal } from "./_ui";
import { RedeIcon } from "./_icons";

type PickOpt = { value: string; label: string; icon?: ReactNode };

// Seletor customizado que mostra o LOGO real da rede (o <select> nativo só renderiza texto na option).
function PickSelect({ value, options, onChange, disabled, title }: { value: string; options: PickOpt[]; onChange: (v: string) => void; disabled?: boolean; title?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value) || options[0];
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="rad-pick" ref={wrap}>
      <button type="button" className="rad-pick-btn" disabled={disabled} title={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => !disabled && setOpen((v) => !v)}>
        <span className="rad-pick-cur">{cur?.icon ? <span className="rad-pick-ico">{cur.icon}</span> : null}{cur?.label}</span>
        <svg className="rad-pick-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open ? (
        <div className="rad-pick-pop" role="listbox">
          {options.map((o) => (
            <button type="button" role="option" aria-selected={o.value === value} key={o.value || "_"} className={"rad-pick-opt" + (o.value === value ? " sel" : "")} onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.icon ? <span className="rad-pick-ico">{o.icon}</span> : <span className="rad-pick-ico" />}{o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const FMT_OPTS: PickOpt[] = [
  { value: "", label: "Todos os formatos", icon: <span>▦</span> },
  { value: "reel", label: "Reels", icon: <span>▶</span> },
  { value: "carrossel", label: "Carrossel", icon: <span>▤</span> },
  { value: "estatico", label: "Estático", icon: <span>▢</span> },
  { value: "story", label: "Stories", icon: <span>▯</span> },
  { value: "video", label: "Vídeo longo", icon: <span>🎬</span> },
];
const rIco = (slug: string) => <RedeIcon slug={slug} size={16} />;
const REDE_OPTS: PickOpt[] = [
  { value: "", label: "Todas as redes", icon: <span>🌐</span> },
  { value: "instagram", label: "Instagram", icon: rIco("instagram") },
  { value: "tiktok", label: "TikTok", icon: rIco("tiktok") },
  { value: "youtube", label: "YouTube", icon: rIco("youtube") },
  { value: "linkedin", label: "LinkedIn", icon: rIco("linkedin") },
  { value: "facebook", label: "Facebook", icon: rIco("facebook") },
  { value: "pinterest", label: "Pinterest", icon: rIco("pinterest") },
];

// monta a URL de EMBED (reproduzir/visualizar dentro do portal) a partir do link do post
function embedDe(url?: string): { src: string; alto: boolean } | null {
  if (!url) return null;
  let m = url.match(/instagram\.com\/(p|reel|reels|tv)\/([\w-]+)/i);
  if (m) return { src: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed`, alto: true };
  m = url.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/i) || url.match(/tiktok\.com\/(?:embed\/v2|v)\/(\d+)/i);
  if (m) return { src: `https://www.tiktok.com/embed/v2/${m[1]}`, alto: true };
  m = url.match(/youtube\.com\/shorts\/([\w-]+)|youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)/i);
  if (m) return { src: `https://www.youtube.com/embed/${m[1] || m[2] || m[3]}`, alto: false };
  return null;
}
// link "ver referência": o post se houver, senão o perfil (@handle)
function linkRef(r: any): string | null {
  if (r.example_url) return r.example_url;
  const h = String(r.example_handle || "").replace(/^@/, "").trim();
  return h && !h.includes(" ") ? `https://www.instagram.com/${h}/` : null;
}

// ============================================================================
// RADAR DE REFERÊNCIAS — o "cérebro de agência". Mostra tendências/posts que estão
// viralizando no SEGMENTO do cliente (pesquisa real com fontes), com "por que
// funciona", e um botão para CRIAR um post inspirado (adaptado à marca, editável).
// A pesquisa é ASSÍNCRONA no servidor: dispara e a tela acompanha por status —
// CONTINUA se o cliente sair/voltar/atualizar. Dá pra CANCELAR. Estado de carregando real.
// ============================================================================

const FMT_ICON: Record<string, string> = { reel: "▶", carrossel: "▤", estatico: "▢", "estático": "▢" };

export default function Radar() {
  const [refs, setRefs] = useState<any[]>([]);
  const [foco, setFoco] = useState("");
  const [formato, setFormato] = useState("");   // reel | carrossel | estatico | story | video
  const [rede, setRede] = useState("");         // instagram | tiktok | youtube | ...
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);   // motivo do vazio (persistente na tela)
  const [toast, setToast] = useState<string | null>(null);
  const [criando, setCriando] = useState<string | null>(null);
  const [verRef, setVerRef] = useState<any | null>(null); // referência aberta no visualizador (embed)
  const pollRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);
  const nav = useNavigate();
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3200); };

  function pararPolling() { if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = undefined; } }

  // consulta o estado da pesquisa; se ainda rodando, agenda o próximo tick (reata sozinho)
  async function checarStatus(mostrarFimNoToast = false) {
    let s: any = null;
    try { s = await mktApi.get<any>("/marketing/research/status"); } catch { /* tenta no próximo tick */ }
    if (!mountedRef.current) return;
    if (s) {
      setRefs(s.refs || []);
      setSearching(!!s.searching);
      if (!s.searching) setErro(s.error || null);
      if (s.searching) {
        pollRef.current = window.setTimeout(() => checarStatus(true), 4000); // continua acompanhando
      } else {
        pararPolling();
        if (mostrarFimNoToast) flash(s.error ? String(s.error) : (s.refs?.length ? `${s.refs.length} referências encontradas ✓` : "A pesquisa terminou sem referências. Tente de novo."));
      }
    } else if (searching) {
      pollRef.current = window.setTimeout(() => checarStatus(mostrarFimNoToast), 4000);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    checarStatus().finally(() => { if (mountedRef.current) setLoading(false); }); // ao abrir, reata pesquisa em andamento
    return () => { mountedRef.current = false; pararPolling(); };
  }, []);

  async function atualizar() {
    setErro(null);
    try {
      const r = await mktApi.post<any>("/marketing/research/radar", { tema: foco.trim() || undefined, formato: formato || undefined, rede: rede || undefined }, { timeoutMs: 120000 });
      if (r?.searching) { setSearching(true); flash(r.already ? "Já estou pesquisando — aguarde." : "Pesquisando referências reais no seu segmento…"); pararPolling(); pollRef.current = window.setTimeout(() => checarStatus(true), 3000); }
      else flash(r?.note || "Não consegui iniciar a pesquisa agora.");
    } catch { flash("Não consegui iniciar a pesquisa agora. Tente de novo."); }
  }

  async function cancelar() {
    pararPolling(); setSearching(false); flash("Pesquisa cancelada.");
    try { await mktApi.post("/marketing/research/cancel", {}); } catch { /* já parou no front */ }
  }

  async function criarInspirado(ref: any) {
    setCriando(ref.id);
    flash("Montando um post inspirado nesta referência…");
    try {
      const b = await mktApi.post<any>("/marketing/research/refs/" + ref.id + "/brief", {}, { timeoutMs: 60000 });
      nav("/admin/marketing/imagens", { state: { prefill: { prompt: b?.prompt || ref.angle || "", estilo: b?.estilo || "", formato: b?.formato || (ref.format === "carrossel" ? "carrossel" : "estatico"), refId: b?.refId || ref.id } } });
    } catch { flash("Não consegui montar o post agora. Tente de novo."); } finally { setCriando(null); }
  }

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Produzir</div>
      <h1 className="page-title">Radar de Referências</h1>
      <p className="page-sub">O que está viralizando no seu segmento agora — com o porquê. A IA pesquisa referências reais e você cria posts inspirados, na sua marca.</p>

      <div className="rad-bar">
        <input className="rad-foco" type="text" value={foco} onChange={(e) => setFoco(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !searching) atualizar(); }} disabled={searching}
          placeholder="Foco opcional (ex.: WhatsApp, tráfego pago) — vazio = todo o segmento" />
        <PickSelect value={formato} options={FMT_OPTS} onChange={setFormato} disabled={searching} title="Formato" />
        <PickSelect value={rede} options={REDE_OPTS} onChange={setRede} disabled={searching} title="Rede" />
        {searching
          ? <button className="rad-cancel" onClick={cancelar}>Cancelar</button>
          : <button className="bk-mini pri" onClick={atualizar}>🔎 Atualizar radar</button>}
      </div>

      {searching ? (
        <div className="rad-loading">
          <div className="rad-spin" />
          <b>Pesquisando referências reais no seu segmento…</b>
          <small>Isso leva cerca de 20–30 segundos. Pode continuar navegando — a pesquisa segue e aparece aqui quando terminar.</small>
        </div>
      ) : loading ? <div className="rad-empty">Carregando…</div>
        : !refs.length ? (
          <div className="rad-empty">
            <span style={{ fontSize: 34 }}>{erro ? "🔍" : "📡"}</span>
            <b>{erro ? "Nada externo desta vez" : "Seu radar ainda está vazio"}</b>
            <small>{erro || <>Clique em <b>Atualizar radar</b> — a IA pesquisa os posts que estão bombando no seu segmento e te mostra o porquê de cada um.</>}</small>
          </div>
        ) : (
          <div className="rad-grid">
            {refs.map((r) => {
              const emb = embedDe(r.example_url);
              const reel = String(r.format || "").toLowerCase() === "reel";
              const link = linkRef(r);
              return (
              <div className="rad-card" key={r.id}>
                <div className={"rad-thumb" + (emb ? " clica" : "")} onClick={() => { if (emb) setVerRef(r); }}>
                  {r.thumbnail
                    ? <><img src={r.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { const im = e.currentTarget; im.style.display = "none"; (im.nextElementSibling as HTMLElement)?.style.setProperty("display", "flex"); }} />
                        <div className="rad-ph" style={{ display: "none" }}>{FMT_ICON[String(r.format || "").toLowerCase()] || "◆"}</div></>
                    : <div className="rad-ph">{FMT_ICON[String(r.format || "").toLowerCase()] || "◆"}</div>}
                  {emb ? <span className="rad-play">{reel ? "▶" : "⛶"}</span> : null}
                </div>
                <div className="rad-body">
                  <div className="rad-top">
                    <span className="rad-fmt">{FMT_ICON[String(r.format || "").toLowerCase()] || "◆"} {r.format || "post"}</span>
                    {r.example_handle ? <span className="rad-handle">{String(r.example_handle).replace(/^@?/, "@")}</span> : null}
                  </div>
                  <div className="rad-title">{r.title || r.angle}</div>
                  {r.hook ? <div className="rad-hook">“{r.hook}”</div> : null}
                  {r.why ? <div className="rad-why"><b>Por que funciona:</b> {r.why}</div> : null}
                  <div className="rad-foot">
                    {emb ? <button className="rad-ver" onClick={() => setVerRef(r)}>{reel ? "▶ Reproduzir" : "⛶ Visualizar"}</button>
                      : link ? <a className="rad-src" href={link} target="_blank" rel="noreferrer">ver referência ↗</a> : <span />}
                    <button className="rad-usar" disabled={criando === r.id} onClick={() => criarInspirado(r)}>{criando === r.id ? "…" : "✨ criar post inspirado"}</button>
                  </div>
                </div>
              </div>
            ); })}
          </div>
        )}

      <div className="rad-nota">As referências vêm de pesquisa pública do seu segmento (com fontes). A arte gerada é <b>original</b>, adaptada à sua marca — nunca uma cópia.</div>

      {verRef ? (() => {
        const emb = embedDe(verRef.example_url); const link = linkRef(verRef);
        return (
          <MktModal title={verRef.title || "Referência"} onClose={() => setVerRef(null)} wide footer={
            <>
              {link ? <a className="bk-mini" href={link} target="_blank" rel="noreferrer">Abrir original ↗</a> : null}
              <button className="bk-mini" onClick={() => setVerRef(null)}>Fechar</button>
              <button className="bk-mini pri" onClick={() => { const r = verRef; setVerRef(null); criarInspirado(r); }}>✨ criar post inspirado</button>
            </>
          }>
            {emb ? <div className={"rad-embed" + (emb.alto ? " alto" : "")}><iframe src={emb.src} title="referência" allow="autoplay; encrypted-media; clipboard-write; picture-in-picture" allowFullScreen loading="lazy" /></div>
              : <div className="rad-embed"><div className="rad-embed-none">Não consegui carregar a prévia — <a href={link || "#"} target="_blank" rel="noreferrer">abrir no app ↗</a></div></div>}
            {verRef.why ? <div className="rad-why" style={{ marginTop: 12 }}><b>Por que funciona:</b> {verRef.why}</div> : null}
          </MktModal>
        );
      })() : null}

      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}
