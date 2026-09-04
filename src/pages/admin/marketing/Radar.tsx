import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { mktApi } from "../../../lib/mktApi";

// ============================================================================
// RADAR DE REFERÊNCIAS — o "cérebro de agência". Mostra tendências/posts que estão
// viralizando no SEGMENTO do cliente (pesquisa real com fontes), com "por que
// funciona", e um botão para CRIAR um post inspirado (adaptado à marca, editável).
// Nada engessado: o nicho vem da marca; um foco livre é opcional; a arte é original.
// ============================================================================

const FMT_ICON: Record<string, string> = { reel: "▶", carrossel: "▤", estatico: "▢", "estático": "▢" };

export default function Radar() {
  const [refs, setRefs] = useState<any[]>([]);
  const [foco, setFoco] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [criando, setCriando] = useState<string | null>(null);
  const nav = useNavigate();
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3000); };

  async function load() { try { const r = await mktApi.get<any>("/marketing/research/refs"); setRefs(r?.refs || []); } catch { setRefs([]); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);

  async function atualizar() {
    setBusy(true);
    flash("Pesquisando o que está viralizando no seu segmento…");
    try {
      const r = await mktApi.post<any>("/marketing/research/radar", { tema: foco.trim() || undefined });
      if (r?.refs?.length) { setRefs(r.refs); flash(`${r.refs.length} referências encontradas ✓`); }
      else flash(r?.note || "Não trouxe referências desta vez. Tente de novo.");
    } catch { flash("Não consegui pesquisar agora. Tente de novo em instantes."); } finally { setBusy(false); }
  }

  async function criarInspirado(ref: any) {
    setCriando(ref.id);
    flash("Montando um post inspirado nesta referência…");
    try {
      const b = await mktApi.post<any>("/marketing/research/refs/" + ref.id + "/brief", {});
      // pré-preenche o gerador de imagem (editável) — não gera nada sozinho
      nav("/admin/marketing/imagens", { state: { prefill: { prompt: b?.prompt || ref.angle || "", estilo: b?.estilo || "", formato: b?.formato || (ref.format === "carrossel" ? "carrossel" : "estatico") } } });
    } catch { flash("Não consegui montar o post agora. Tente de novo."); } finally { setCriando(null); }
  }

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Produzir</div>
      <h1 className="page-title">Radar de Referências</h1>
      <p className="page-sub">O que está viralizando no seu segmento agora — com o porquê. A IA pesquisa referências reais e você cria posts inspirados, na sua marca.</p>

      <div className="rad-bar">
        <input className="rad-foco" type="text" value={foco} onChange={(e) => setFoco(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") atualizar(); }}
          placeholder="Foco opcional (ex.: WhatsApp, tráfego pago, atendimento) — vazio = todo o seu segmento" />
        <button className="bk-mini pri" disabled={busy} onClick={atualizar}>{busy ? "Pesquisando…" : "🔎 Atualizar radar"}</button>
      </div>

      {loading ? <div className="rad-empty">Carregando…</div>
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
