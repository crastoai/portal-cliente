import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { mktApi } from "../../../lib/mktApi";

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
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [criando, setCriando] = useState<string | null>(null);
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
    try {
      const r = await mktApi.post<any>("/marketing/research/radar", { tema: foco.trim() || undefined });
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
          placeholder="Foco opcional (ex.: WhatsApp, tráfego pago, atendimento) — vazio = todo o seu segmento" />
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
            <span style={{ fontSize: 34 }}>📡</span>
            <b>Seu radar ainda está vazio</b>
            <small>Clique em <b>Atualizar radar</b> — a IA pesquisa os posts que estão bombando no seu segmento e te mostra o porquê de cada um.</small>
          </div>
        ) : (
          <div className="rad-grid">
            {refs.map((r) => (
              <div className="rad-card" key={r.id}>
                {r.thumbnail ? <div className="rad-thumb"><img src={r.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget.closest(".rad-thumb") as HTMLElement)?.style.setProperty("display", "none"); }} /></div> : null}
                <div className="rad-top">
                  <span className="rad-fmt">{FMT_ICON[String(r.format || "").toLowerCase()] || "◆"} {r.format || "post"}</span>
                  {r.example_handle ? <span className="rad-handle">{String(r.example_handle).replace(/^@?/, "@")}</span> : null}
                </div>
                <div className="rad-title">{r.title || r.angle}</div>
                {r.hook ? <div className="rad-hook">“{r.hook}”</div> : null}
                {r.why ? <div className="rad-why"><b>Por que funciona:</b> {r.why}</div> : null}
                <div className="rad-foot">
                  {r.example_url ? <a className="rad-src" href={r.example_url} target="_blank" rel="noreferrer">ver referência ↗</a> : <span />}
                  <button className="rad-usar" disabled={criando === r.id} onClick={() => criarInspirado(r)}>{criando === r.id ? "…" : "✨ criar post inspirado"}</button>
                </div>
              </div>
            ))}
          </div>
        )}

      <div className="rad-nota">As referências vêm de pesquisa pública do seu segmento (com fontes). A arte gerada é <b>original</b>, adaptada à sua marca — nunca uma cópia.</div>

      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}
