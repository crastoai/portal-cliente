import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, MessageSquare, Plus, RotateCcw, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";
import { useUnitScope } from "../../lib/unitScope";

// API do wacrm (fonte de verdade dos agentes). Domínio PRÓPRIO, não o host cru do EasyPanel.
// DEV: VITE_WACRM_API_LOCAL aponta pra uma wacrm api rodando local (validar /api/me sem prod).
const WACRM_API = (import.meta.env.DEV && (import.meta.env.VITE_WACRM_API_LOCAL as string | undefined)) || "https://api.wacrm.crasto.ai";
type Agent = { id: string; name: string; slug?: string; status?: string; business_unit_id?: string | null };

// Seção da URL (/app/crm/<seção>, definida na sidebar do Portal) → caminho dentro do wacrm.
// Sem seção (/app/crm) = Dashboard ("/"). Deep-link de conversa (Cockpit) abre /chat/<id>.
const SECTION_TO_PATH: Record<string, string> = {
  dashboard: "/", tarefas: "/mesa", funil: "/crm", conversas: "/chat", contatos: "/contatos", agenda: "/agenda", config: "/config",
};
// NAVEGAÇÃO do iframe embarcado via postMessage (crasto-crm-nav) — o wacrm escuta e navega POR
// DENTRO (client-side), sem recarregar/re-bootar. É o que garante que Conversas/Minhas Tarefas/CRM/
// Config ABRAM a tela certa e não caiam no Dashboard: mesmo que o boot do wacrm redirecione pra "/",
// isto reafirma a rota LOGO DEPOIS que ele carrega. Repetimos algumas vezes porque o listener do
// wacrm só é registrado após o primeiro render (evita a corrida "postei antes de ele escutar").
const CRM_NAV_DELAYS = [0, 200, 500, 1100];
function navFrame(win: Window | null | undefined, path: string) {
  if (!win || !path) return;
  for (const d of CRM_NAV_DELAYS) setTimeout(() => { try { win.postMessage({ type: "crasto-crm-nav", path }, "*"); } catch { /* ignore */ } }, d);
}

// Seções que abrem em COCKPIT MULTI-PAINEL (1 painel = único/consolidado; N = comparar agentes).
const MULTI_SECTIONS = new Set(["dashboard", "conversas", "funil"]);
const SECTION_LABEL: Record<string, string> = { dashboard: "Dashboard", conversas: "Conversas", funil: "CRM" };
const MAX_PANELS = 4;
const PANELS_KEY = "crasto.wa-panels-v2"; // config do multi-painel POR SEÇÃO (dashboard/conversas/funil)
type Panel = { id: string; agent: string | null }; // agent null = "Todos os Agentes" (empresa inteira)
type Store = Record<string, Panel[]>;

const isLive = (s?: string) => s === "live" || s === "active";
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p-${Math.random().toString(36).slice(2)}`);
const dotStyle = (a?: Agent): CSSProperties => ({ width: 9, height: 9, borderRadius: 999, flex: "0 0 auto", background: isLive(a?.status) ? "#1F8A5B" : "#98A2B3", border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))" });

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(PANELS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && p.version === 2 && p.store && typeof p.store === "object") {
      const out: Store = {};
      for (const k of Object.keys(p.store)) {
        const arr = p.store[k];
        if (Array.isArray(arr) && arr.length) out[k] = arr.slice(0, MAX_PANELS).map((x: any) => ({ id: String(x?.id || newId()), agent: x?.agent ?? null }));
      }
      return out;
    }
  } catch { /* storage indisponível/corrompido → default */ }
  return {};
}

// Seletor de agente por painel (= "instância"). Reaproveita o popover `.crm-switch` do CRM do admin.
function AgentPicker({ agents, value, onChange, t }: { agents: Agent[]; value: string | null; onChange: (v: string | null) => void; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sel = value ? agents.find((a) => a.id === value) : null;

  // Abre posicionando o painel a partir do RECT do botão (posição fixa) — o portal no body + z-index
  // alto tira o dropdown de cima do iframe do CRM (que engolia o clique) e de qualquer overflow.
  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: Math.max(240, r.width) });
    setOpen(true);
  };
  // Fecha por CLIQUE-FORA (pointerdown em captura → roda ANTES do onClick, sem corrida) e ao rolar.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const tgt = e.target as Node;
      if (panelRef.current?.contains(tgt) || btnRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const fechar = () => setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => { document.removeEventListener("pointerdown", onDown, true); window.removeEventListener("scroll", fechar, true); window.removeEventListener("resize", fechar); };
  }, [open]);

  const pick = (v: string | null) => { onChange(v); setOpen(false); };

  return (
    <div className="crm-switch">
      <button ref={btnRef} className="crm-switch-btn" onClick={() => (open ? setOpen(false) : abrir())} title={t("Trocar o agente deste painel")}>
        {sel ? <span style={dotStyle(sel)} /> : <MessageSquare size={14} />}
        <b>{sel ? sel.name : t("Todos os Agentes")}</b>
        <ChevronDown size={14} style={{ opacity: 0.6, flex: "0 0 auto" }} />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} className="crm-switch-panel crm-switch-panel--portal" style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 99999 }}>
          <button className="crm-switch-item" onClick={() => pick(null)}>
            <MessageSquare size={15} /> <b>{t("Todos os Agentes")}</b>
          </button>
          <div className="crm-switch-sep">{t("Agentes")}</div>
          {agents.map((a) => (
            <button key={a.id} className="crm-switch-item" onClick={() => pick(a.id)}>
              <span style={dotStyle(a)} /> <b>{a.name}</b>{a.slug ? <span className="crm-switch-sub">{a.slug}</span> : null}
            </button>
          ))}
          {agents.length === 0 && <div className="crm-switch-empty">{t("Nenhum agente configurado.")}</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}

// FASE 4 — WhatsApp CRM embarcado no Portal, navegação na sidebar do PORTAL (seções = sub-itens),
// iframe com ?hostnav=1 (esconde a nav própria do wacrm). Por seção:
//  • Conversas, CRM, Dashboard → COCKPIT MULTI-PAINEL (1 painel = único/consolidado; N = comparar
//    agentes lado a lado). Cada painel é um iframe da seção escopado por ?agent=<id> (isolação por
//    iframe — ver active-agent.ts). Config de painéis é POR SEÇÃO (localStorage).
//  • Configurações, Agendamentos, Contatos → visão única + seletor de agente (escopo).
//  • Minhas Tarefas → visão única UNIFICADA (todos os agentes; a atribuição por agente é backlog wacrm).
export default function CrmEmbed() {
  const t = useT();
  const [params] = useSearchParams();
  const { section } = useParams();
  const navigate = useNavigate();
  const convParam = params.get("conversation");
  const sec = section || "dashboard"; // raiz /app/crm = Dashboard
  const isMulti = MULTI_SECTIONS.has(sec) && !convParam;
  const isUnified = sec === "tarefas"; // unificado: sem seletor, agrega todos os agentes

  const [crmUrl, setCrmUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshTok, setRefreshTok] = useState<string | undefined>(undefined); // p/ o wacrm se auto-renovar
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [solo, setSolo] = useState<string>("*"); // escopo da VISÃO ÚNICA (config/agenda/contatos)
  const [store, setStore] = useState<Store>(loadStore); // COCKPIT MULTI-PAINEL, por seção
  const [err, setErr] = useState<string>("");
  const [live, setLive] = useState<import("../../services/delivery.service").CrmLive | null>(null);
  const [visited, setVisited] = useState<string[]>([]); // seções multi já abertas → ficam MONTADAS (quentes)
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Escopo de UNIDADE (CNPJ) — multi-CNPJ. A topbar escolhe a unidade; aqui os seletores e a
  // auto-distribuição de painéis passam a oferecer só os agentes daquela unidade (null = todas).
  const { unitId } = useUnitScope();
  const visAgents = useMemo<Agent[]>(
    () => (agents ? (unitId ? agents.filter((a) => a.business_unit_id === unitId) : agents) : []),
    [agents, unitId],
  );
  // Trocar de unidade reseta a visão (evita painel/solo apontando pra agente de outra unidade).
  const unitFirst = useRef(true);
  useEffect(() => {
    if (unitFirst.current) { unitFirst.current = false; return; }
    setSolo("*"); setStore({}); setVisited([]);
  }, [unitId]);

  // Mini-cockpit AO VIVO (pulso do WhatsApp CRM) — atualiza a cada 30s. CRM fora → null → "—".
  useEffect(() => {
    let alive = true;
    const load = () => services.delivery.crmLive.getMine().then((l) => { if (alive) setLive(l); }).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // KPIs do funil (dado real do wacrm) — enriquecem a régua do topo, o Dashboard e o Cockpit.
  const [kpis, setKpis] = useState<any>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = () => fetch(`${WACRM_API}/api/me/kpis`, { headers: { Authorization: "Bearer " + token } })
      .then((r) => r.json()).then((j) => { if (alive) setKpis(j); }).catch(() => { /* CRM fora → "—" */ });
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const cms = (await services.delivery.clientModules.listMine()) as any[];
        const crm = (cms || []).find((c) => c.crm_url);
        if (!crm?.crm_url) { setErr(t("O WhatsApp CRM não está liberado para o seu acesso.")); return; }
        const { data } = await supabase.auth.getSession();
        const tk = data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        // DEV local: embarca o front do wacrm rodando localmente (localhost:5173) para validar SEM
        // tocar em produção. Vive só em .env.development.local (VITE_CRM_LOCAL_URL) e só em DEV.
        const crmLocal = import.meta.env.DEV ? (import.meta.env.VITE_CRM_LOCAL_URL as string | undefined) : undefined;
        setCrmUrl((crmLocal || String(crm.crm_url)).replace(/\/$/, "")); setToken(tk); setRefreshTok(data.session?.refresh_token || undefined);
        let ags: Agent[] = [];
        try {
          const r = await fetch(`${WACRM_API}/api/me`, { headers: { Authorization: "Bearer " + tk } });
          const j = await r.json();
          ags = Array.isArray(j?.agents) ? j.agents : [];
        } catch { /* sem lista → entra direto no principal */ }
        setAgents(ags);
        setSolo(ags.length === 1 ? ags[0].id : "*");
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { try { localStorage.setItem(PANELS_KEY, JSON.stringify({ version: 2, store })); } catch { /* ignore */ } }, [store]);
  // Ao carregar agentes, descarta ids de painel que não existem mais (troca de cliente/agente removido).
  useEffect(() => {
    if (!agents) return;
    const ids = new Set(agents.map((a) => a.id));
    setStore((prev) => {
      let ch = false; const out: Store = {};
      for (const k of Object.keys(prev)) out[k] = prev[k].map((p) => (p.agent && !ids.has(p.agent) ? (ch = true, { ...p, agent: null }) : p));
      return ch ? out : prev;
    });
  }, [agents]);
  // Ao abrir uma seção multi, marca como visitada → o iframe dela fica montado (some só visualmente
  // quando você troca de seção). Reabrir é INSTANTANEO (não re-boota o wacrm nem refaz os requests).
  useEffect(() => { if (isMulti) setVisited((v) => (v.includes(sec) ? v : [...v, sec])); }, [isMulti, sec]);

  // ── Painéis da SEÇÃO atual + operações (cada seção multi guarda a sua config) ─────────────────────
  const updateSec = (fn: (p: Panel[]) => Panel[]) => setStore((prev) => ({ ...prev, [sec]: fn(prev[sec] || [{ id: newId(), agent: null }]) }));
  const nextUnused = (cur: Panel[]) => { const used = new Set(cur.map((p) => p.agent).filter(Boolean)); return visAgents.find((a) => !used.has(a.id))?.id ?? null; };
  const applyLayout = (n: number) => updateSec((prev) => { if (n === prev.length) return prev; let np = [...prev]; while (np.length < n) np.push({ id: newId(), agent: nextUnused(np) }); if (np.length > n) np = np.slice(0, n); return np; });
  const addPanel = () => updateSec((prev) => (prev.length >= MAX_PANELS ? prev : [...prev, { id: newId(), agent: nextUnused(prev) }]));
  const removePanel = (id: string) => updateSec((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.id !== id)));
  const setPanelAgent = (id: string, agent: string | null) => updateSec((prev) => prev.map((p) => (p.id === id ? { ...p, agent } : p)));
  const resetPanels = () => updateSec(() => [{ id: newId(), agent: null }]);

  // Atalhos Ctrl/Cmd + 1..4 (só nas seções multi; ignora quando foco em campo de texto).
  useEffect(() => {
    if (!isMulti) return;
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !["1", "2", "3", "4"].includes(e.key)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault(); applyLayout(Number(e.key));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isMulti, sec, agents]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── VISÃO ÚNICA (config/agenda/contatos/tarefas/deep-link) — 1 iframe; seção troca por postMessage ──
  const singleAgent = isUnified || convParam ? "*" : solo; // Tarefas e deep-link = todos; resto = escopo
  const sectionPath = convParam ? `/chat/${encodeURIComponent(convParam)}` : (SECTION_TO_PATH[sec] || "/");
  // A src da visão única reflete a SEÇÃO ATUAL (recarrega ao trocar de seção). Antes ficava
  // "congelada" no caminho inicial → Minhas Tarefas/Agendamentos abriam o Dashboard. Agora carrega certo.
  const src = useMemo(() => {
    if (!crmUrl || !token) return "";
    const q = singleAgent && singleAgent !== "*" ? `&agent=${encodeURIComponent(singleAgent)}` : "";
    const rf = refreshTok ? `&refresh_token=${encodeURIComponent(refreshTok)}` : "";
    return `${crmUrl}${sectionPath}?embedded=1&hostnav=1${q}#access_token=${encodeURIComponent(token)}${rf}`;
  }, [crmUrl, token, refreshTok, singleAgent, sectionPath]);
  // O wacrm embarcado pede um token novo quando fica sem sessão (SSO — nunca login próprio no embed).
  // Respondemos com o token/refresh atuais do Portal → ele entra sozinho.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string } | null;
      if (!d || d.type !== "crasto-crm-auth-needed" || !e.source) return;
      supabase.auth.getSession().then(({ data }) => {
        const tk = data.session?.access_token;
        if (tk) (e.source as Window).postMessage({ type: "crasto-crm-auth-token", token: tk, refresh: data.session?.refresh_token }, "*");
      }).catch(() => { /* sem sessão no Portal: nada a fazer */ });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  // TEMA (dark/light): propaga o tema do Portal para os iframes do wacrm. No embed local as origens
  // são diferentes (localStorage do tema NÃO é compartilhado) → sem isto o CRM ficava branco no dark.
  // Também garante troca INSTANTÂNEA ao alternar o tema no topo do Portal.
  useEffect(() => {
    const theme = () => document.documentElement.getAttribute("data-theme") || "light";
    const broadcast = () => document.querySelectorAll<HTMLIFrameElement>(".crm-fs-frame").forEach((f) => {
      try { f.contentWindow?.postMessage({ type: "crasto-crm-theme", theme: theme() }, "*"); } catch { /* ignore */ }
    });
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string } | null;
      if (d?.type === "crasto-crm-theme-needed" && e.source) { try { (e.source as Window).postMessage({ type: "crasto-crm-theme", theme: theme() }, "*"); } catch { /* ignore */ } }
    };
    window.addEventListener("message", onMsg);
    const obs = new MutationObserver(broadcast);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { window.removeEventListener("message", onMsg); obs.disconnect(); };
  }, []);
  // POPUP NO CENTRO DA TELA: quando um modal abre dentro de um iframe do CRM, ele avisa e nós
  // expandimos ESSE iframe pra tela inteira (por cima da topbar/sidebar do Portal) → o escurecimento
  // cobre o Portal todo e o modal centraliza na tela. Fecha → volta ao lugar. (única e multi-painel)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; open?: boolean } | null;
      if (!d || d.type !== "crasto-crm-modal") return;
      document.querySelectorAll<HTMLIFrameElement>(".crm-fs-frame").forEach((fr) => {
        if (fr.contentWindow === e.source) fr.classList.toggle("crm-frame-fs", !!d.open);
      });
      // Promove o container do CRM acima da sidebar/topbar do Portal (senão elas pintam por cima
      // do iframe fullscreen e o fundo fica "bagunçado"). Removido ao fechar.
      document.documentElement.classList.toggle("crm-modal-open", !!d.open);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  // NAVEGAÇÃO vinda do CRM: ele entrou numa conversa (de outra seção) → levamos o Portal pra
  // Conversas com a conversa aberta (URL + sidebar certos; o "voltar" volta a funcionar).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; section?: string; conversation?: string | null } | null;
      if (!d || d.type !== "crasto-crm-goto") return;
      const qs = d.conversation ? `?conversation=${encodeURIComponent(d.conversation)}` : "";
      navigate(`/app/crm/${d.section || "conversas"}${qs}`);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navigate]);

  if (err) return <div className="admin-crm-fill"><div className="crm-fs-msg">{err}</div></div>;
  if (!crmUrl || agents === null) {
    return <div className="admin-crm-fill"><div className="crm-fs-msg">{t("Abrindo o WhatsApp CRM…")}</div></div>;
  }

  const panels = store[sec] || [{ id: `seed-${sec}`, agent: null }];
  const showChips = !isMulti && !isUnified && !convParam && visAgents.length > 1; // config/agenda/contatos
  const panelSrc = (gsec: string, ag: string | null) => {
    const q = ag ? `&agent=${encodeURIComponent(ag)}` : "";
    const rf = refreshTok ? `&refresh_token=${encodeURIComponent(refreshTok)}` : "";
    return `${crmUrl}${SECTION_TO_PATH[gsec] || "/"}?embedded=1&hostnav=1${q}#access_token=${encodeURIComponent(token || "")}${rf}`;
  };
  const layoutBtn = (n: number): CSSProperties => ({
    width: 30, height: 30, border: 0, borderLeft: n > 1 ? "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))" : "none",
    background: panels.length === n ? "var(--crasto-blue, #6E9CE8)" : "transparent",
    color: panels.length === n ? "#fff" : "var(--crasto-text-body)", fontWeight: 700, fontFamily: "ui-monospace, monospace", fontSize: 13, cursor: "pointer",
  });
  const outlineBtn: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", borderRadius: 8, border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", background: "var(--crasto-surface, #fff)", color: "var(--crasto-text-body)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
  const iconBtn: CSSProperties = { display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", background: "var(--crasto-surface, #fff)", color: "var(--crasto-text-muted)", cursor: "pointer" };

  const stat = (label: string, value: any, tone?: "warn") => (
    <div style={{ padding: "8px 16px", borderRight: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", minWidth: 120 }}>
      <div style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crasto-text-muted)", fontWeight: 600 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: tone === "warn" ? "#B54708" : "var(--crasto-text-primary)", marginTop: 1 }}>{value}</div>
    </div>
  );
  // IA × EQUIPE (hoje) — a "competição" na cara do atendente (substitui "Agentes conectados",
  // irrelevante). IA = automação de hoje; Equipe = o restante das respostas. Barra mostra o duelo.
  const iaP = live?.automacaoHoje ?? null;
  const humP = iaP != null ? Math.max(0, 100 - iaP) : null;
  const compareCell = (
    <div style={{ padding: "8px 16px", borderRight: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", minWidth: 162 }}>
      <div style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crasto-text-muted)", fontWeight: 600 }}>{t("IA × Equipe · hoje")}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 1 }}>
        <span className="tnum" style={{ fontSize: 18, fontWeight: 700, color: "#1B7A4F" }}>{iaP != null ? `${iaP}%` : "—"}</span>
        <span style={{ fontSize: 10.5, color: "var(--crasto-text-muted)" }}>{t("IA")}</span>
        <span style={{ fontSize: 12, color: "var(--crasto-text-faint)", margin: "0 2px" }}>×</span>
        <span className="tnum" style={{ fontSize: 18, fontWeight: 700, color: "#B54708" }}>{humP != null ? `${humP}%` : "—"}</span>
        <span style={{ fontSize: 10.5, color: "var(--crasto-text-muted)" }}>{t("Equipe")}</span>
      </div>
      <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 5, background: "rgba(1,14,38,.06)" }}>
        <i style={{ display: "block", width: `${iaP ?? 0}%`, background: "#1B7A4F" }} /><i style={{ display: "block", width: `${humP ?? 0}%`, background: "#B54708" }} />
      </div>
    </div>
  );
  // SUGESTÃO — coach AO VIVO pro atendente: a única coisa mais impactante a fazer AGORA (regra de
  // negócio sobre o pulso atual). Instantâneo (a régua atualiza a cada 30s).
  const sugestao = (): string => {
    const fila = live?.fila ?? 0;
    if (fila > 0) return t("{n} esperando na fila — responda os mais antigos primeiro; a IA cobre o resto.", { n: fila });
    const fu = kpis?.hasData ? kpis.followups_due ?? 0 : 0;
    if (fu > 0) return t("{n} follow-ups vencidos — faça agora, antes do lead esfriar.", { n: fu });
    const rg = kpis?.hasData ? kpis.resgates ?? 0 : 0;
    if (rg > 0) return t("{n} leads para resgatar hoje — reengaje quem sumiu.", { n: rg });
    if (iaP != null && iaP < 20) return t("A IA está pouco usada hoje ({p}%) — deixe ela pegar o volume e foque no fechamento.", { p: iaP });
    if (kpis?.hasData && kpis.pct_decisor != null && kpis.ligacoes_hoje > 0 && kpis.pct_decisor < 40) return t("Você fala com o decisor em só {p}% das ligações — peça pelo responsável logo no início.", { p: kpis.pct_decisor });
    return t("Fila zerada e follow-ups em dia. Bom ritmo — foque em converter os quentes.");
  };
  const coachCell = (
    <div style={{ marginLeft: "auto", alignSelf: "stretch", display: "flex", alignItems: "center", gap: 9, padding: "8px 16px", minWidth: 250, background: "var(--crasto-blue-05, rgba(14,99,199,.06))", borderLeft: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))" }}>
      <span style={{ fontSize: 15, color: "#0E63C7", flex: "0 0 auto" }}>✦</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "#0E63C7", fontWeight: 700 }}>{t("Sugestão da IA")}</div>
        <div style={{ fontSize: 12.5, color: "var(--crasto-text-body)", marginTop: 1, lineHeight: 1.3 }}>{sugestao()}</div>
      </div>
    </div>
  );
  const kpiBar = (
    <div style={{ display: "flex", alignItems: "stretch", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", overflowX: "auto", flex: "0 0 auto" }}>
      {compareCell}
      {stat(t("Conversas ativas"), live ? live.conversasAtivas : "—")}
      {stat(t("Aguardando na fila"), live ? live.fila : "—", live && live.fila > 0 ? "warn" : undefined)}
      {stat(t("Leads novos · hoje"), kpis?.hasData ? kpis.leads_hoje : "—")}
      {stat(t("Convertidos · hoje"), kpis?.hasData ? kpis.convertidos_hoje : "—")}
      {stat(t("Taxa de conversão"), kpis?.hasData && kpis.taxa_conversao != null ? `${kpis.taxa_conversao}%` : "—")}
      {stat(t("Decisor nas ligações · hoje"), kpis?.hasData && kpis.pct_decisor != null ? `${kpis.pct_decisor}%` : "—")}
      {stat(t("Follow-ups a fazer"), kpis?.hasData ? kpis.followups_due : "—", kpis?.hasData && kpis.followups_due > 0 ? "warn" : undefined)}
      {stat(t("Resgates"), kpis?.hasData ? kpis.resgates : "—", kpis?.hasData && kpis.resgates > 0 ? "warn" : undefined)}
      {coachCell}
    </div>
  );

  // Grid de painéis de UMA seção (usado tanto na ativa quanto nas visitadas que ficam montadas).
  const renderGrid = (gsec: string) => {
    const gp = store[gsec] || [{ id: `seed-${gsec}`, agent: null }];
    return (
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {gp.map((panel, i) => (
          <div key={panel.id} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderLeft: i > 0 ? "1px solid var(--crasto-border-soft, rgba(1,14,38,.10))" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 10px", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", flex: "0 0 auto", position: "relative", zIndex: 5 }}>
              <span title={t("Painel {n}", { n: i + 1 })} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--crasto-blue, #6E9CE8)", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "ui-monospace, monospace", padding: "2px 7px", borderRadius: 6, flex: "0 0 auto" }}>P{i + 1}</span>
              <AgentPicker agents={visAgents} value={panel.agent} onChange={(v) => setPanelAgent(panel.id, v)} t={t} />
              {gp.length > 1 && (
                <button onClick={() => removePanel(panel.id)} title={t("Fechar painel")} style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, border: 0, background: "transparent", color: "var(--crasto-text-muted)", cursor: "pointer", flex: "0 0 auto", borderRadius: 6, marginLeft: "auto" }}><X size={15} /></button>
              )}
            </div>
            <iframe title={panel.agent ? (agents.find((a) => a.id === panel.agent)?.name || t("Painel {n}", { n: i + 1 })) : t("Todos os Agentes")} src={panelSrc(gsec, panel.agent)} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay"
              onLoad={(e) => navFrame((e.currentTarget as HTMLIFrameElement).contentWindow, SECTION_TO_PATH[gsec] || "/")} />
          </div>
        ))}
      </div>
    );
  };
  // Seções multi a montar: as já visitadas + a atual (a atual entra na hora, sem esperar o efeito).
  const shownMulti = isMulti && !visited.includes(sec) ? [...visited, sec] : visited;

  return (
    <div className="admin-crm-fill">
      {isMulti ? (
        // HEADER do cockpit — título da seção à esquerda; layout [1][2][3][4] + Painel + Reset à direita.
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", flex: "0 0 auto" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--crasto-text-primary)", lineHeight: 1.15 }}>{t(SECTION_LABEL[sec] || "WhatsApp CRM")}</div>
            <div style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}>{t("Multi-painel")} · {panels.length} {panels.length === 1 ? t("painel") : t("painéis")}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", borderRadius: 8, overflow: "hidden" }}>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => applyLayout(n)} title={`${n} ${n === 1 ? t("painel") : t("painéis")} (Ctrl+${n})`} style={layoutBtn(n)}>{n}</button>
              ))}
            </div>
            {panels.length < MAX_PANELS && (
              <button onClick={addPanel} style={outlineBtn}><Plus size={14} /> {t("Painel")}</button>
            )}
            {panels.length > 1 && (
              <button onClick={resetPanels} title={t("Voltar a 1 painel")} style={iconBtn}><RotateCcw size={14} /></button>
            )}
          </div>
        </div>
      ) : showChips ? (
        // Config/Agendamentos/Contatos: MESMO seletor discreto do multi-painel (dropdown "Todos os
        // Agentes ▾"), no lugar dos chips — mais sutil e consistente.
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", flex: "0 0 auto", position: "relative", zIndex: 5 }}>
          <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crasto-text-muted)", fontWeight: 700 }}>{t("Agente")}</span>
          <AgentPicker agents={visAgents} value={solo === "*" ? null : solo} onChange={(v) => setSolo(v || "*")} t={t} />
        </div>
      ) : null}

      {kpiBar}

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {/* Visão única (config/agenda/tarefas/contatos/deep-link): iframe montado SÓ quando a seção é
            única — evita um segundo carregamento escondido do wacrm competindo nas seções multi. */}
        {!isMulti && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            <iframe ref={frameRef} title="WhatsApp CRM" src={src} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay"
              onLoad={(e) => navFrame((e.currentTarget as HTMLIFrameElement).contentWindow, sectionPath)} />
          </div>
        )}
        {/* Seções multi já visitadas ficam MONTADAS (quentes) → reabrir é instantâneo; só a ativa aparece. */}
        {shownMulti.map((vs) => (
          <div key={vs} style={{ position: "absolute", inset: 0, display: isMulti && sec === vs ? "flex" : "none", flexDirection: "column" }}>
            {renderGrid(vs)}
          </div>
        ))}
      </div>
    </div>
  );
}
