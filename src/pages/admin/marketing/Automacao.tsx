import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi } from "../../../lib/mktApi";
import { MktModal } from "./_ui";
import { ChannelsPanel } from "./_channels";

// ============================================================================
// Tela 6 — AGENDAMENTO & AUTOMAÇÃO. NATIVO no portal, ligado à marketing-api.
// A IA gera N posts/dia → Modo A (você aprova com 1 toque) ou Modo B (automático,
// sempre pela verificação da marca). Contas conectadas (reusa o ChannelsPanel do
// Post for Me). Comentário→DM (palavra vira lead). Config real (cadência, horário,
// idioma, origem dos temas, canal de aprovação). Dados 100% reais; sem jargão.
// ============================================================================

const NP: Record<string, string> = { IG: "ig", FB: "fb", TikTok: "tt", LinkedIn: "li", YouTube: "yt" };

export default function Automacao() {
  const [cfg, setCfg] = useState<any | null>(null);
  const [approve, setApprove] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [kwDraft, setKwDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };

  async function loadCfg() { try { setCfg(await mktApi.get<any>("/marketing/automation/config")); } catch { setCfg({}); } }
  async function loadApprove() { try { const b = await mktApi.get<any[]>("/marketing/posts/backlog"); setApprove((b || []).filter((p) => p.status === "aprovar")); } catch { setApprove([]); } }
  async function loadKw() { try { setKeywords(await mktApi.get<any[]>("/marketing/automation/keywords")); } catch { setKeywords([]); } }
  useEffect(() => { loadCfg(); loadApprove(); loadKw(); }, []);

  async function setMode(mode: "A" | "B") { try { setCfg(await mktApi.put<any>("/marketing/automation/config", { mode })); flash("Modo " + mode + (mode === "B" ? " · automático" : " · aprovar")); } catch { flash("Não foi possível trocar o modo."); } }

  async function runNow() {
    setRunning(true);
    try {
      const r = await mktApi.post<any>("/marketing/automation/run", {});
      if (!r?.generated) { flash(r?.note || "Não consegui gerar agora."); setRunning(false); return; }
      flash(`Criando ${r.generated} peça(s) — a IA está gerando a arte…`);
      // a arte é assíncrona: vamos completando (legenda + aprovar/agendar) conforme fica pronta
      let tentativas = 0;
      const poll = async () => {
        tentativas++;
        let f: any = {};
        try { f = await mktApi.post<any>("/marketing/automation/finalize", {}); } catch { /* tenta de novo */ }
        loadApprove();
        const partes: string[] = [];
        if (f.aprovar) partes.push(`${f.aprovar} p/ aprovar`);
        if (f.agendado) partes.push(`${f.agendado} agendado(s)`);
        if (f.falhou) partes.push(`${f.falhou} falhou`);
        if (f.gerando) partes.push(`${f.gerando} gerando a arte…`);
        if (partes.length) flash(partes.join(" · "));
        if ((f.gerando || 0) > 0 && tentativas < 16) { window.setTimeout(poll, 9000); return; }
        setRunning(false);
        if (!f.gerando) flash(mode === "B" ? "Pronto — as peças foram agendadas no melhor horário (veja no Calendário)." : "Pronto — suas peças estão aqui aguardando aprovação.");
      };
      window.setTimeout(poll, 7000);
    } catch { flash("Não foi possível gerar agora."); setRunning(false); }
  }

  async function approvePost(id: string) {
    try { await mktApi.post("/marketing/posts/" + id + "/publish"); flash("Aprovado ✓"); loadApprove(); }
    catch (e: any) {
      if (e?.status === 422 || e?.body?.blocked) flash("Bloqueado pela verificação da marca: " + (e?.body?.reason || "ajuste a peça"));
      else flash("Não foi possível aprovar agora.");
    }
  }
  async function delPost(id: string) { try { await mktApi.del("/marketing/posts/" + id); loadApprove(); } catch { flash("Não foi possível remover."); } }

  async function addKw() {
    const k = kwDraft.trim().toUpperCase(); if (!k) return;
    try { await mktApi.post("/marketing/automation/keywords", { keyword: k }); setKwDraft(""); loadKw(); } catch { flash("Não foi possível adicionar."); }
  }
  async function delKw(id: string) { try { await mktApi.del("/marketing/automation/keywords/" + id); loadKw(); } catch { flash("Não foi possível remover."); } }

  if (!cfg) return <div className="mkt-root"><div className="eyebrow">Marketing · Distribuir</div><h1 className="page-title">Agendamento & Automação</h1><div className="ap-empty">Carregando…</div></div>;

  const mode = cfg.mode || "A";
  const cadence = cfg.cadence_per_day ?? 2;
  const active = cfg.active !== false;

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Distribuir</div>
      <h1 className="page-title">Agendamento & Automação</h1>
      <p className="page-sub">A IA gera conteúdo, você aprova com 1 toque e publica nas suas redes — no tom da sua marca.</p>

      <div className="ap-header">
        <div className="ap-hl">
          <span style={{ fontSize: 30 }}>🤖</span>
          <div>
            <div className="ap-title">Automação de postagens</div>
            <div className="ap-sub">A IA gera {cadence} post{cadence === 1 ? "" : "s"}/dia · você aprova com 1 toque · publica nas suas redes</div>
          </div>
        </div>
        <div className="ap-hr">
          <span className={"ap-badge" + (active ? "" : " off")}>● {active ? "ATIVO" : "PAUSADO"}</span>
          <div className="ap-modes">
            <button className={"ap-mode" + (mode === "A" ? " sel" : "")} onClick={() => setMode("A")}>Modo A · aprovar</button>
            <button className={"ap-mode" + (mode === "B" ? " sel" : "")} onClick={() => setMode("B")}>Modo B · automático</button>
          </div>
        </div>
      </div>

      <div className="ap-grid">
        <div className="ap-main">
          <div className="ap-lbl">Contas conectadas (redes sociais)</div>
          <ChannelsPanel flash={flash} />

          <div className="ap-lbl">Para aprovar (1 toque)</div>
          {cfg.approval_channel === "whatsapp" && cfg.whatsapp_num ? (
            <div className="ap-wa">📲 Aviso no WhatsApp <b>{cfg.whatsapp_num}</b> quando houver peça para aprovar <span style={{ opacity: .7 }}>(em breve; por ora aprove aqui no painel)</span>.</div>
          ) : null}
          <div style={{ marginBottom: 12 }}>
            <button className="bk-mini pri" disabled={running} onClick={runNow}>{running ? "Gerando…" : `✨ Gerar ${cadence} agora`}</button>
            <span className="ap-cn" style={{ marginLeft: 10 }}>{active ? "▶ Roda sozinho todo dia. " : "⏸ Pausado — não roda sozinho. "}{mode === "B" ? "No Modo B agenda no melhor horário (após a verificação da marca)." : "No Modo A ficam aqui para você aprovar."} Ou gere agora:</span>
          </div>
          {approve.length ? approve.map((p) => (
            <div className="ap-post" key={p.id}>
              <div className="ap-thumb">
                {p.thumb_url ? <img src={p.thumb_url} alt={p.title || "arte"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /> : <><b>{(p.type || "").toLowerCase() === "carrossel" ? "▤ CARROSSEL" : (p.type === "Story" ? "▯ STORY" : "▤ POST")}</b><span>gerando a arte…</span></>}
                {p.thumb_url && p.slides > 1 ? <span className="ap-th-badge">▤ {p.slides}</span> : null}
              </div>
              <div className="ap-pb">
                <div className="ap-tags"><span className="ap-tag">{(p.type || "POST").toUpperCase()}</span></div>
                <div className="ap-pt">{p.title}</div>
                {p.external_ids?.auto_note ? <div className="ap-note">⚠️ {p.external_ids.auto_note}</div> : null}
                <div className="ap-pl">{p.caption || "Legenda na identidade do seu Brand Kit."}</div>
                <div className="ap-pf">
                  <span className="ap-nets">{(p.channels || []).map((c: string) => <i key={c} className={"np " + (NP[c] || "ig")}>{c === "IG" ? "IG" : c === "FB" ? "f" : c === "TikTok" ? "TT" : c === "LinkedIn" ? "in" : "▶"}</i>)}</span>
                  <span className="ap-when">aguardando aprovação</span>
                  <span className="ap-acts">
                    <button className="ap-b" onClick={() => delPost(p.id)}>Descartar</button>
                    <button className="ap-b pri" onClick={() => approvePost(p.id)}>Aprovar</button>
                  </span>
                </div>
              </div>
            </div>
          )) : <div className="ap-empty">Nada aguardando aprovação. Clique em <b>Gerar {cadence} agora</b> para a IA criar as peças do dia.</div>}
        </div>

        <aside className="ap-aside">
          <div className="ap-card">
            <div className="ap-ch">Configuração <button className="ap-edit" onClick={() => setCfgOpen(true)}>Editar</button></div>
            <div className="ap-row"><span>Cadência</span><b>{cadence}/dia</b></div>
            <div className="ap-row"><span>Modo</span><span className="ap-mini"><b className={mode === "A" ? "on" : ""}>A · aprovar</b><b className={mode === "B" ? "on" : ""}>B · auto</b></span></div>
            <div className="ap-row"><span>Horário</span><b>{cfg.random_time !== false ? "Aleatório (melhor janela)" : "Fixo"}</b></div>
            <div className="ap-row"><span>Idioma</span><b className="mono">{cfg.language || "PT / BR"}</b></div>
            <div className="ap-row"><span>Origem dos temas</span><b>{cfg.theme_sources || "YouTube + Facebook"}</b></div>
            <div className="ap-row"><span>Canal de aprovação</span><b>{cfg.approval_channel === "whatsapp" ? "WhatsApp" : "Aqui no painel"}{cfg.whatsapp_num ? <span className="mono"> {cfg.whatsapp_num}</span> : null}</b></div>
          </div>

          <div className="ap-card">
            <div className="ap-ch">Comentário → DM (captura)</div>
            <div className="ap-ct">Cadastre as palavras-chave agora. <b>Em breve:</b> quem comentar a palavra recebe o material na DM e vira lead no CRM.</div>
            <div className="ap-kw">
              {keywords.length ? keywords.map((k) => <span key={k.id}>{k.keyword}<span className="kx" onClick={() => delKw(k.id)}>×</span></span>) : <span style={{ background: "transparent", color: "var(--muted-2)", fontFamily: "var(--font-ui)" }}>nenhuma palavra ainda</span>}
            </div>
            <div className="ap-kwadd">
              <input type="text" value={kwDraft} onChange={(e) => setKwDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addKw(); }} placeholder="ex.: AGENTE" />
              <button className="bk-mini" onClick={addKw}>Adicionar</button>
            </div>
            <div className="ap-cn">As palavras ficam salvas e serão ligadas aos posts quando a captura por comentário entrar no ar.</div>
          </div>

          <div className="ap-card">
            <div className="ap-ch">Como a IA cria (esteira)</div>
            <ol className="ap-esteira">
              <li><b>Tema</b> — a IA escolhe um assunto relevante ao seu setor</li>
              <li><b>Arte</b> — gera a imagem/carrossel na identidade do seu Brand Kit</li>
              <li><b>Legenda</b> — escreve o texto olhando a arte, na voz da marca</li>
              <li><b>Verificação</b> — passa pela regra do seu setor</li>
              <li><b>Publicação</b> — Modo A você aprova; Modo B agenda no melhor horário</li>
            </ol>
          </div>
        </aside>
      </div>

      {cfgOpen && <ConfigModal cfg={cfg} onClose={() => setCfgOpen(false)} onSaved={(c) => { setCfg(c); setCfgOpen(false); flash("Configuração salva"); }} flash={flash} />}
      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}

function ConfigModal({ cfg, onClose, onSaved, flash }: any) {
  const [cadence, setCadence] = useState(String(cfg.cadence_per_day ?? 2));
  const [randomTime, setRandomTime] = useState(cfg.random_time !== false);
  const [language, setLanguage] = useState(cfg.language || "PT / BR");
  const [themes, setThemes] = useState(cfg.theme_sources || "YouTube + Facebook");
  const [approval, setApproval] = useState(cfg.approval_channel || "painel");
  const [wa, setWa] = useState(cfg.whatsapp_num || "");
  const [active, setActive] = useState(cfg.active !== false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const c = await mktApi.put<any>("/marketing/automation/config", {
        cadence_per_day: Math.max(1, Math.min(6, Number(cadence) || 2)),
        random_time: randomTime, language, theme_sources: themes,
        approval_channel: approval, whatsapp_num: approval === "whatsapp" ? (wa.trim() || null) : null, active,
      });
      onSaved(c);
    } catch { flash("Não foi possível salvar."); } finally { setBusy(false); }
  }
  return (
    <MktModal title="Configuração da automação" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" disabled={busy} onClick={save}>Salvar</button></>}>
      <div className="bkf"><label>Cadência (posts por dia)</label><input type="text" value={cadence} onChange={(e) => setCadence(e.target.value.replace(/[^0-9]/g, ""))} placeholder="2" /></div>
      <div className="bkf"><label>Horário</label>
        <select value={randomTime ? "auto" : "fixo"} onChange={(e) => setRandomTime(e.target.value === "auto")}><option value="auto">Aleatório (melhor janela)</option><option value="fixo">Fixo</option></select>
      </div>
      <div className="bkf"><label>Idioma</label><input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="PT / BR" /></div>
      <div className="bkf"><label>Origem dos temas</label><input type="text" value={themes} onChange={(e) => setThemes(e.target.value)} placeholder="YouTube + Facebook" /></div>
      <div className="bkf"><label>Canal de aprovação</label>
        <select value={approval} onChange={(e) => setApproval(e.target.value)}><option value="painel">Aqui no painel</option><option value="whatsapp">WhatsApp</option></select>
      </div>
      {approval === "whatsapp" ? <div className="bkf"><label>WhatsApp para aprovação</label><input type="text" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="+55 11 90000-0000" /></div> : null}
      <div className="bkf"><label>Automação</label>
        <select value={active ? "on" : "off"} onChange={(e) => setActive(e.target.value === "on")}><option value="on">Ativa</option><option value="off">Pausada</option></select>
      </div>
    </MktModal>
  );
}
