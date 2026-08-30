import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { mktApi, activeUnit } from "../../../lib/mktApi";
import { MktModal } from "./_ui";

// ============================================================================
// Tela 3 — VÍDEOS VIRAIS (done-for-you). NATIVO no portal, ligado à marketing-api
// (banco `marketing`). 4 sub-telas: Dashboard/pedido (+ wizard de briefing),
// Meus Avatares/Clone, Cortes (revisão) e Gerador de Roteiros.
// Dados 100% reais do back. Nada fictício: vazio = zerado; barras data-driven.
// Modais/wizard via MktModal (createPortal → sempre centralizado). Sem jargão.
// ============================================================================

const nf = new Intl.NumberFormat("pt-BR");
const num = (v: any) => nf.format(Number(v) || 0);
const brl = (v: any) => (v == null ? null : "R$ " + nf.format(Number(v)));
const fmtDate = (s: any) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("pt-BR"); } catch { return ""; } };

const ORDER_STATUS: Record<string, { cls: string; label: string }> = {
  em_producao: { cls: "prod", label: "Em produção" },
  para_revisao: { cls: "rev", label: "Para revisão" },
  aprovado: { cls: "done", label: "Aprovado" },
  ajustes: { cls: "adj", label: "Em ajustes" },
};

function readDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
}

// ---- toast reutilizável (via portal no body) ----
function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg((t) => (t === m ? null : t)), 2400); };
  const node = msg
    ? createPortal(<div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0B1A33", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10001, boxShadow: "0 10px 30px rgba(1,14,38,.35)" }}>{msg}</div>, document.body)
    : null;
  return { flash, node };
}

function Shell({ sub, children, title = "Vídeos Virais" }: { sub: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing · Produzir</div>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{sub}</p>
      {children}
    </div>
  );
}

export default function Videos({ view }: { view: "dashboard" | "avatar" | "cortes" | "roteiros" }) {
  if (view === "avatar") return <Avatares />;
  if (view === "cortes") return <Cortes />;
  if (view === "roteiros") return <Roteiros />;
  return <Dashboard />;
}

// ========================== DASHBOARD / PEDIDO ==========================
function Dashboard() {
  const [plan, setPlan] = useState<{ subscription: any; plans: any[] } | null>(null);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [avatars, setAvatars] = useState<any[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const { flash, node } = useToast();

  async function loadOrders() {
    try { setOrders(await mktApi.get<any[]>("/marketing/videos/clip-requests")); } catch { setOrders([]); }
  }
  useEffect(() => {
    activeUnit().then(setUnitId).catch(() => {});
    mktApi.get<any>("/marketing/videos/plan").then(setPlan).catch(() => setPlan({ subscription: null, plans: [] }));
    mktApi.get<any[]>("/marketing/videos/clips").then(setClips).catch(() => setClips([]));
    mktApi.get<any[]>("/marketing/videos/avatars").then(setAvatars).catch(() => setAvatars([]));
    loadOrders();
  }, []);

  const sub = plan?.subscription || null;
  const quota = Number(sub?.clips_quota) || 0;
  const used = Number(sub?.clips_used) || 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  const avApproved = avatars.filter((a) => a.status === "approved").length;
  const posted = clips.filter((c) => c.posting_urls && Object.keys(c.posting_urls).length > 0).length;
  const steps = [
    { done: avatars.length > 0, ic: "✓", cap: "Onboarding" },
    { done: avApproved > 0, ic: "☺", cap: "Avatares aprovados", num: avApproved },
    { done: clips.length > 0, ic: "🎬", cap: "Vídeos gerados", num: clips.length },
    { done: posted > 0, ic: "➤", cap: "Vídeos postados", num: posted },
  ];

  return (
    <Shell sub="Você briefa, nossa equipe produz. Peça um clipe, acompanhe a produção e revise o resultado — tudo no seu tom e na sua identidade.">
      <div className="vv-top">
        <div>
          <div className="vv-sect-lbl" style={{ marginBottom: 6 }}>Peça um clipe em 4 passos</div>
          <p className="vv-lead">Descreva o tema, junte o material de referência e escolha o avatar. Nossa equipe recebe o briefing e devolve o corte pronto para você aprovar e publicar.</p>
        </div>
        <div className="plan-card">
          <div className="pc-lbl">Meu plano</div>
          {sub ? (
            <>
              <div className="pc-val">{sub.plan_name || "Plano ativo"}</div>
              <div className="pc-quota">{num(quota - used)} <span>clipes disponíveis no ciclo</span></div>
              <div className="pc-bar"><div className="pc-fill" style={{ width: pct + "%" }} /></div>
              <div className="pc-sub">{num(used)} de {num(quota)} usados neste ciclo.</div>
            </>
          ) : (
            <>
              <div className="pc-val">Sem plano ativo</div>
              <div className="pc-quota">0 <span>clipes no ciclo</span></div>
              <div className="pc-bar"><div className="pc-fill" style={{ width: "0%" }} /></div>
              <div className="pc-sub">Contrate um plano para pedir clipes todo mês — ou peça um avulso.</div>
            </>
          )}
          <span className="pc-cta" onClick={() => setPlansOpen(true)}>Ver planos →</span>
        </div>
      </div>

      <hr className="vv-divider" />
      <div className="vv-sect-lbl">Progresso do projeto</div>
      <div className="vv-steps">
        {steps.map((s, i) => (
          <div className={"vv-step" + (s.done ? " done" : "")} key={i}>
            <div className="ring">{s.ic}</div>
            <div className="cap">{s.cap}</div>
            {typeof s.num === "number" ? <div className="num2">{num(s.num)}</div> : null}
          </div>
        ))}
      </div>

      <div className="vv-primary-cta">
        <button className="bk-mini pri" style={{ padding: "11px 22px", fontSize: 14 }} onClick={() => setWizard(true)}>＋ Criar novo clipe</button>
      </div>

      <div className="vv-sect-lbl">Meus pedidos</div>
      <div className="vv-orders">
        {orders == null ? (
          <div className="vv-empty">Carregando…</div>
        ) : orders.length ? (
          orders.map((o) => {
            const st = ORDER_STATUS[o.status] || ORDER_STATUS.em_producao;
            return (
              <div className="vv-order" key={o.id}>
                <div className="o-th">🎬</div>
                <div>
                  <div className="o-t">Pedido {o.code || "#—"}</div>
                  <div className="o-d">{o.theme || "Sem tema definido"}{o.created_at ? " · " + fmtDate(o.created_at) : ""}</div>
                </div>
                <span className={"vv-status " + st.cls}>{st.label}</span>
              </div>
            );
          })
        ) : (
          <div className="vv-empty">Nenhum pedido ainda. Clique em <b>Criar novo clipe</b> para enviar o seu primeiro briefing à equipe.</div>
        )}
      </div>

      {wizard && <BriefingWizard unitId={unitId} avatars={avatars} flash={flash} onClose={() => setWizard(false)} onDone={() => { loadOrders(); }} />}
      {plansOpen && (
        <MktModal title="Planos de clipes" onClose={() => setPlansOpen(false)}>
          {plan?.plans?.length ? plan.plans.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "var(--heading)" }}>{p.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{num(p.clips_per_cycle)} clipes por ciclo</div>
              </div>
              {brl(p.price) ? <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--heading)" }}>{brl(p.price)}</div> : null}
            </div>
          )) : <div style={{ color: "var(--muted)", padding: "8px 2px", lineHeight: 1.6 }}>Ainda não há planos configurados. Fale com o time para montar o plano ideal para o seu volume de clipes.</div>}
        </MktModal>
      )}
      {node}
    </Shell>
  );
}

// ============================== WIZARD ==============================
const WSTEPS = ["Tema & objetivo", "Material & referências", "Avatar & estilo", "Revisar & enviar"];

function BriefingWizard({ unitId, avatars, flash, onClose, onDone }: { unitId: string | null; avatars: any[]; flash: (m: string) => void; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState("");
  const [objective, setObjective] = useState("");
  const [mode, setMode] = useState<"novo" | "editar">("novo");
  const [links, setLinks] = useState<string[]>([]);
  const [linkIn, setLinkIn] = useState("");
  const [base, setBase] = useState<any | null>(null); // {kind:'base_video', url?}
  const [baseLink, setBaseLink] = useState("");
  const [refFiles, setRefFiles] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickKind = useRef<"base_video" | "ref_video" | "image">("image");
  const navigate = useNavigate();

  const approvedAvatars = avatars.filter((a) => a.status === "approved");

  function pick(kind: "base_video" | "ref_video" | "image") {
    pickKind.current = kind;
    if (fileRef.current) { fileRef.current.accept = kind === "image" ? "image/*,application/pdf" : "video/*"; fileRef.current.value = ""; fileRef.current.click(); }
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const slot = pickKind.current;
    const isPdf = f.type === "application/pdf";
    const kind = slot === "image" && isPdf ? "pdf" : slot; // materiais: imagem ou PDF
    const MAX = kind === "image" ? 12 * 1024 * 1024 : kind === "pdf" ? 20 * 1024 * 1024 : 60 * 1024 * 1024;
    if (f.size > MAX) { flash("Arquivo grande demais — cole o link do material em vez de enviar o arquivo."); return; }
    try {
      const dataUrl = await readDataUrl(f);
      const asset = await mktApi.post<any>("/marketing/videos/uploads", { dataUrl, name: f.name, kind });
      if (kind === "base_video") setBase(asset);
      else if (kind === "pdf") setDocs((l) => [...l, asset]);
      else if (kind === "image") setImages((l) => [...l, asset]);
      else setRefFiles((l) => [...l, asset]);
      flash("Material anexado");
    } catch { flash("Não foi possível anexar agora. Você pode colar um link."); }
  }
  function addLink() { const v = linkIn.trim(); if (!v) return; setLinks((l) => [...l, v]); setLinkIn(""); }

  const nMat = links.length + refFiles.length + images.length + docs.length + (base || baseLink.trim() ? 1 : 0);

  async function submit() {
    setSubmitting(true);
    try {
      const assets: any[] = [
        ...links.map((u) => ({ kind: "ref_link", url: u })),
        ...refFiles.map((a) => ({ kind: "ref_video", storage_path: a.storage_path, url: a.url, name: a.name, size_bytes: a.size_bytes })),
        ...images.map((a) => ({ kind: "image", storage_path: a.storage_path, url: a.url, name: a.name, size_bytes: a.size_bytes })),
        ...docs.map((a) => ({ kind: "pdf", storage_path: a.storage_path, url: a.url, name: a.name, size_bytes: a.size_bytes })),
      ];
      if (mode === "editar") {
        if (base) assets.push({ kind: "base_video", storage_path: base.storage_path, url: base.url, name: base.name, size_bytes: base.size_bytes });
        else if (baseLink.trim()) assets.push({ kind: "base_video", url: baseLink.trim() });
      }
      await mktApi.post("/marketing/videos/clip-requests", { unitId, theme: theme.trim(), objective: objective.trim() || null, mode, avatarId: mode === "novo" ? avatarId : null, notes: notes.trim() || null, assets });
      setDone(true);
      onDone();
    } catch { flash("Não foi possível enviar o pedido agora. Tente novamente em instantes."); }
    finally { setSubmitting(false); }
  }

  const canNext = step === 0 ? theme.trim().length > 0 : true;

  const footer = done ? (
    <>
      <button className="bk-mini" onClick={onClose}>Fechar</button>
      <button className="bk-mini pri" onClick={() => { onClose(); navigate("/admin/marketing/cortes"); }}>Acompanhar em Cortes</button>
    </>
  ) : (
    <>
      <button className="bk-mini" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>{step === 0 ? "Cancelar" : "‹ Anterior"}</button>
      {step < 3
        ? <button className="bk-mini pri" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continuar</button>
        : <button className="bk-mini pri" disabled={submitting} onClick={submit}>{submitting ? "Enviando…" : "Enviar pedido para produção"}</button>}
    </>
  );

  return (
    <MktModal title="Novo pedido de clipe" wide onClose={onClose} footer={footer}>
      {done ? (
        <div className="vv-done">
          <div className="d-ic">✓</div>
          <div className="d-t">Pedido recebido!</div>
          <div className="d-s">Nossa equipe já está com o seu briefing. Você será avisado por e-mail e o vídeo aparecerá em <b>Cortes</b> assim que estiver pronto para a sua revisão.</div>
        </div>
      ) : (
        <>
          <div className="vvw-prog"><i style={{ width: ((step + 1) / WSTEPS.length) * 100 + "%" }} /></div>
          <div className="vvw-steps">
            {WSTEPS.map((s, i) => (
              <div className={"vvw-dot" + (i === step ? " on" : i < step ? " reached" : "")} key={i}><b>{i < step ? "✓" : i + 1}</b>{s}</div>
            ))}
          </div>

          {step === 0 && (
            <>
              <div className="vvw-h">Sobre o que é o vídeo?</div>
              <div className="vvw-d">Descreva o tema, a mensagem ou o objetivo do clipe. Quanto mais claro, mais fiel o resultado.</div>
              <div className="vv-field">
                <div className="vv-lbl">Tema *</div>
                <textarea value={theme} maxLength={200} onChange={(e) => setTheme(e.target.value)} placeholder="ex.: por que a sua PME perde venda fora do horário — e como a IA resolve" />
                <div className="vv-hint" style={{ textAlign: "right" }}>{theme.length}/200</div>
              </div>
              <div className="vv-field">
                <div className="vv-lbl">Objetivo (opcional)</div>
                <input type="text" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="ex.: gerar contatos no WhatsApp" />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="vvw-h">Como quer este vídeo?</div>
              <div className="vvw-d">Escolha o caminho e junte o material. Quanto mais referência, mais fiel o resultado — nada é obrigatório.</div>
              <div className="vv-modes">
                <div className={"vv-mode" + (mode === "novo" ? " on" : "")} onClick={() => setMode("novo")}>
                  <div className="m-ic">🎬</div><div className="m-t">Produzir do zero</div>
                  <div className="m-d">A gente cria o vídeo com o avatar/clone e a sua marca.</div>
                </div>
                <div className={"vv-mode" + (mode === "editar" ? " on" : "")} onClick={() => setMode("editar")}>
                  <div className="m-ic">✂️</div><div className="m-t">Editar meu vídeo</div>
                  <div className="m-d">Você já tem a gravação — a gente corta, legenda e finaliza.</div>
                </div>
              </div>

              {mode === "editar" && (
                <div className="vv-field">
                  <div className="vv-lbl">Seu vídeo-base</div>
                  <div className="vv-drop big" onClick={() => pick("base_video")}><span className="dz-ic">⬆️</span><div><div className="dz-t">Enviar o vídeo que você já tem</div><div className="dz-s">MP4/MOV até 60 MB — ou cole o link abaixo</div></div></div>
                  {base ? <div className="vv-chip"><span className="c-ic">🎬</span><span className="c-nm">{base.name}</span><span className="c-x" onClick={() => setBase(null)}>×</span></div> : null}
                  <div className="vv-linkrow"><input type="text" value={baseLink} onChange={(e) => setBaseLink(e.target.value)} placeholder="ou cole o link do vídeo (Drive, WeTransfer, YouTube)…" /></div>
                </div>
              )}

              <div className="vv-field">
                <div className="vv-lbl">Vídeos de referência (opcional)</div>
                <div className="vv-drop" onClick={() => pick("ref_video")}><span className="dz-ic">🎞️</span><div><div className="dz-t">Um vídeo que te inspirou</div><div className="dz-s">o estilo/edição que você quer imitar</div></div></div>
                <div className="vv-linkrow"><input type="text" value={linkIn} onChange={(e) => setLinkIn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLink(); }} placeholder="ou cole um link (Reel, TikTok, YouTube)…" /><button className="bk-mini" onClick={addLink}>Adicionar</button></div>
                <div className="vv-links">
                  {links.map((l, i) => <div className="vv-link" key={"l" + i}><span>🔗</span><span className="c-nm">{l}</span><span className="l-x" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))}>×</span></div>)}
                  {refFiles.map((a, i) => <div className="vv-link" key={"f" + i}><span>🎞️</span><span className="c-nm">{a.name}</span><span className="l-x" onClick={() => setRefFiles((x) => x.filter((_, j) => j !== i))}>×</span></div>)}
                </div>
              </div>

              <div className="vv-field">
                <div className="vv-lbl">Imagens &amp; materiais (opcional)</div>
                <div className="vv-drop" onClick={() => pick("image")}><span className="dz-ic">🖼️</span><div><div className="dz-t">Fotos, logo do produto, prints, PDF</div><div className="dz-s">o que ajudar a contar a história</div></div></div>
                <div className="vv-thumbs">
                  {images.map((a, i) => <div className="vv-thumb" key={a.storage_path || i} style={{ backgroundImage: a.url ? `url(${a.url})` : undefined }}><span className="t-x" onClick={() => setImages((x) => x.filter((_, j) => j !== i))}>×</span></div>)}
                </div>
                {docs.length ? <div className="vv-links">{docs.map((a, i) => <div className="vv-link" key={i}><span>📄</span><span className="c-nm">{a.name}</span><span className="l-x" onClick={() => setDocs((x) => x.filter((_, j) => j !== i))}>×</span></div>)}</div> : null}
              </div>

              <div className="vv-field">
                <div className="vv-lbl">Observações para o editor (opcional)</div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex.: cortes rápidos, legenda grande, sem trilha, chamar pra fechar no WhatsApp…" />
              </div>
              <div className="vv-hint">💡 O material vai junto com o pedido para a nossa equipe. Nada aqui é publicado — é só para produzir o seu clipe.</div>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={onFile} />
            </>
          )}

          {step === 2 && (
            <>
              <div className="vvw-h">{mode === "editar" ? "Estilo do vídeo" : "Selecionar avatar"}</div>
              <div className="vvw-d">{mode === "editar" ? "Vamos editar a sua própria gravação — sem avatar. Clique em Continuar." : "Escolha um dos seus avatares aprovados para gravar o vídeo."}</div>
              {mode === "novo" ? (
                approvedAvatars.length ? (
                  <div className="vvw-avatars">
                    {approvedAvatars.map((a) => (
                      <div className={"vvw-av" + (a.id === avatarId ? " sel" : "")} key={a.id} onClick={() => setAvatarId(a.id)}>
                        <div className="pic" />
                        <div className="an">{a.name || "Avatar"}</div>
                        <div className="ad">{a.created_at ? fmtDate(a.created_at) : "aprovado"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="vv-hint" style={{ fontSize: 13 }}>Você ainda não tem um avatar aprovado. Pode enviar o pedido assim mesmo — a equipe entra em contato para configurar o seu avatar/clone. (Ou crie um em <b>Meus Avatares/Clone</b>.)</div>
                )
              ) : (
                <div className="vv-mode on" style={{ cursor: "default" }}><div className="m-ic">✂️</div><div className="m-t">Usar o vídeo que você enviou</div><div className="m-d">Sem avatar — a gente edita a sua própria gravação. Clique em Continuar.</div></div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="vvw-h">Revise o seu pedido</div>
              <div className="vvw-d">Confira o briefing. Ao enviar, nossa equipe recebe tudo e começa a produção.</div>
              <div className="vv-rev">
                <div className="rv"><span className="rv-k">Tema</span><span className="rv-v">{theme.trim() || "—"}</span></div>
                <div className="rv"><span className="rv-k">Objetivo</span><span className="rv-v">{objective.trim() || "—"}</span></div>
                <div className="rv"><span className="rv-k">Caminho</span><span className="rv-v">{mode === "editar" ? "Editar meu vídeo" : "Produzir do zero"}</span></div>
                <div className="rv"><span className="rv-k">Avatar</span><span className="rv-v">{mode === "editar" ? "Usar meu vídeo" : (approvedAvatars.find((a) => a.id === avatarId)?.name || "A definir com a equipe")}</span></div>
                <div className="rv"><span className="rv-k">Material</span><span className="rv-v">{nMat ? nMat + (nMat === 1 ? " item" : " itens") : "Nenhum anexado"}</span></div>
                <div className="rv"><span className="rv-k">Observações</span><span className="rv-v">{notes.trim() || "—"}</span></div>
              </div>
            </>
          )}
        </>
      )}
    </MktModal>
  );
}

// ============================== AVATARES ==============================
function Avatares() {
  const [avatars, setAvatars] = useState<any[] | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const { flash, node } = useToast();
  const navigate = useNavigate();

  async function load() { try { setAvatars(await mktApi.get<any[]>("/marketing/videos/avatars")); } catch { setAvatars([]); } }
  useEffect(() => { activeUnit().then(setUnitId).catch(() => {}); load(); }, []);

  async function create(name: string, kind: string) {
    try { await mktApi.post("/marketing/videos/avatars", { name, kind, unitId }); flash("Avatar criado — em treino"); setAddOpen(false); load(); }
    catch { flash("Não foi possível criar o avatar agora. Tente novamente em instantes."); }
  }

  return (
    <Shell title="Meus Avatares/Clone" sub="Os avatares e clones que a IA usa para gravar os seus vídeos — no seu tom e na sua identidade.">
      <div className="av-gal">
        {(avatars || []).map((a) => {
          const ok = a.status === "approved";
          return (
            <div className="av-g" key={a.id}>
              <div className="av-pic"><span className={"av-badge " + (ok ? "ok" : "proc")}>{ok ? "✓ aprovado" : "⏳ em treino"}</span></div>
              <div className="av-info">
                <div className="av-nm">{a.name || (a.kind === "voice_clone" ? "Clone de voz" : "Avatar")}</div>
                <div className="av-meta">{a.created_at ? "Criado em " + fmtDate(a.created_at) : (a.kind === "voice_clone" ? "Clone de voz" : "Avatar")}{a.score ? " · " + a.score + "/10" : ""}</div>
                <div className="av-acts">
                  {ok ? <button className="bk-mini pri" onClick={() => navigate("/admin/marketing/videos")}>Usar em vídeo</button>
                      : <button className="bk-mini" disabled>disponível quando aprovado</button>}
                </div>
              </div>
            </div>
          );
        })}
        <div className="av-g add" onClick={() => setAddOpen(true)}>
          <div className="av-plus">＋</div>
          <div className="av-addt">Novo avatar / clone</div>
          <div className="av-addh">A equipe grava/treina uma vez e reaproveita em todos os vídeos.</div>
        </div>
      </div>
      {avatars && avatars.length === 0 ? (
        <div className="av-note">💡 O avatar/clone é gravado uma vez e reaproveitado em todos os vídeos — no seu tom e na sua identidade (Brand Kit). Crie o primeiro para começar.</div>
      ) : null}

      {addOpen && <NewAvatarModal onClose={() => setAddOpen(false)} onCreate={create} />}
      {node}
    </Shell>
  );
}

function NewAvatarModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, kind: string) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("avatar");
  return (
    <MktModal title="Novo avatar / clone" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" disabled={!name.trim()} onClick={() => onCreate(name.trim(), kind)}>Criar</button></>}>
      <div className="bkf"><label>Nome</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Avatar principal · Carlos" /></div>
      <div className="bkf"><label>Tipo</label>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="avatar">Avatar (vídeo)</option>
          <option value="voice_clone">Clone de voz</option>
        </select>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-2)", lineHeight: 1.5 }}>Ao criar, o item entra em treino. A equipe configura e ele fica disponível para usar nos seus vídeos.</div>
    </MktModal>
  );
}

// ============================== CORTES ==============================
function Cortes() {
  const [clips, setClips] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const { flash, node } = useToast();

  async function load() { try { setClips(await mktApi.get<any[]>("/marketing/videos/clips")); } catch { setClips([]); } }
  useEffect(() => { load(); }, []);

  async function review(id: string, action: "approve" | "changes") {
    try { await mktApi.post("/marketing/videos/clips/" + id + "/" + action, {}); flash(action === "approve" ? "Corte aprovado — foi para o Calendário" : "Pedido de ajustes enviado"); load(); }
    catch { flash("Não foi possível concluir agora. Tente novamente em instantes."); }
  }
  async function saveUrls(id: string, urls: any) {
    try { await mktApi.patch("/marketing/videos/clips/" + id, { posting_urls: urls }); flash("Links de postagem salvos"); setEdit(null); load(); }
    catch { flash("Não foi possível salvar os links agora. Tente novamente em instantes."); }
  }

  const reviewCount = (clips || []).filter((c) => c.status === "review").length;

  return (
    <Shell title="Cortes" sub="Seu clipe gerado, pronto para publicar — com métricas por rede.">
      {reviewCount > 0 && (
        <div className="vc-review">
          <span style={{ fontSize: 18 }}>🆕</span>
          <span className="cr-t"><b>{reviewCount === 1 ? "Novo corte para revisão" : reviewCount + " cortes para revisão"}</b> — nossa equipe entregou. Aprove para publicar ou peça ajustes.</span>
        </div>
      )}

      {clips == null ? (
        <div className="vc-empty">Carregando…</div>
      ) : clips.length ? (
        clips.map((c) => <ClipCard key={c.id} clip={c} onReview={review} onEditUrls={() => setEdit(c)} />)
      ) : (
        <div className="vc-empty"><span className="ei">🎬</span>Seu clipe aparece aqui assim que a nossa equipe entregar. Ainda não há cortes — envie um pedido em <b>Vídeos Virais</b>.</div>
      )}

      {edit && <EditUrlsModal clip={edit} onClose={() => setEdit(null)} onSave={(u) => saveUrls(edit.id, u)} />}
      {node}
    </Shell>
  );
}

const NETS = [
  { key: "instagram", label: "🟦 Instagram" },
  { key: "tiktok", label: "🎵 TikTok" },
  { key: "youtube", label: "▶ YouTube" },
];
function metricOf(m: any, net: string, field: string) { const v = m?.[net]?.[field]; return v == null ? null : Number(v); }

function ClipCard({ clip, onReview, onEditUrls }: { clip: any; onReview: (id: string, a: "approve" | "changes") => void; onEditUrls: () => void }) {
  const m = clip.metrics || {};
  const totals = ["views", "likes", "comments"].map((f) => NETS.reduce((s, n) => s + (metricOf(m, n.key, f) || 0), 0));
  const hasAny = NETS.some((n) => n.key in m);
  const code = clip.code || "#" + String(clip.id).slice(0, 6);
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="vc-grid">
        <div>
          <div className="vc-player">
            {clip.url ? <video controls src={clip.url} /> : <div className="vc-ph">A prévia do corte aparece aqui quando a equipe publica o arquivo.</div>}
            {clip.score ? <span className="vc-score">SCORE {clip.score}</span> : null}
          </div>
          <div className="vc-meta">
            <div className="id">CORTE {code}</div>
            <div className="mini"><span>👁 {num(totals[0])}</span><span>♡ {num(totals[1])}</span><span>💬 {num(totals[2])}</span></div>
          </div>
          {clip.status === "review" && (
            <div className="vc-actions">
              <button className="bk-mini" onClick={() => onReview(clip.id, "changes")}>Pedir ajustes</button>
              <button className="bk-mini pri" onClick={() => onReview(clip.id, "approve")}>Aprovar</button>
            </div>
          )}
          {clip.status === "approved" && <div className="vc-actions"><span className="vv-status done" style={{ marginLeft: 0 }}>Aprovado</span></div>}
          {clip.status === "changes" && <div className="vc-actions"><span className="vv-status adj" style={{ marginLeft: 0 }}>Ajustes solicitados</span></div>}
        </div>
        <div className="vc-metrics">
          <span className="refresh" onClick={onEditUrls}>Editar links ↗</span>
          <h3>Métricas de engajamento</h3>
          <div className="net-row">
            {NETS.map((n) => {
              const views = metricOf(m, n.key, "views");
              return <div className="net" key={n.key}><span className="n">{n.label}</span><span className="s">{views == null ? "Não encontrado" : "👁 " + num(views)}</span></div>;
            })}
          </div>
          <div className="vc-total"><b>Total</b><span>👁 {num(totals[0])}</span><span>♡ {num(totals[1])}</span><span>💬 {num(totals[2])}</span></div>
          {clip.url ? <div className="vc-actions"><a className="bk-mini" href={clip.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Baixar ⤓</a><button className="bk-mini" onClick={onEditUrls}>Editar URLs de postagem</button></div>
            : <div className="vc-actions"><button className="bk-mini" onClick={onEditUrls}>Editar URLs de postagem</button></div>}
          {!hasAny ? <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 10, lineHeight: 1.5 }}>As métricas aparecem depois que o corte é publicado e os links de postagem são informados.</div> : null}
        </div>
      </div>
    </div>
  );
}

function EditUrlsModal({ clip, onClose, onSave }: { clip: any; onClose: () => void; onSave: (urls: any) => void }) {
  const cur = clip.posting_urls || {};
  const [ig, setIg] = useState(cur.instagram || "");
  const [tt, setTt] = useState(cur.tiktok || "");
  const [yt, setYt] = useState(cur.youtube || "");
  return (
    <MktModal title="Links de postagem" onClose={onClose}
      footer={<><button className="bk-mini" onClick={onClose}>Cancelar</button><button className="bk-mini pri" onClick={() => onSave({ ...(ig.trim() ? { instagram: ig.trim() } : {}), ...(tt.trim() ? { tiktok: tt.trim() } : {}), ...(yt.trim() ? { youtube: yt.trim() } : {}) })}>Salvar</button></>}>
      <div className="bkf"><label>Instagram</label><input type="text" value={ig} onChange={(e) => setIg(e.target.value)} placeholder="https://instagram.com/reel/…" /></div>
      <div className="bkf"><label>TikTok</label><input type="text" value={tt} onChange={(e) => setTt(e.target.value)} placeholder="https://tiktok.com/@…/video/…" /></div>
      <div className="bkf"><label>YouTube</label><input type="text" value={yt} onChange={(e) => setYt(e.target.value)} placeholder="https://youtube.com/shorts/…" /></div>
      <div style={{ fontSize: 12, color: "var(--muted-2)", lineHeight: 1.5 }}>Informe onde o corte foi publicado — as métricas de cada rede são lidas a partir desses links.</div>
    </MktModal>
  );
}

// ============================== ROTEIROS ==============================
function Roteiros() {
  const [theme, setTheme] = useState("");
  const [out, setOut] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unitId, setUnitId] = useState<string | null>(null);
  const { flash, node } = useToast();
  const navigate = useNavigate();

  useEffect(() => { activeUnit().then(setUnitId).catch(() => {}); }, []);

  async function gen() {
    setLoading(true);
    try {
      const r = await mktApi.post<{ scripts: any[] }>("/marketing/videos/scripts/generate", { theme: theme.trim(), unitId });
      setOut(r.scripts || []);
    } catch { flash("Não foi possível gerar os roteiros agora. Tente novamente em instantes."); }
    finally { setLoading(false); }
  }
  function copy(r: any) { const txt = [r.hook, r.proof, r.punch].filter(Boolean).join("\n\n"); try { navigator.clipboard.writeText(txt); } catch {} flash("Roteiro copiado"); }

  return (
    <Shell title="Gerador de Roteiros" sub="Descreva o tema — a IA gera 3 roteiros no molde gancho → prova → punch, no tom do seu Brand Kit.">
      <div className="rot-bar">
        <input type="text" className="rot-in" value={theme} onChange={(e) => setTheme(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !loading) gen(); }} placeholder="ex.: por que a sua PME perde venda fora do horário" />
        <button className="bk-mini pri" disabled={loading} onClick={gen}>{loading ? "Gerando…" : "✨ Gerar 3 roteiros"}</button>
      </div>

      {loading ? (
        <div className="rot-load"><div className="spin" />Gerando roteiros…</div>
      ) : out == null ? (
        <div className="rot-empty">Digite um tema acima e gere 3 roteiros prontos — cada um com gancho, prova e punch para você usar em um clipe.</div>
      ) : out.length ? (
        <div className="rot-out">
          {out.map((r, i) => (
            <div className="rot-card" key={r.id || i}>
              <div className="rot-h"><b>Roteiro {i + 1}</b>{r.score != null ? <span className="rot-score">{r.score}/10</span> : null}</div>
              <div className="rot-seg"><div className="rot-lbl">Gancho</div><div className="rot-tx">{r.hook}</div></div>
              <div className="rot-seg"><div className="rot-lbl">Prova</div><div className="rot-tx">{r.proof}</div></div>
              <div className="rot-seg"><div className="rot-lbl">Punch</div><div className="rot-tx">{r.punch}</div></div>
              <div className="rot-acts">
                <button className="bk-mini" onClick={() => copy(r)}>Copiar</button>
                <button className="bk-mini" onClick={gen}>Gerar de novo</button>
                <button className="bk-mini pri" onClick={() => navigate("/admin/marketing/videos")}>Usar em vídeo</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rot-empty">Nenhum roteiro gerado. Tente um tema mais específico.</div>
      )}
      {node}
    </Shell>
  );
}
