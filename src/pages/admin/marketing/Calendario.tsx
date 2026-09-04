import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mktApi, activeUnit } from "../../../lib/mktApi";
import { MktModal } from "./_ui";
import { ChannelsModal } from "./_channels";
import { RedeIcon, CANAIS, slugDoCanal } from "./_icons";

// ============================================================================
// Tela 5 — CALENDÁRIO de Marketing. NATIVO no portal, ligado à marketing-api.
// Planejador Mês/Semana/Dia + backlog "A agendar" (posts sem data — inclui as
// peças que vêm do "Usar → Calendário" de Imagens/Cortes) + drag-drop (agendar/
// reagendar/desagendar) + filtros + Nova publicação. Publicar passa pelo
// compliance-gate (bloqueia peça fora da regra do setor). Dados 100% reais.
// (A publicação real nas redes via Post for Me liga como integração; o gate e o
// planejamento já são reais.) Modais via MktModal. Sem jargão.
// ============================================================================

const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MON = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const TYPES = ["Post", "Reel", "Carrossel", "Story", "Anúncio", "E-mail"];
const ST_LABEL: Record<string, string> = { rascunho: "Rascunho", agendado: "Agendado", aprovar: "Aprovar", publicado: "Publicado", falhou: "Falhou" };
// estados que o usuário escolhe à mão no modal (falhou é do sistema, não é opção manual)
const ST_EDITAVEIS = ["rascunho", "agendado", "aprovar", "publicado"] as const;
const WHO_LABEL: Record<string, string> = { org: "Orgânico · Pat", paid: "Pago · Roy", mail: "E-mail" };
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (s: string) => { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const localToISO = (dateKey: string, time: string) => { try { return new Date(`${dateKey}T${(time || "09:00")}:00`).toISOString(); } catch { return new Date().toISOString(); } };
// canal do post → slug da rede (para o horário inteligente por rede)
const CH_NET: Record<string, string> = { IG: "instagram", FB: "facebook", TikTok: "tiktok", LinkedIn: "linkedin", YouTube: "youtube", X: "x", Pinterest: "pinterest", WhatsApp: "whatsapp" };
function schedParts(iso: string) { const d = new Date(iso); return { key: keyOf(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; }

// normaliza um post do back p/ o modelo do calendário
function norm(p: any) {
  const sched = p.scheduled_at ? schedParts(p.scheduled_at) : null;
  return { id: p.id, who: p.track || "org", type: p.type || "Post", title: p.title || "(sem título)", caption: p.caption || "",
    st: p.status || "rascunho", ch: p.channels || [], piece: p.piece_kind || "", pieceRef: p.piece_ref || null,
    thumb: p.thumb_url || null, slides: p.slides || 0, d: sched?.key || null, t: sched?.time || "09:00" };
}

export default function Calendario() {
  const [view, setView] = useState<"mes" | "semana" | "dia">("semana");
  const [ref, setRef] = useState<Date>(() => new Date());
  const [posts, setPosts] = useState<any[]>([]);     // agendados
  const [backlog, setBacklog] = useState<any[]>([]);  // sem data
  const [filWho, setFilWho] = useState<Set<string>>(new Set(["org", "paid", "mail"]));
  const [filSt, setFilSt] = useState<Set<string>>(new Set(["rascunho", "agendado", "aprovar", "publicado", "falhou"]));
  const [colorBy, setColorBy] = useState<"trilha" | "status">("trilha");
  const [modal, setModal] = useState<null | { editId?: string; d?: string }>(null);
  const [chOpen, setChOpen] = useState(false);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const drag = useRef<string | null>(null);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };
  const todayKey = keyOf(new Date());

  async function load() {
    try {
      const [sc, bl] = await Promise.all([mktApi.get<any[]>("/marketing/posts"), mktApi.get<any[]>("/marketing/posts/backlog")]);
      setPosts((sc || []).map(norm)); setBacklog((bl || []).map(norm));
    } catch { setPosts([]); setBacklog([]); }
  }
  // ao abrir (e a cada 60s), reconcilia com o provedor: agendados já publicados viram
  // "Publicado" sozinhos no sistema (com o link do post), sem precisar mexer em nada
  async function reconcile() {
    try { const r = await mktApi.post<any>("/marketing/posts/reconcile", {}); if ((r?.publicados || 0) > 0) flash(`${r.publicados} publicação(ões) confirmada(s) ✓`); }
    catch { /* silencioso */ } finally { load(); }
  }
  useEffect(() => {
    activeUnit().then(setUnitId).catch(() => {});
    reconcile();
    const t = window.setInterval(reconcile, 60000);
    return () => window.clearInterval(t);
  }, []);

  const pubsOn = (key: string) => posts.filter((p) => p.d === key && filWho.has(p.who) && filSt.has(p.st)).sort((a, b) => a.t.localeCompare(b.t));
  const colorClass = (p: any) => (colorBy === "status" ? "cst-" + p.st : p.who);

  // ---- ações no back ----
  // motivo honesto do provedor (sem rede conectada, arte não pronta, regra da marca) sobe pra tela
  const motivo = (e: any, fb: string) => ((e?.status === 422 || e?.body?.blocked) && e?.body?.reason) ? String(e.body.reason) : fb;
  async function scheduleBack(id: string, when: string) { try { await mktApi.post("/marketing/posts/" + id + "/schedule", { when }); flash("Agendado ✓"); load(); } catch (e: any) { flash(motivo(e, "Não foi possível agendar.")); } }
  const agendarHoje = (id: string) => scheduleBack(id, localToISO(todayKey, "09:00"));
  // mover um post já agendado = reagendar no provedor (cancela o antigo, recria na nova hora)
  async function moveBack(id: string, when: string) { try { await mktApi.post("/marketing/posts/" + id + "/schedule", { when }); load(); } catch (e: any) { flash(motivo(e, "Não foi possível mover.")); load(); } }
  async function unscheduleBack(id: string) { try { await mktApi.post("/marketing/posts/" + id + "/unschedule"); flash("Voltou para A agendar"); load(); } catch (e: any) { flash(motivo(e, "Não foi possível desagendar.")); load(); } }

  // ---- drag & drop ----
  const onDragStart = (e: React.DragEvent, kind: string, id: string) => { drag.current = kind + ":" + id; try { e.dataTransfer.setData("text/plain", drag.current); e.dataTransfer.effectAllowed = "move"; } catch { /* */ } };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("drop-hover"); };
  const onDragLeave = (e: React.DragEvent) => { (e.currentTarget as HTMLElement).classList.remove("drop-hover"); };
  const dropData = (e: React.DragEvent) => { let d = ""; try { d = e.dataTransfer.getData("text/plain"); } catch { /* */ } return d || drag.current || ""; };
  function onDropDay(e: React.DragEvent, key: string) {
    e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove("drop-hover");
    const d = dropData(e); if (!d) return; const [kind, id] = d.split(":");
    if (kind === "bk") scheduleBack(id, localToISO(key, "09:00"));
    else if (kind === "pub") { const p = posts.find((x) => x.id === id); moveBack(id, localToISO(key, p?.t || "09:00")); }
    drag.current = null;
  }
  function onDropRail(e: React.DragEvent) {
    e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove("drop-hover");
    const d = dropData(e); if (!d) return; const [kind, id] = d.split(":");
    if (kind === "pub") unscheduleBack(id);
    drag.current = null;
  }

  // ---- render das visões ----
  const label = (() => {
    if (view === "mes") return `${MON[ref.getMonth()]} ${ref.getFullYear()}`;
    if (view === "dia") return `${DOW[ref.getDay()]}, ${ref.getDate()} ${MON[ref.getMonth()]}`;
    const sun = addDays(ref, -ref.getDay()), last = addDays(sun, 6);
    return `${sun.getDate()} – ${last.getDate()} ${MON[last.getMonth()]}`;
  })();
  function nav(dir: number) {
    if (view === "mes") setRef(new Date(ref.getFullYear(), ref.getMonth() + dir, 1));
    else if (view === "dia") setRef(addDays(ref, dir));
    else setRef(addDays(ref, dir * 7));
  }

  const Card = ({ p }: any) => (
    <div className={"pub " + colorClass(p)} draggable onDragStart={(e) => onDragStart(e, "pub", p.id)} onClick={() => setModal({ editId: p.id })}>
      <span className={"p-st " + p.st}>{ST_LABEL[p.st] || p.st}</span>
      <span className="p-time">{p.t}</span>
      <span className="p-t"><b>{p.type}</b> · {p.title}</span>
      <span className="p-ch">{(p.ch || []).map((c: string) => <RedeIcon key={c} slug={slugDoCanal(c)} size={13} />)}</span>
    </div>
  );

  function Week() {
    const sun = addDays(ref, -ref.getDay());
    return (
      <div className="calW">
        {Array.from({ length: 7 }, (_, i) => {
          const dt = addDays(sun, i), key = keyOf(dt), pubs = pubsOn(key);
          return (
            <div key={key} className={"calW-day" + (key === todayKey ? " today" : "")} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={(e) => onDropDay(e, key)}>
              <div className="calW-dh"><span>{DOW[dt.getDay()]}</span><b>{dt.getDate()}</b><button className="calW-add" title="Nova publicação" onClick={() => setModal({ d: key })}>+</button></div>
              {pubs.map((p) => <Card key={p.id} p={p} />)}
            </div>
          );
        })}
      </div>
    );
  }

  function Month() {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    return (
      <div className="calM">
        <div className="calM-dow">{Array.from({ length: 7 }, (_, i) => <span key={i}>{DOW[i]}</span>)}</div>
        <div className="calM-grid">
          {Array.from({ length: 42 }, (_, i) => {
            const dt = addDays(gridStart, i), key = keyOf(dt), out = dt.getMonth() !== ref.getMonth(), pubs = pubsOn(key);
            return (
              <div key={key} className={"calM-cell" + (out ? " out" : "") + (key === todayKey ? " today" : "")} onClick={() => setModal({ d: key })} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={(e) => onDropDay(e, key)}>
                <span className="calM-num">{dt.getDate()}</span>
                {pubs.slice(0, 3).map((p) => (
                  <div key={p.id} className={"calM-pub " + colorClass(p)} draggable onDragStart={(e) => onDragStart(e, "pub", p.id)} onClick={(e) => { e.stopPropagation(); setModal({ editId: p.id }); }}>
                    <span className="m-dot" /><span className="m-time">{p.t}</span> <span className="p-txt">{p.type}</span>
                  </div>
                ))}
                {pubs.length > 3 ? <div className="calM-more" onClick={(e) => { e.stopPropagation(); setRef(parseKey(key)); setView("dia"); }}>+{pubs.length - 3} mais</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function Day() {
    const key = keyOf(ref), pubs = pubsOn(key);
    return (
      <div className="calD">
        <div className="calD-h">{DOW[ref.getDay()]} · {ref.getDate()} {MON[ref.getMonth()]}<span style={{ flex: 1 }} /><button className="calx-btn pri" style={{ padding: "5px 11px" }} onClick={() => setModal({ d: key })}>+ Nova publicação</button></div>
        {pubs.length ? pubs.map((p) => <div className="calD-row" key={p.id}><span className="calD-time">{p.t}</span><div style={{ flex: 1 }}><Card p={p} /></div></div>) : <div className="calD-empty">Nada agendado para este dia.</div>}
      </div>
    );
  }

  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); };

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Distribuir</div>
      <h1 className="page-title">Calendário de Marketing</h1>
      <p className="page-sub">Planeje e orquestre Orgânico, Pago e E-mail no mesmo lugar — como um calendário de verdade. Arraste do "A agendar" para a data.</p>

      <div className="calx-bar">
        <button className="calx-today" onClick={() => setRef(new Date())}>Hoje</button>
        <button className="calx-arrow" title="Anterior" onClick={() => nav(-1)}>‹</button>
        <button className="calx-arrow" title="Próximo" onClick={() => nav(1)}>›</button>
        <span className="calx-label">{label}</span>
        <span className="calx-sp" />
        <div className="seg">
          <button className={view === "mes" ? "on" : ""} onClick={() => setView("mes")}>Mês</button>
          <button className={view === "semana" ? "on" : ""} onClick={() => setView("semana")}>Semana</button>
          <button className={view === "dia" ? "on" : ""} onClick={() => setView("dia")}>Dia</button>
        </div>
        <button className="calx-btn" onClick={() => setChOpen(true)}>🔗 Redes conectadas</button>
        <button className="calx-btn pri" onClick={() => setModal({ d: todayKey })}>+ Nova publicação</button>
      </div>

      <div className="calx-legend">
        <span className="cl-item"><i className="cl-dot org" /> Orgânico · Pat</span>
        <span className="cl-item"><i className="cl-dot paid" /> Pago · Roy</span>
        <span className="cl-item"><i className="cl-dot mail" /> E-mail</span>
      </div>

      <div className="calx-filters">
        <span className="cf-lbl">Filtrar</span>
        {(["org", "paid", "mail"] as const).map((w) => <button key={w} className={"cf-chip" + (filWho.has(w) ? " on" : "")} onClick={() => toggle(filWho, w, setFilWho)}><i className={"cl-dot " + w} />{w === "org" ? "Orgânico" : w === "paid" ? "Pago" : "E-mail"}</button>)}
        <span className="cf-div" />
        {(["rascunho", "agendado", "aprovar", "publicado", "falhou"] as const).map((s) => <button key={s} className={"cf-chip" + (filSt.has(s) ? " on" : "")} onClick={() => toggle(filSt, s, setFilSt)}>{ST_LABEL[s]}</button>)}
        <span className="calx-sp" />
        <span className="cf-lbl">Colorir por</span>
        <div className="seg seg-sm"><button className={colorBy === "trilha" ? "on" : ""} onClick={() => setColorBy("trilha")}>Trilha</button><button className={colorBy === "status" ? "on" : ""} onClick={() => setColorBy("status")}>Status</button></div>
      </div>

      <div className="calx-wrap">
        <div>{view === "mes" ? <Month /> : view === "dia" ? <Day /> : <Week />}</div>
        <aside className="calx-rail" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDropRail}>
          <div className="rail-h">A agendar <span className="rail-n">{backlog.length}</span></div>
          <div className="rail-hint">Peças prontas (Cortes aprovados, artes do Brand Kit) e rascunhos. Arraste para uma data.</div>
          {backlog.length ? backlog.map((b) => (
            <div key={b.id} className={"bl-card " + b.who} draggable onDragStart={(e) => onDragStart(e, "bk", b.id)} onClick={() => setModal({ editId: b.id })}>
              {/* prévia da arte de verdade — não mais só um emoji */}
              <div className="bl-thumb">
                {b.thumb ? <img src={b.thumb} alt="" /> : <span className="bl-thumb-ph">{b.piece === "corte" ? "🎬" : b.piece === "brand" ? "🖼️" : "✎"}</span>}
                {b.slides > 1 ? <span className="bl-thumb-n">{b.slides}</span> : null}
                <span className="bl-src">{b.piece === "corte" ? "Corte" : b.piece === "brand" ? (b.slides > 1 ? "Carrossel" : "Brand Kit") : "Rascunho"}</span>
              </div>
              <div className="bl-body">
                <div className="bl-t"><b>{b.type}</b> · {b.title}</div>
                <div className="bl-ch">{(b.ch || []).map((c: string) => <span key={c} className="bl-chip"><RedeIcon slug={slugDoCanal(c)} size={13} />{c}</span>)}</div>
                <div className="bl-acts" onClick={(e) => e.stopPropagation()}>
                  <button className="bl-act" onClick={() => setModal({ editId: b.id })}>Agendar</button>
                  <button className="bl-act" onClick={() => agendarHoje(b.id)}>Hoje</button>
                </div>
              </div>
            </div>
          )) : <div className="rail-empty">Nada aguardando. As peças que você criar em Vídeos e Imagens caem aqui.</div>}
        </aside>
      </div>

      <div className="calx-note">💡 Arraste do "A agendar" para o dia para agendar, e entre os dias para reagendar. Ao publicar, a peça passa pela verificação da sua marca antes de ir para as redes.</div>

      {chOpen && <ChannelsModal onClose={() => setChOpen(false)} flash={flash} />}
      {modal && <PostModal unitId={unitId} editId={modal.editId} initDate={modal.d} post={modal.editId ? [...posts, ...backlog].find((p) => p.id === modal.editId) : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} flash={flash} />}
      {toast ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{toast}</div>, document.body) : null}
    </div>
  );
}

// ============================== modal Nova publicação / editar ==============================
function PostModal({ unitId, editId, initDate, post, onClose, onSaved, flash }: any) {
  const [who, setWho] = useState(post?.who || "org");
  const [type, setType] = useState(post?.type || "Post");
  const [st, setSt] = useState(post?.st || "rascunho");
  const [title, setTitle] = useState(post?.title && post.title !== "(sem título)" ? post.title : "");
  const [date, setDate] = useState(post?.d || initDate || keyOf(new Date()));
  const [time, setTime] = useState(post?.t || "09:00");
  const [piece, setPiece] = useState(post?.piece || "");
  const [caption, setCaption] = useState(post?.caption || "");
  const [chSet, setChSet] = useState<Set<string>>(new Set(post?.ch || []));
  const [busy, setBusy] = useState(false);
  const [gerLeg, setGerLeg] = useState(false);
  const [gerTit, setGerTit] = useState(false);
  const [slides, setSlides] = useState<any[]>([]);
  const [slideIdx, setSlideIdx] = useState(0);
  const scheduled = !!post?.d;

  // busca todos os slides do carrossel/post ligado, p/ navegar na prévia
  useEffect(() => {
    setSlides([]); setSlideIdx(0);
    if (post?.piece === "brand" && post?.pieceRef)
      mktApi.get<any>("/marketing/images/generations/" + post.pieceRef + "/slides").then((r) => setSlides(r?.slides || [])).catch(() => setSlides([]));
  }, [post?.pieceRef, post?.piece]);
  const nSlides = slides.length;

  const toggleCh = (c: string) => setChSet((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });

  async function smartTime() {
    const net = CH_NET[Array.from(chSet)[0] as string] || "instagram";
    try { const w = await mktApi.get<any>("/marketing/posting-windows?network=" + net); setTime(String(w?.recommended || "19:00").slice(0, 5)); flash("Melhor horário sugerido para " + net); }
    catch { setTime("19:00"); }
  }

  // título curto de verdade (não o prompt) a partir da arte vinculada
  async function gerarTituloAuto() {
    if (!post?.pieceRef) return;
    setGerTit(true);
    try {
      const r = await mktApi.post<any>("/marketing/images/generations/" + post.pieceRef + "/titulo", {});
      if (r?.titulo) { setTitle(r.titulo); flash("Título gerado ✓"); } else flash("Não consegui gerar o título agora.");
    } catch { flash("Não consegui gerar o título agora. Tente de novo."); } finally { setGerTit(false); }
  }

  // legenda automática (a Yaya) a partir da arte vinculada
  async function gerarLegendaAuto() {
    if (!post?.pieceRef) { flash("Vincule uma arte do Brand Kit para gerar a legenda."); return; }
    setGerLeg(true);
    flash("Gerando a legenda com a IA…");
    try {
      const r = await mktApi.post<any>("/marketing/images/generations/" + post.pieceRef + "/legenda", {});
      if (r?.legenda) { setCaption(r.legenda); flash("Legenda gerada ✓"); }
      else flash("Não consegui gerar a legenda agora. Tente de novo.");
    } catch (e: any) {
      const motivo = e?.body?.message || e?.body?.reason;
      flash(motivo ? String(motivo) : "Não consegui gerar a legenda agora. Tente de novo em instantes.");
    } finally { setGerLeg(false); }
  }

  async function save() {
    setBusy(true);
    const body: any = {
      unit_id: unitId || null,
      track: who, type, status: st, title: title.trim() || "(sem título)", caption: caption.trim() || null,
      channels: Array.from(chSet), piece_kind: piece || null,
      scheduled_at: st === "rascunho" && !date ? null : (date ? localToISO(date, time) : null),
    };
    try {
      if (editId) await mktApi.patch("/marketing/posts/" + editId, body);
      else await mktApi.post("/marketing/posts", body);
      flash(editId ? "Publicação salva" : "Publicação criada"); onSaved();
    } catch { flash("Não foi possível salvar agora."); } finally { setBusy(false); }
  }
  async function del() {
    if (!editId) return; setBusy(true);
    try { await mktApi.del("/marketing/posts/" + editId); flash("Excluída"); onSaved(); } catch (e: any) { flash(((e?.status === 422 || e?.body?.blocked) && e?.body?.reason) ? String(e.body.reason) : "Não foi possível excluir."); } finally { setBusy(false); }
  }
  async function publish() {
    if (!editId) return; setBusy(true);
    try { await mktApi.post("/marketing/posts/" + editId + "/publish"); flash("Enviada para publicação nas redes ✓"); onSaved(); }
    catch (e: any) {
      if (e?.status === 422 || e?.body?.blocked) flash(e?.body?.reason || "Ajuste a peça e tente de novo.");
      else flash("Não foi possível publicar agora. Tente novamente.");
    } finally { setBusy(false); }
  }

  const footer = (
    <>
      {editId ? <button className="calm-del" onClick={del} disabled={busy}>Excluir</button> : null}
      {editId && scheduled ? <button className="bk-mini" onClick={publish} disabled={busy}>Publicar</button> : null}
      <button className="bk-mini" onClick={onClose}>Cancelar</button>
      <button className="bk-mini pri" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar publicação"}</button>
    </>
  );

  return (
    <MktModal title={editId ? "Editar publicação" : "Nova publicação"} onClose={onClose} footer={footer} wide>
      <div className="pm">
        {/* ————— ESQUERDA: a arte ————— */}
        <div className="pm-art">
          {nSlides ? (
            <div className="pm-canvas">
              <img src={slides[Math.min(slideIdx, nSlides - 1)]?.url} alt="" />
              {nSlides > 1 ? (
                <>
                  <button type="button" className="calm-nav prev" onClick={() => setSlideIdx((i) => (i - 1 + nSlides) % nSlides)} aria-label="Slide anterior">‹</button>
                  <button type="button" className="calm-nav next" onClick={() => setSlideIdx((i) => (i + 1) % nSlides)} aria-label="Próximo slide">›</button>
                  <span className="calm-slides">{Math.min(slideIdx, nSlides - 1) + 1}/{nSlides}</span>
                </>
              ) : null}
            </div>
          ) : post?.thumb ? (
            <div className="pm-canvas"><img src={post.thumb} alt="" /></div>
          ) : (
            <div className="pm-empty"><span>🖼️</span><b>Sem arte vinculada</b><small>Vincule uma arte de Imagens ou um Corte para ver a prévia aqui.</small></div>
          )}
          {nSlides > 1 ? <div className="calm-dots">{slides.map((_, i) => <span key={i} className={i === slideIdx ? "on" : ""} onClick={() => setSlideIdx(i)} />)}</div> : null}
          <div className="pm-piece">
            {post?.piece === "brand" ? <span className="pm-piece-tag brand">🖼️ {nSlides > 1 ? `Carrossel · ${nSlides} slides` : "Arte do Brand Kit"}</span>
              : post?.piece === "corte" ? <span className="pm-piece-tag corte">🎬 Corte de Vídeos Virais</span>
                : (
                  <select className="pm-select" value={piece} onChange={(e) => setPiece(e.target.value)} title="Peça vinculada">
                    <option value="">Sem peça — a equipe cria</option>
                    <option value="corte">🎬 Corte (Vídeos Virais)</option>
                    <option value="brand">🖼️ Arte do Brand Kit (Imagens)</option>
                    <option value="upload">⬆️ Enviar arquivo</option>
                  </select>
                )}
          </div>
        </div>

        {/* ————— DIREITA: o formulário ————— */}
        <div className="pm-form">
          <div className="pm-field">
            <div className="pm-lbl">Título {post?.piece === "brand" && post?.pieceRef ? <button type="button" className="pm-ai" onClick={gerarTituloAuto} disabled={gerTit}>{gerTit ? "gerando…" : "✨ gerar"}</button> : null}</div>
            <input className="pm-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: 5 erros de IA que a sua PME comete" />
          </div>

          <div className="pm-field">
            <div className="pm-lbl">Legenda {post?.piece === "brand" && post?.pieceRef ? <button type="button" className="pm-ai" onClick={gerarLegendaAuto} disabled={gerLeg}>{gerLeg ? "gerando…" : "✨ gerar com IA"}</button> : null}</div>
            <textarea className="pm-textarea" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="a legenda do post, no tom do seu Brand Kit — com hashtags…" />
          </div>

          <div className="pm-field">
            <div className="pm-lbl">Canais</div>
            <div className="calf-chips">{CANAIS.map((c) => <button key={c.label} type="button" className={"calf-chip" + (chSet.has(c.label) ? " on" : "")} onClick={() => toggleCh(c.label)}><RedeIcon slug={c.slug} size={15} />{c.nome}</button>)}</div>
          </div>

          <div className="pm-field">
            <div className="pm-lbl">Quando</div>
            <div className="pm-when">
              <input className="pm-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className="pm-input pm-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <button type="button" className="pm-smart" onClick={smartTime}>✨ Horário inteligente</button>
            </div>
          </div>

          <div className="pm-meta">
            <div className="pm-field"><div className="pm-lbl">Trilha</div><div className="seg seg-sm">{(["org", "paid", "mail"] as const).map((w) => <button key={w} type="button" className={who === w ? "on" : ""} onClick={() => setWho(w)}>{WHO_LABEL[w]}</button>)}</div></div>
            <div className="pm-field"><div className="pm-lbl">Tipo</div><select className="pm-select" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="pm-field"><div className="pm-lbl">Status</div><select className="pm-select" value={st} onChange={(e) => setSt(e.target.value)}>{ST_EDITAVEIS.map((k) => <option key={k} value={k}>{ST_LABEL[k]}</option>)}</select></div>
          </div>
        </div>
      </div>
    </MktModal>
  );
}
