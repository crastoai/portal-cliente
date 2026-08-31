import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Clock, MessageSquare, Plus, RotateCcw, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";
import { useUnitScope } from "../../lib/unitScope";

// API do wacrm (fonte de verdade dos agentes). Domínio PRÓPRIO, não o host cru do EasyPanel.
// DEV: VITE_WACRM_API_LOCAL aponta pra uma wacrm api rodando local (validar /api/me sem prod).
const WACRM_API = (import.meta.env.DEV && (import.meta.env.VITE_WACRM_API_LOCAL as string | undefined)) || "https://api.wacrm.crasto.ai";
type Agent = { id: string; name: string; slug?: string; status?: string; business_unit_id?: string | null };

// CACHE-BUST do iframe do CRM. O token vai no #hash da URL, e o hash NÃO faz parte da chave de cache
// do navegador — então a URL do iframe fica IDÊNTICA entre cargas e o navegador serve o CRM ANTIGO do
// cache mesmo depois do deploy (por isso nem deslogar/relogar resolvia: hash não muda a chave). Este
// selo é calculado UMA vez por carga do Portal (cada F5 gera outro) e entra na QUERY string — que É
// chave de cache — forçando o iframe a rebaixar o index.html novo do CRM a cada F5 do Portal. Casa com
// o `no-store` do nginx.client.conf (index.html do CRM), fechando o buraco do cache de iframe.
const CRM_CACHE_BUST = String(Date.now());

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
const SECTION_LABEL: Record<string, string> = { dashboard: "Cockpit", conversas: "Conversas", funil: "CRM" };
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
  // Fecha ao rolar/redimensionar. O clique-FORA fecha pelo BACKDROP abaixo (não por listener de
  // pointerdown em captura — esse fechava ANTES do onClick do item aplicar = o bug do "clicar 2x").
  useEffect(() => {
    if (!open) return;
    // Antes FECHAVA ao rolar/redimensionar (capture=true) — mas isso disparava com qualquer scroll
    // logo após abrir e fechava o dropdown ANTES do 1º clique no item registrar (= o "clicar 2x").
    // Agora REPOSICIONA o painel colado ao botão; só fecha se o botão sair mesmo da tela.
    const reposicionar = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
      setPos({ top: r.bottom + 6, left: r.left, width: Math.max(240, r.width) });
    };
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => { window.removeEventListener("scroll", reposicionar, true); window.removeEventListener("resize", reposicionar); };
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
        <>
          {/* backdrop: 1 clique fora fecha; fica ATRÁS do painel, então o clique no item aplica de 1ª */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99998 }} />
        <div ref={panelRef} className="crm-switch-panel crm-switch-panel--portal" style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 99999 }}>
          <button className="crm-switch-item" onPointerDown={(e) => { e.preventDefault(); pick(null); }}>
            <MessageSquare size={15} /> <b>{t("Todos os Agentes")}</b>
          </button>
          <div className="crm-switch-sep">{t("Agentes")}</div>
          {agents.map((a) => (
            <button key={a.id} className="crm-switch-item" onPointerDown={(e) => { e.preventDefault(); pick(a.id); }}>
              <span style={dotStyle(a)} /> <b>{a.name}</b>{a.slug ? <span className="crm-switch-sub">{a.slug}</span> : null}
            </button>
          ))}
          {agents.length === 0 && <div className="crm-switch-empty">{t("Nenhum agente configurado.")}</div>}
        </div>
        </>,
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
  // Deep-link do "Acessar" de uma solução: ?agent=<id> → o CRM abre JÁ nesse agente selecionado
  // (o cliente cai direto no agente do card; pode trocar p/ "Todos os Agentes" no seletor).
  const agentParam = params.get("agent");
  const sec = section || "dashboard"; // raiz /app/crm = Dashboard
  const isMulti = MULTI_SECTIONS.has(sec) && !convParam;
  const isUnified = sec === "tarefas"; // unificado: sem seletor, agrega todos os agentes

  const [crmUrl, setCrmUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshTok, setRefreshTok] = useState<string | undefined>(undefined); // p/ o wacrm se auto-renovar
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [showHist, setShowHist] = useState(false); // pop-up Histórico (auditoria) — nível Portal
  const [solo, setSolo] = useState<string>(agentParam || "*"); // escopo da VISÃO ÚNICA (config/agenda/contatos)
  const [store, setStore] = useState<Store>(loadStore); // COCKPIT MULTI-PAINEL, por seção
  const [err, setErr] = useState<string>("");
  const [live, setLive] = useState<import("../../services/delivery.service").CrmLive | null>(null);
  const [visited, setVisited] = useState<string[]>([]); // seções multi já abertas → ficam MONTADAS (quentes)
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Medição de uso: o WhatsApp CRM é o módulo mais usado, mas abre por AQUI (/app/crm), não pelo
  // ModuleEmbed — então até então NÃO entrava em "Uso dos módulos". sessRef guarda a sessão aberta
  // no mount para pulsar (ping 60s) e fechar na saída — igual ao ModuleEmbed dos demais módulos.
  const sessRef = useRef<string | null>(null);

  // Escopo de UNIDADE (CNPJ) — multi-CNPJ. A topbar escolhe a unidade; aqui os seletores e a
  // auto-distribuição de painéis passam a oferecer só os agentes daquela unidade (null = todas).
  const { unitId } = useUnitScope();
  const visAgents = useMemo<Agent[]>(() => {
    if (!agents) return [];
    if (!unitId) return agents;
    const scoped = agents.filter((a) => a.business_unit_id === unitId);
    // BLINDAGEM (bug "Nenhum agente configurado" no "Acessar como"): a unidade/CNPJ selecionada é
    // guardada por navegador e pode ser RESQUÍCIO de outra org (ex.: a do admin) — aí ela não bate
    // com o business_unit_id de NENHUM agente deste cliente e o filtro esconderia todos. Se o CNPJ
    // não corresponde a agente algum, mostramos TODOS em vez de zerar a lista (o heal do ClientShell
    // depois reacerta a unidade). Multi-CNPJ real (unidade COM agentes) continua filtrando normal.
    return scoped.length ? scoped : agents;
  }, [agents, unitId]);
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
  // Régua de KPIs RECOLHÍVEL — em tela menor/baixa ela rouba o espaço da conversa (feedback do Crasto,
  // reunião com cliente). Estado por-navegador. Default: fechada em telas pequenas (larg<1200 ou alt<800).
  const [kpisOpen, setKpisOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem("crasto.wa-kpis-open"); if (v != null) return v === "1"; } catch { /* ok */ }
    return typeof window !== "undefined" ? (window.innerWidth >= 1200 && window.innerHeight >= 800) : true;
  });
  useEffect(() => { try { localStorage.setItem("crasto.wa-kpis-open", kpisOpen ? "1" : "0"); } catch { /* ok */ } }, [kpisOpen]);
  // Tela pequena/baixa → modo COMPACTO: encurta o topo (menos padding, esconde subtítulo/badge P1)
  // pra sobrar altura pra conversa. Feedback do Crasto (usuários da SR Brasil em telas menores).
  const [compact, setCompact] = useState<boolean>(() => typeof window !== "undefined" && (window.innerHeight < 820 || window.innerWidth < 1000));
  // Cockpit no celular: abaixo de 768px força 1 painel só (N iframes lado a lado viram 90–190px cada e
  // o CRM fica ilegível). NÃO mexe no store → ao voltar pro desktop os painéis do usuário reaparecem.
  const [isNarrow, setIsNarrow] = useState<boolean>(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const on = () => { setCompact(window.innerHeight < 820 || window.innerWidth < 1000); setIsNarrow(window.innerWidth < 768); };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
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
        // Registra a abertura do CRM em delivery.module_sessions (o dono vê em "Uso dos módulos").
        if (crm.id && !sessRef.current) {
          const s = await services.delivery.moduleSessions.open(crm.id, "embed").catch(() => null);
          if (s?.id) sessRef.current = s.id;
        }
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
        // ?agent=<id> (deep-link do "Acessar"): abre JÁ nesse agente — na visão única E no cockpit
        // (semeia 1 painel dele na seção de entrada). Se o id não existir, cai no padrão.
        const wanted = agentParam && ags.some((a) => a.id === agentParam) ? agentParam : null;
        setSolo(wanted || (ags.length === 1 ? ags[0].id : "*"));
        if (wanted) setStore((prev) => ({ ...prev, [sec]: [{ id: newId(), agent: wanted }] }));
        else {
          // Sem deep-link ativo: a Leads/Funil (CRM) NÃO pode abrir presa num único agente — o painel
          // fica GRAVADO no localStorage (`store.funil`) quando alguém abre com `?agent=` uma vez, e
          // depois nunca volta para "Todos". Isso era o filtro "preso na Giovana" (reunião El Shadai
          // 25/08). Se o funil ficou com UM painel de UM agente (resquício do deep-link), auto-cura
          // para "Todos os Agentes" (= todos os vendedores). Layout multi-painel deliberado (2+) é
          // preservado. Só quando a org tem mais de um agente (senão Todos == o único agente).
          if (ags.length > 1) setStore((prev) => {
            const f = prev["funil"];
            if (f && f.length === 1 && f[0].agent) return { ...prev, funil: [{ id: newId(), agent: null }] };
            return prev;
          });
        }
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pulso (60s) + fechamento da sessão do CRM. `pagehide` cobre fechar aba/navegar para fora; o
  // retorno do efeito cobre a navegação interna do Portal. Mesma trava do ModuleEmbed.
  useEffect(() => {
    const pulso = setInterval(() => { if (sessRef.current) services.delivery.moduleSessions.ping(sessRef.current).catch(() => {}); }, 60_000);
    const fechar = () => { if (sessRef.current) { services.delivery.moduleSessions.close(sessRef.current).catch(() => {}); sessRef.current = null; } };
    window.addEventListener("pagehide", fechar);
    return () => { clearInterval(pulso); window.removeEventListener("pagehide", fechar); fechar(); };
  }, []);

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
  const singleAgent = isUnified ? "*" : solo; // Tarefas = todos; deep-link de conversa e demais visões únicas seguem o seletor de Agente (default "*" = todos, então a conversa sempre aparece)
  const sectionPath = convParam ? `/chat/${encodeURIComponent(convParam)}` : (SECTION_TO_PATH[sec] || "/");
  // A src da visão única reflete a SEÇÃO ATUAL (recarrega ao trocar de seção). Antes ficava
  // "congelada" no caminho inicial → Minhas Tarefas/Agendamentos abriam o Dashboard. Agora carrega certo.
  const src = useMemo(() => {
    if (!crmUrl || !token) return "";
    const q = singleAgent && singleAgent !== "*" ? `&agent=${encodeURIComponent(singleAgent)}` : "";
    const rf = refreshTok ? `&refresh_token=${encodeURIComponent(refreshTok)}` : "";
    return `${crmUrl}${sectionPath}?embedded=1&hostnav=1&_cb=${CRM_CACHE_BUST}${q}#access_token=${encodeURIComponent(token)}${rf}`;
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
  // ABRIU UMA CONVERSA no CRM: em telas MENORES recolhemos os KPIs pra dar espaço ao chat
  // (o cliente acessa muito em tela pequena). Em tela grande não mexe — cabe tudo.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string } | null;
      if (!d || d.type !== "crasto-crm-convo-open") return;
      if (window.innerHeight < 820 || window.innerWidth < 1000) setKpisOpen(false);
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
  const showChips = !isMulti && !isUnified && visAgents.length > 1; // config/agenda/contatos + deep-link de conversa (abrir pelo CRM): mostra o seletor de Agente
  const panelSrc = (gsec: string, ag: string | null) => {
    const q = ag ? `&agent=${encodeURIComponent(ag)}` : "";
    const rf = refreshTok ? `&refresh_token=${encodeURIComponent(refreshTok)}` : "";
    return `${crmUrl}${SECTION_TO_PATH[gsec] || "/"}?embedded=1&hostnav=1&_cb=${CRM_CACHE_BUST}${q}#access_token=${encodeURIComponent(token || "")}${rf}`;
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
  const kpiCells = (
    <>
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
    </>
  );
  // Aberta: chevron p/ recolher + os KPIs (rolam na horizontal). Fechada: tirinha fina "Mostrar métricas"
  // — libera ~50px de altura pra conversa em telas menores. Sempre alternável (o toggle nunca some).
  const kpiBar = kpisOpen ? (
    <div style={{ display: "flex", alignItems: "stretch", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", flex: "0 0 auto" }}>
      <button onClick={() => setKpisOpen(false)} title={t("Ocultar métricas")} aria-label={t("Ocultar métricas")} style={{ flex: "0 0 auto", width: 28, border: 0, borderRight: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", background: "transparent", color: "var(--crasto-text-muted)", cursor: "pointer", display: "grid", placeItems: "center" }}><ChevronUp size={16} /></button>
      <div style={{ display: "flex", alignItems: "stretch", overflowX: "auto", minWidth: 0, flex: 1 }}>{kpiCells}</div>
    </div>
  ) : (
    <button onClick={() => setKpisOpen(true)} title={t("Mostrar métricas")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", height: 26, border: 0, borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", background: "var(--crasto-surface, #fff)", color: "var(--crasto-text-muted)", cursor: "pointer", fontSize: 11.5, fontWeight: 500, flex: "0 0 auto" }}><ChevronDown size={14} /> {t("Mostrar métricas")}</button>
  );

  // Grid de painéis de UMA seção (usado tanto na ativa quanto nas visitadas que ficam montadas).
  const renderGrid = (gsec: string) => {
    const gp = store[gsec] || [{ id: `seed-${gsec}`, agent: null }];
    const shown = isNarrow ? gp.slice(0, 1) : gp; // celular: 1 painel só (store preservado p/ o desktop)
    return (
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {shown.map((panel, i) => (
          <div key={panel.id} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderLeft: i > 0 ? "1px solid var(--crasto-border-soft, rgba(1,14,38,.10))" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: compact ? "3px 6px 3px 8px" : "6px 8px 6px 10px", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", flex: "0 0 auto", position: "relative", zIndex: 5 }}>
              {(!compact || shown.length > 1) && <span title={t("Painel {n}", { n: i + 1 })} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--crasto-blue, #6E9CE8)", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "ui-monospace, monospace", padding: "2px 7px", borderRadius: 6, flex: "0 0 auto" }}>P{i + 1}</span>}
              <AgentPicker agents={visAgents} value={panel.agent} onChange={(v) => setPanelAgent(panel.id, v)} t={t} />
              {shown.length > 1 && (
                <button onClick={() => removePanel(panel.id)} title={t("Fechar painel")} style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, border: 0, background: "transparent", color: "var(--crasto-text-muted)", cursor: "pointer", flex: "0 0 auto", borderRadius: 6 }}><X size={15} /></button>
              )}
              {/* HISTÓRICO (auditoria) — ao lado do seletor de agentes. Pop-up de nível Portal
                  (cobre o sistema todo). Só no 1º painel para não duplicar. Global, todo cliente. */}
              {i === 0 && (
                <button onClick={() => setShowHist(true)} title={t("Histórico de ações (auditoria)")}
                  style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 13px", flex: "0 0 auto", border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", borderRadius: 8, background: "var(--crasto-surface, #fff)", color: "var(--crasto-text-primary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  <Clock size={14} /> {t("Histórico")}
                </button>
              )}
              {/* 1 painel: acesso compacto ao multi-painel (comparar agentes). A barra do cockpit
                  fica escondida quando é 1 painel só — abrir outro painel a traz de volta. */}
              {i === 0 && shown.length === 1 && !isNarrow && panels.length < MAX_PANELS && (
                <button onClick={addPanel} title={t("Comparar agentes (abrir outro painel)")} style={{ ...outlineBtn, flex: "0 0 auto" }}><Plus size={13} /> {t("Painel")}</button>
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
      {isMulti ? (isNarrow || panels.length <= 1 ? null : (
        // HEADER do cockpit — só aparece ao COMPARAR (2+ painéis). Com 1 painel ele some (título/abas
        // redundantes gastavam altura em tela menor); o "+Painel" p/ voltar ao multi vive no cabeçalho
        // do painel. No celular também some (você já entrou por "Conversas").
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 12, padding: compact ? "4px 10px" : "8px 16px", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", flex: "0 0 auto" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 700, color: "var(--crasto-text-primary)", lineHeight: 1.15 }}>{t(SECTION_LABEL[sec] || "WhatsApp CRM")}</div>
            {!compact && <div style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}>{t("Multi-painel")} · {panels.length} {panels.length === 1 ? t("painel") : t("painéis")}</div>}
          </div>
          {!isNarrow && (
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
          )}
        </div>
      )) : showChips ? (
        // Config/Agendamentos/Contatos: MESMO seletor discreto do multi-painel (dropdown "Todos os
        // Agentes ▾"), no lugar dos chips — mais sutil e consistente.
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", flex: "0 0 auto", position: "relative", zIndex: 5 }}>
          <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crasto-text-muted)", fontWeight: 700 }}>{t("Agente")}</span>
          <AgentPicker agents={visAgents} value={solo === "*" ? null : solo} onChange={(v) => setSolo(v || "*")} t={t} />
        </div>
      ) : null}

      {/* No celular a régua de KPI (e a tirinha "Mostrar métricas") SOME — ela roubava altura e empurrava
          o composer pra fora ("chat escondido"). As métricas seguem no tablet/desktop. */}
      {!isNarrow && kpiBar}

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
      {showHist && <HistoricoPortal apiBase={WACRM_API} token={token} t={t} onClose={() => setShowHist(false)} />}
    </div>
  );
}

// ── HISTÓRICO (auditoria) — pop-up de nível PORTAL (createPortal no body → o blur cobre o sistema
// inteiro, não só o iframe do CRM). Largo. Lê a trilha da wacrm-api com o token do Portal, atualiza
// a cada 5s (ao vivo) e permite registrar um log manual. Global (todo cliente). ──
type AuditEv = { id: string; at: string; action: string; actor_name?: string | null; actor_email?: string | null; context?: Record<string, unknown> };
const dotColor: Record<string, string> = { assumiu: "#2E6F9E", transferiu: "#C9922B", devolveu_ia: "#8892A6", descartou_auto: "#B85C5C", nota: "#1F8A5B" };
// Data e hora EXATAS, até o segundo (um log tem que saber de tudo): DD/MM/AAAA HH:MM:SS.
function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function quemDe(e: AuditEv): string {
  if (e.action === "descartou_auto") return "IA (automático)";
  return e.actor_name || e.actor_email || "Sistema";
}
function acaoDe(e: AuditEv): string {
  const c = (e.context || {}) as Record<string, string>;
  const contato = c.contato ? ` ${c.contato}` : "";
  switch (e.action) {
    case "assumiu": return `Assumiu a conversa com${contato}`;
    case "devolveu_ia": return `Devolveu${contato} para a IA`;
    case "transferiu": return `Transferiu${contato} para ${c.para || "um colega"}`;
    case "descartou_auto": return `Moveu${contato} para Descartados (${c.motivo || "recusa"})`;
    case "nota": return `Nota: ${c.texto || ""}${c.contato ? ` — ${c.contato}` : ""}`;
    case "entrou_no_crm": return "Entrou no CRM";
    case "conversation_deleted": return "Apagou uma conversa";
    case "conversation_cleared": return "Limpou uma conversa";
    default: return e.action;
  }
}
function HistoricoPortal({ apiBase, token, t, onClose }: { apiBase: string; token: string | null; t: (s: string) => string; onClose: () => void }) {
  const [evs, setEvs] = useState<AuditEv[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [de, setDe] = useState("");   // filtro de período: data inicial (YYYY-MM-DD)
  const [ate, setAte] = useState(""); // data final
  const carregar = useMemo(() => async () => {
    if (!token) return;
    try {
      const q = new URLSearchParams({ limit: "500" });
      if (de) q.set("from", de);
      if (ate) q.set("to", ate);
      const r = await fetch(`${apiBase}/api/audit/history?${q.toString()}`, { headers: { Authorization: "Bearer " + token } });
      const d = await r.json(); if (Array.isArray(d)) setEvs(d);
    } catch { /* silencioso — tenta de novo no próximo ciclo */ } finally { setCarregando(false); }
  }, [apiBase, token, de, ate]);
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const diasAtras = (n: number) => { const d = new Date(Date.now() - n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  useEffect(() => { carregar(); const iv = setInterval(carregar, 5000); return () => clearInterval(iv); }, [carregar]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);
  async function registrar() {
    const txt = nota.trim(); if (!txt || salvando || !token) return;
    setSalvando(true);
    try { await fetch(`${apiBase}/api/audit/note`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ text: txt }) }); setNota(""); await carregar(); }
    finally { setSalvando(false); }
  }
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(3,10,26,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "3vh 3vw" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "min(78vh, 820px)", display: "flex", flexDirection: "column", background: "var(--crasto-surface, #fff)", border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.12))", borderRadius: 16, boxShadow: "0 24px 70px rgba(1,14,38,.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.1))" }}>
          <Clock size={18} style={{ color: "#2E6F9E" }} />
          <b style={{ fontSize: 16, color: "var(--crasto-text-primary)" }}>{t("Histórico")}</b>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#1F8A5B", display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1F8A5B", display: "inline-block" }} /> {t("ao vivo")}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", display: "grid", placeItems: "center", width: 30, height: 30, border: 0, borderRadius: 8, background: "transparent", color: "var(--crasto-text-muted)", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 10, padding: "12px 20px", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))" }}>
          <input value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") registrar(); }}
            placeholder={t("Registrar um log (ex.: liguei, cliente pediu retorno)…")}
            style={{ flex: 1, background: "var(--crasto-bg, #f6f8fb)", border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", borderRadius: 9, padding: "9px 13px", fontSize: 13.5, color: "var(--crasto-text-primary)" }} />
          <button onClick={registrar} disabled={salvando || !nota.trim()} style={{ padding: "0 18px", borderRadius: 9, border: 0, background: nota.trim() ? "#2E6F9E" : "var(--crasto-border-soft, #cfd6e2)", color: "#fff", fontWeight: 600, fontSize: 13.5, cursor: nota.trim() ? "pointer" : "default" }}>{t("Registrar")}</button>
        </div>
        {/* FILTRO POR PERÍODO — presets + data específica (padrão do sistema). */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 20px", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))" }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--crasto-text-muted)" }}>{t("Período")}</span>
          {([[t("Tudo"), "", ""], [t("Hoje"), hoje(), hoje()], [t("7 dias"), diasAtras(6), hoje()], [t("30 dias"), diasAtras(29), hoje()]] as const).map(([lb, f, tt], i) => {
            const ativo = de === f && ate === tt;
            return <button key={i} onClick={() => { setDe(f); setAte(tt); }} style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid " + (ativo ? "#2E6F9E" : "var(--crasto-border-soft, rgba(1,14,38,.14))"), background: ativo ? "#2E6F9E" : "transparent", color: ativo ? "#fff" : "var(--crasto-text-body)" }}>{lb}</button>;
          })}
          <span style={{ width: 1, height: 20, background: "var(--crasto-border-soft, rgba(1,14,38,.12))", margin: "0 2px" }} />
          <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} title={t("De")} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", background: "var(--crasto-bg, #f6f8fb)", color: "var(--crasto-text-primary)", fontSize: 12.5 }} />
          <span style={{ color: "var(--crasto-text-muted)", fontSize: 12 }}>{t("até")}</span>
          <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} title={t("Até")} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", background: "var(--crasto-bg, #f6f8fb)", color: "var(--crasto-text-primary)", fontSize: 12.5 }} />
          {(de || ate) && (
            <button onClick={() => { setDe(""); setAte(""); }} title={t("Limpar filtro")} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", background: "transparent", color: "var(--crasto-text-muted)" }}>
              <X size={12} /> {t("Limpar filtro")}
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--crasto-text-muted)" }}>{evs.length} {evs.length === 1 ? t("registro") : t("registros")}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {carregando && evs.length === 0 && <div style={{ padding: 20, color: "var(--crasto-text-muted)", fontSize: 13.5 }}>{t("Carregando…")}</div>}
          {!carregando && evs.length === 0 && <div style={{ padding: 20, color: "var(--crasto-text-muted)", fontSize: 13.5 }}>{t("Sem registros ainda.")}</div>}
          {evs.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {[t("Data e hora"), t("Usuário"), t("Ação")].map((h, i) => (
                    <th key={i} style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--crasto-bg, #f6f8fb)", textAlign: "left", padding: "10px 16px", fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--crasto-text-muted)", fontWeight: 700, borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.14))", width: i === 2 ? "100%" : undefined, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evs.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--crasto-border-soft, rgba(1,14,38,.07))" }}>
                    <td style={{ padding: "9px 16px", verticalAlign: "top", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: "var(--crasto-text-muted)", lineHeight: 1.4 }}>{dataHora(e.at)}</td>
                    <td style={{ padding: "9px 16px", verticalAlign: "top", whiteSpace: "nowrap", fontWeight: 600, color: "var(--crasto-text-primary)", lineHeight: 1.4 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor[e.action] || "#8892A6", flex: "0 0 auto" }} />{quemDe(e)}</span>
                    </td>
                    <td style={{ padding: "9px 16px", verticalAlign: "top", color: "var(--crasto-text-primary)", lineHeight: 1.4 }}>{acaoDe(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
