import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { LogOut, Menu, X, Camera, Lock, ChevronLeft, ChevronRight, ChevronDown, Bell, Rocket, Sparkles, AlertTriangle, DollarSign, MessageCircle, IdCard, ShieldCheck, Wallet, Building2, Check, Plus, Minus, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { services } from "../services";
import ThemeToggle from "../ui/ThemeToggle";
import LangSwitcher from "../ui/LangSwitcher";
import AddCompanyModal from "../ui/AddCompanyModal";
import { useT } from "../lib/i18n";
import { useUnitScope } from "../lib/unitScope";
import { playNotifSound, podeNotificarDesktop } from "../lib/notifPrefs";
import { initials } from "../ui/ui";

// Seletor de UNIDADE (CNPJ) na topbar — multi-CNPJ. Aparece SEMPRE (mesmo com 1 CNPJ): mostra a
// matriz/CNPJ da empresa e, para o dono/admin, permite ADICIONAR outra empresa ali mesmo. Escopa a
// visão do CRM à unidade escolhida (null = "Todas as unidades"). A empresa criada aqui é a MESMA
// que aparece nos detalhes do cliente (admin) e em "Dados da empresa" — uma fonte só (business_units).
function UnitSwitcher() {
  const t = useT();
  const { units, unitId, setUnitId, canManage } = useUnitScope();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  // Só some para membro comum de empresa que (ainda) não tem nenhuma unidade cadastrada.
  if (units.length === 0 && !canManage) return null;
  const cur = unitId ? units.find((u) => u.id === unitId) : null;

  return (
    <div className="unitdd" ref={ref}>
      <button type="button" className={"unitdd-btn" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)} title={t("Unidade (CNPJ)")}>
        <Building2 size={15} className="unitdd-ico" />
        <span className="unitdd-lbl">{cur ? cur.name + (cur.is_primary ? ` · ${t("Matriz")}` : "") : t("Todas as unidades")}</span>
        <ChevronDown size={13} className="unitdd-chev" />
      </button>
      {open && (
        <div className="unitdd-menu" role="listbox">
          <button type="button" className={"unitdd-item" + (!unitId ? " on" : "")} onClick={() => { setUnitId(null); setOpen(false); }}>
            <span className="unitdd-item-nm">{t("Todas as unidades")}</span>
            {!unitId && <Check size={14} className="unitdd-check" />}
          </button>
          {units.length > 0 && <div className="unitdd-sep" />}
          {units.map((u) => (
            <button key={u.id} type="button" className={"unitdd-item" + (u.id === unitId ? " on" : "")} onClick={() => { setUnitId(u.id); setOpen(false); }}>
              <span className="unitdd-item-nm">{u.name}{u.is_primary ? ` · ${t("Matriz")}` : ""}</span>
              {u.cnpj && <span className="unitdd-item-cnpj">{u.cnpj}</span>}
              {u.id === unitId && <Check size={14} className="unitdd-check" />}
            </button>
          ))}
          {canManage && (
            <>
              <div className="unitdd-sep" />
              <button type="button" className="unitdd-item unitdd-add" onClick={() => { setAddOpen(true); setOpen(false); }}>
                <Plus size={15} className="unitdd-ico" />
                <span className="unitdd-item-nm">{t("Adicionar empresa (CNPJ)")}</span>
              </button>
            </>
          )}
        </div>
      )}
      {addOpen && <AddCompanyModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

// Central de notificações: ícone por tipo + rótulo de quem está atuando.
function notifIcon(type: string) {
  switch (type) {
    case "implementation_request": return <Rocket size={15} />;
    case "improvement_request": return <Sparkles size={15} />;
    case "support": case "ticket_update": return <MessageCircle size={15} />;
    case "health_red": return <AlertTriangle size={15} />;
    case "invoice": return <DollarSign size={15} />;
    default: return <Bell size={15} />;
  }
}
const ASSIGNEE_L: Record<string, string> = { agente_ia: "Jorge (IA)", john: "John", crasto: "Crasto" };

// Logo OFICIAL crasto.ai (lockup minúsculo do DS/site) — navy no claro, branco no escuro.
function Wordmark() {
  return (
    <span className="side-wordmark">
      <img className="mk-light" src="/crasto-lockup-navy.png" alt="crasto.ai" />
      <img className="mk-dark" src="/crasto-lockup-white.png" alt="crasto.ai" />
    </span>
  );
}

// `to` = rota interna (NavLink). `onClick` sem `to` = ação (abrir módulo externo/SSO).
// `locked` = módulo não contratado (cadeado + upsell) — o clique chama `onClick`.
// Filho de um grupo colapsável. Antes só link simples (to obrigatório); agora suporta também
// filho BLOQUEADO (cadeado + upsell) e AÇÃO (onClick sem to) — p/ agrupar módulos como Marketing.
// `children` = sub-galhos (3º nível+). O motor do sidebar é RECURSIVO: um filho pode ter filhos
// (ex.: Vendas › WhatsApp › Conversas/Tarefas/…; ou RH › Avaliação comportamental › ferramentas).
export type NavChild = { to?: string; label: string; end?: boolean; tag?: string; locked?: boolean; onClick?: () => void; children?: NavChild[]; icon?: LucideIcon };
// `mod` = pinta o nome/ícone com a cor de MÓDULO (azul, negrito) — o mesmo sinal visual do cliente.
// Usado hoje pelos itens do admin (que ainda são links planos, sem árvore); os nós-pai de árvore já
// recebem `navlink--mod` sozinhos no render.
export type NavItem = { to?: string; end?: boolean; icon: LucideIcon; label: string; tag?: string; section?: string; locked?: boolean; mod?: boolean; onClick?: () => void; children?: NavChild[] };

export default function Shell({ nav, who, sub, logoTone, bottomNav, brandTag }: { nav: NavItem[]; who: string; sub: string; logoTone?: string; bottomNav?: NavItem[]; brandTag?: string }) {
  const { profile, signOut, refreshProfile } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // Barra lateral SEMPRE entra ABERTA (pedido do Crasto, reunião Connect): recolher é uma ação
  // temporária da sessão — não persiste entre entradas, para nunca "entrar recolhido".
  const [collapsed, setCollapsed] = useState<boolean>(false);
  // Mensagem central ao clicar num item BLOQUEADO (módulo não contratado) — pedido do Crasto: em vez
  // de mandar pro catálogo, avisa que o conteúdo está indisponível e orienta falar com o comercial.
  const [lockedMsg, setLockedMsg] = useState(false);
  const [avBusy, setAvBusy] = useState(false);
  const avInput = useRef<HTMLInputElement>(null);
  const ini = initials(profile?.full_name || profile?.email);

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !profile?.id) return;
    if (!file.type.startsWith("image/")) return;
    setAvBusy(true);
    try { await services.identity.profiles.uploadAvatar(profile.id, file); await refreshProfile(); }
    catch { /* silencioso — mantém a foto atual */ }
    finally { setAvBusy(false); }
  }

  // agrupa a navegação por seção, preservando a ordem (padrão do DS de sistema)
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const n of nav) {
    const last = groups[groups.length - 1];
    if (!last || last.section !== n.section) groups.push({ section: n.section, items: [n] });
    else last.items.push(n);
  }

  // CATEGORIAS COLAPSÁVEIS. Item SEM seção = navegação primária, sempre visível no topo
  // (a home). Item COM seção = sob um cabeçalho clicável com seta. Preferência por seção
  // persistida; a seção da rota ATIVA reabre sozinha ao navegar (senão o item ativo sumiria).
  const [secOpen, setSecOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("portal.nav.open") || "{}"); } catch { return {}; }
  });
  const toggleSec = (s: string) => setSecOpen((o) => {
    const next = { ...o, [s]: !(o[s] ?? true) };
    try { localStorage.setItem("portal.nav.open", JSON.stringify(next)); } catch { /* storage cheio: só não persiste */ }
    return next;
  });
  const secDaRota = (items: NavItem[]) => items.some((n) => n.to && (n.to === "/app" || n.to === "/admin" ? pathname === n.to : pathname.startsWith(n.to)));
  // Ao NAVEGAR, garante que a seção da rota ativa esteja aberta (mas o usuário pode fechá-la depois).
  useEffect(() => {
    const alvo = groups.find((g) => g.section && secDaRota(g.items));
    if (alvo?.section && secOpen[alvo.section] === false)
      setSecOpen((o) => ({ ...o, [alvo.section!]: true }));
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Item de menu EXPANSÍVEL (pai com filhos) — hoje só o WhatsApp CRM, cujas seções (Conversas,
  // Dashboard, …, Configurações) viram sub-itens DENTRO da sidebar do Portal. Abre por padrão;
  // a seta recolhe. Persiste a preferência.
  const [treeOpen, setTreeOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("portal.nav.tree") || "{}"); } catch { return {}; }
  });
  const toggleTree = (k: string) => setTreeOpen((o) => {
    const next = { ...o, [k]: !(o[k] ?? true) };
    try { localStorage.setItem("portal.nav.tree", JSON.stringify(next)); } catch { /* storage cheio */ }
    return next;
  });

  // FLYOUT do sidebar RECOLHIDO: hover num ícone abre um popup à direita — com o rótulo (itens
  // simples) OU as sub-abas (WhatsApp CRM). Posicionado por JS (fixed) p/ não ser cortado pelo
  // overflow da sidebar. Fecha com pequeno atraso (dá tempo de ir do ícone até o popup).
  const [fly, setFly] = useState<{ top: number; item: NavItem } | null>(null);
  const flyT = useRef<number>();
  const openFly = (e: React.MouseEvent, n: NavItem) => {
    if (!collapsed) return;
    window.clearTimeout(flyT.current);
    setFly({ top: (e.currentTarget as HTMLElement).getBoundingClientRect().top, item: n });
  };
  const closeFly = () => { flyT.current = window.setTimeout(() => setFly(null), 130); };
  const keepFly = () => window.clearTimeout(flyT.current);
  const hoverProps = (n: NavItem) => ({ onMouseEnter: (e: React.MouseEvent) => openFly(e, n), onMouseLeave: closeFly });

  // Achata os galhos numa lista de FOLHAS (itens navegáveis/ação) — usado no flyout do sidebar
  // recolhido, onde não faz sentido re-aninhar: mostra direto Conversas/Tarefas/… sob o ícone.
  const flatLeaves = (kids: NavChild[]): NavChild[] => kids.flatMap((c) => (c.children && c.children.length) ? flatLeaves(c.children) : [c]);

  // Renderiza um FILHO da árvore, recursivamente. Folha = link/ação; filho COM filhos = sub-grupo
  // colapsável (3º nível: WhatsApp › Conversas/Tarefas/…). `depth` só controla a indentação
  // (nível 1 = 40px, herdado do CSS de `.navlink--child`; cada nível soma 16px). `keyPath` dá uma
  // chave única de expansão por caminho, pra sub-grupos com o mesmo rótulo em módulos diferentes.
  const renderChild = (c: NavChild, depth: number, keyPath: string) => {
    // Indentação enxuta (base 28px, +14 por nível) pra caber TODO o texto na sidebar sem cortar
    // (pedido do Crasto: nada de "Gerador de Rot..." nem "em bre" cortado).
    const padLeft = 28 + (depth - 1) * 14;
    if (c.children && c.children.length) {
      const k = keyPath + "/" + c.label;
      const aberto = treeOpen[k] ?? true;
      const todosBloq = c.children.every((g) => g.locked);
      return (
        <div key={c.label} className={"navtree navtree--sub" + (aberto ? " open" : "")}>
          <button type="button" className="navlink navlink--child navlink--parent" style={{ paddingLeft: padLeft }} aria-expanded={aberto} onClick={() => toggleTree(k)}>
            <span className="navlink-lbl">{t(c.label)}</span>
            {todosBloq && <Lock size={12} className="navlink-lock" style={{ marginLeft: "auto" }} />}
            {aberto
              ? <Minus size={14} className="navtree-plus" style={todosBloq ? { marginLeft: 6 } : { marginLeft: "auto" }} />
              : <Plus size={14} className="navtree-plus" style={todosBloq ? { marginLeft: 6 } : { marginLeft: "auto" }} />}
          </button>
          <div className="navtree-kids">
            {c.children.map((g) => renderChild(g, depth + 1, k))}
          </div>
        </div>
      );
    }
    const ci = <>{c.icon ? <c.icon size={15} style={{ flex: "none", opacity: .85 }} /> : null}<span className="navlink-lbl">{t(c.label)}</span>{c.locked ? <Lock size={12} className="navlink-lock" /> : c.tag ? <span className="tag">{c.tag}</span> : null}</>;
    if (c.to) return (
      <NavLink key={c.label} to={c.to} end={c.end} onClick={() => setOpen(false)} style={{ paddingLeft: padLeft }} className={({ isActive }) => "navlink navlink--child" + (isActive ? " on" : "")}>{ci}</NavLink>
    );
    return (
      <button key={c.label} type="button" style={{ paddingLeft: padLeft }} className={"navlink navlink--child" + (c.locked ? " navlink--locked" : "")} title={c.locked ? t("Conteúdo indisponível no momento") : undefined} onClick={() => { setOpen(false); if (c.locked) setLockedMsg(true); else c.onClick?.(); }}>{ci}</button>
    );
  };

  const renderItem = (n: NavItem) => {
    // Item EXPANSÍVEL (pai + filhos): o WhatsApp CRM e suas seções. Recolhido (só ícones) o pai
    // vira atalho pro módulo e os filhos somem; expandido, mostra a árvore.
    if (n.children && n.children.length) {
      const aberto = treeOpen[n.label] ?? true;
      const paiAtivo = !!n.to && (pathname === n.to || pathname.startsWith(n.to + "/"));
      if (collapsed) {
        // recolhido: pai vira atalho. Se o grupo não tem rota própria, mira o 1º filho navegável;
        // se todos os filhos são bloqueados (sem to), vira botão que dispara a ação do 1º filho.
        const kids = n.children;
        const alvo = n.to || kids.find((c) => c.to)?.to;
        const ic = <><n.icon size={17} /> <span className="navlink-lbl">{t(n.label)}</span></>;
        return alvo ? (
          <NavLink key={n.label} to={alvo} onClick={() => setOpen(false)} className={"navlink" + (paiAtivo ? " on" : "")} title={t(n.label)} {...hoverProps(n)}>{ic}</NavLink>
        ) : (
          <button key={n.label} type="button" className="navlink" onClick={() => { setOpen(false); if (kids.every((c) => c.locked)) setLockedMsg(true); else (kids.find((c) => c.onClick) || kids[0])?.onClick?.(); }} title={t(n.label)} {...hoverProps(n)}>{ic}</button>
        );
      }
      const todosBloqueados = n.children.every((c) => c.locked); // módulo não contratado → cadeado no pai
      return (
        <div key={n.label} className={"navtree" + (aberto ? " open" : "")}>
          {/* Nó PAI = nome do MÓDULO (azul, negrito) com "+/−" pra expandir a árvore (pedido do Crasto). */}
          <button type="button" className={"navlink navlink--parent navlink--mod" + (paiAtivo ? " on" : "")} aria-expanded={aberto} onClick={() => toggleTree(n.label)}>
            <n.icon size={17} /> <span className="navlink-lbl">{t(n.label)}</span>
            {todosBloqueados && <Lock size={12} className="navlink-lock" style={{ marginLeft: "auto" }} />}
            {aberto
              ? <Minus size={15} className="navtree-plus" style={todosBloqueados ? { marginLeft: 6 } : { marginLeft: "auto" }} />
              : <Plus size={15} className="navtree-plus" style={todosBloqueados ? { marginLeft: 6 } : { marginLeft: "auto" }} />}
          </button>
          <div className="navtree-kids">
            {n.children.map((c) => renderChild(c, 1, n.label))}
          </div>
        </div>
      );
    }
    const inner = <><n.icon size={17} /> <span className="navlink-lbl">{t(n.label)}</span>
      {n.locked ? <Lock size={13} className="navlink-lock" /> : n.tag ? <span className="tag">{n.tag}</span> : null}</>;
    // `mod` pinta o link plano com a cor de módulo (azul) — mesmo sinal do cliente.
    const modCls = n.mod ? " navlink--mod" : "";
    if (n.locked) return (
      <button key={n.label} type="button" className={"navlink navlink--locked" + modCls} title={t("Conteúdo indisponível no momento")} onClick={() => { setOpen(false); setLockedMsg(true); }} {...hoverProps(n)}>{inner}</button>
    );
    if (!n.to && n.onClick) return (
      <button key={n.label} type="button" className={"navlink" + modCls} onClick={() => { setOpen(false); n.onClick?.(); }} {...hoverProps(n)}>{inner}</button>
    );
    return (
      <NavLink key={n.to} to={n.to!} end={n.end} onClick={() => setOpen(false)} {...hoverProps(n)} className={({ isActive }) => {
        const match = isActive || (n.to === "/admin/clientes" && pathname.startsWith("/admin/cliente/"));
        return "navlink" + (match ? " on" : "") + modCls;
      }}>{inner}</NavLink>
    );
  };

  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false); // dropdown do perfil (Hostinger-like)
  // Celular estreito: Idioma+Tema saem do topbar (que lotava/sobrepunha) e vão pro dropdown de perfil.
  const [narrow, setNarrow] = useState<boolean>(() => typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches);
  useEffect(() => { const mq = window.matchMedia("(max-width: 560px)"); const on = () => setNarrow(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  const prevNotif = useRef<number | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    const load = () => services.support.notifications.list().then((r: any) => {
      if (!alive) return;
      const c = r?.count || 0;
      // Aviso NOVO (contagem subiu) → toca o som escolhido + notificação do desktop (se ligados).
      // O 1º load só registra a base (não toca) — evita "tocar" ao abrir a página.
      if (prevNotif.current !== null && c > prevNotif.current) {
        playNotifSound();
        try {
          if (podeNotificarDesktop()) {
            new Notification(t("Crasto.AI"), { body: t("Você tem {n} nova(s) notificação(ões)", { n: c }) });
          }
        } catch { /* ignore */ }
      }
      prevNotif.current = c;
      setNotifs(r?.items || []); setNotifCount(c);
    }).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [profile?.id]);
  function toggleBell() {
    const opening = !bellOpen;
    setBellOpen(opening);
    if (opening && notifCount > 0) { setNotifCount(0); services.support.notifications.markSeen(); }
  }

  const goProfile = profile?.role === "crasto_admin" ? "/admin/perfil" : "/app/perfil";
  const goFinance = profile?.role === "crasto_admin" ? "/admin/financeiro" : "/app/financeiro";
  const userCluster = (
    <>
      {profile?.id && (
        <div className="tb-bell-wrap">
          <button type="button" className={"tb-bell" + (notifCount > 0 ? " on" : "")} title={notifCount > 0 ? t("{n} nova(s) notificação(ões)", { n: notifCount }) : t("Notificações")} onClick={toggleBell} aria-label={t("Notificações")}>
            <Bell size={17} />
            {notifCount > 0 && <span className="tb-bell__dot">{notifCount}</span>}
          </button>
          {bellOpen && (<>
            <div className="tb-bell__ovl" onClick={() => setBellOpen(false)} />
            <div className="tb-bell__panel">
              <div className="tb-bell__head">{t("Notificações")}</div>
              {notifs.length === 0 ? <div className="tb-bell__empty">{t("Tudo em dia ✓")}</div> : notifs.map((n, i) => (
                <button key={i} className="tb-bell__item" onClick={() => { setBellOpen(false); if (n.link) navigate(n.link); }}>
                  <span className="tb-bell__ic">{notifIcon(n.type)}</span>
                  <span className="tb-bell__txt"><span className="tt">{n.title}</span>{n.subtitle && <span className="ss">{n.subtitle}</span>}</span>
                  {n.assignee && <span className="tb-bell__who">{ASSIGNEE_L[n.assignee] || n.assignee}</span>}
                </button>
              ))}
            </div>
          </>)}
        </div>
      )}
      {/* PERFIL — dropdown consolidado (Hostinger-like). Tema/idioma ficam FORA (visíveis no topbar). */}
      <div className="tb-prof">
        <button type="button" className={"tb-prof-btn" + (profOpen ? " open" : "")} title={t("Menu do perfil")} onClick={() => setProfOpen((v) => !v)}>
          <span className="tb-av" style={!profile?.avatar_url && logoTone ? { background: logoTone } : undefined}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : ini}
          </span>
          <ChevronDown size={14} className="tb-prof-chev" />
        </button>
        {profOpen && (<>
          <div className="tb-prof__ovl" onClick={() => setProfOpen(false)} />
          <div className="tb-prof__panel">
            <button type="button" className="tb-prof__head" disabled={avBusy} onClick={() => avInput.current?.click()} title={t("Trocar foto de perfil")}>
              <span className="tb-prof__av" style={!profile?.avatar_url && logoTone ? { background: logoTone } : undefined}>
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : ini}
                <span className="su-av__cam"><Camera size={11} /></span>
              </span>
              <span className="tb-prof__id"><b>{who}</b><span>{profile?.email}</span></span>
            </button>
            <input ref={avInput} type="file" accept="image/*" hidden onChange={onAvatar} />
            <div className="tb-prof__sep" />
            {/* Celular: Idioma + Tema vivem aqui (saíram do topbar apertado). */}
            {narrow && <div className="tb-prof__prefs"><LangSwitcher /><ThemeToggle /></div>}
            {narrow && <div className="tb-prof__sep" />}
            <button className="pm-item" onClick={() => { setProfOpen(false); navigate(goProfile); }}><IdCard size={16} /> {t("Configurações")}</button>
            <button className="pm-item" onClick={() => { setProfOpen(false); navigate(profile?.role === "crasto_admin" ? goProfile : `${goProfile}?sec=notif`); }}><Bell size={16} /> {t("Notificações")}</button>
            <button className="pm-item" onClick={() => { setProfOpen(false); navigate(`${goProfile}?sec=seguranca`); }}><ShieldCheck size={16} /> {t("Autenticação em duas etapas")}</button>
            <button className="pm-item" onClick={() => { setProfOpen(false); navigate(goFinance); }}><Wallet size={16} /> {t("Financeiro")}</button>
            <div className="tb-prof__sep" />
            <button className="pm-item pm-item--out" onClick={() => signOut()}><LogOut size={16} /> {t("Sair")}</button>
          </div>
        </>)}
      </div>
    </>
  );

  // Módulo full-bleed: o WhatsApp CRM embarcado integra de BORDA A BORDA na área de conteúdo (sem o
  // "cartão" arredondado do .canvas, que fazia o CRM parecer uma caixa flutuando e desperdiçava espaço).
  const flush = /^\/(app|admin)\/crm(\/|$)/.test(pathname);
  return (
    <div className={"shell" + (collapsed ? " collapsed" : "") + (flush ? " shell--flush" : "")}>
      {open && <div className="side-overlay" onClick={() => setOpen(false)} />}

      {/* TOPBAR FULL-WIDTH (uma barra só): logo à esquerda, controles à direita — atravessa a sidebar. */}
      <header className="topbar">
        <div className="tb-left">
          <button className="tb-burger" onClick={() => setOpen(true)} aria-label={t("Abrir menu")}><Menu size={20} /></button>
          <span className="tb-brand" title={t(sub)}><Wordmark /></span>
          {/* Tag da EMPRESA logada ao lado da logo — o dono vê o nome da empresa dele (sensação de
              exclusividade + saber de cara em qual está). Nome vem da matriz (unidade primária). */}
          {brandTag ? (
            <span
              className="tb-company"
              title={brandTag}
              style={{
                display: "inline-flex", alignItems: "center", maxWidth: "min(38vw, 220px)", marginLeft: 6,
                padding: "3px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: ".01em",
                color: "var(--crasto-blue, #2E6F9E)", background: "var(--crasto-blue-05, rgba(78,147,212,.10))",
                border: "1px solid var(--crasto-blue-15, rgba(78,147,212,.26))",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >{brandTag}</span>
          ) : null}
        </div>
        <div className="tb-right">
          <UnitSwitcher />
          {!narrow && <LangSwitcher />}
          {!narrow && <ThemeToggle />}
          {userCluster}
        </div>
      </header>

      {/* Recolher/expandir: handle circular FLUTUANTE, cravado na borda direita da sidebar e
          centrado na linha que separa a topbar do conteúdo. Fora da .side de propósito — assim
          não é cortado pela topbar (empilhamento) e NÃO empurra os itens do menu pra baixo. */}
      <button className="side-toggle" onClick={() => setCollapsed((c) => !c)} title={collapsed ? t("Expandir menu") : t("Recolher menu")} aria-label={collapsed ? t("Expandir menu") : t("Recolher menu")}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button>

      <aside className={"side" + (open ? " open" : "")}>
        <button className="side-close" onClick={() => setOpen(false)} aria-label={t("Fechar menu")}><X size={18} /></button>

        <nav className="side-nav">
          {groups.map((g, gi) => {
            // Sem seção → navegação primária, direta (sem cabeçalho, sem colapso).
            if (!g.section) return <div className="navgroup" key={gi}>{g.items.map(renderItem)}</div>;
            // Com a sidebar recolhida (só ícones) o colapso de seção não faz sentido: mostra tudo.
            const aberta = collapsed || (secOpen[g.section] ?? true);
            return (
              <div className={"navgroup navgroup--sec" + (aberta ? " open" : "")} key={gi}>
                <button type="button" className="navsec navsec--btn" aria-expanded={aberta} onClick={() => toggleSec(g.section!)}>
                  <span>{t(g.section)}</span>
                  <ChevronDown size={14} className="navsec-chev" />
                </button>
                {/* Itens sempre no DOM (para a seta animar); o CSS colapsa a altura e o
                    `visibility:hidden` tira os links fechados do tab do teclado. */}
                <div className="navsec-items"><div className="navsec-items-in">{g.items.map(renderItem)}</div></div>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* FLYOUT do sidebar recolhido: popup à direita do ícone com o rótulo ou as sub-abas. */}
      {collapsed && fly && (
        <div className="navfly" style={{ top: fly.top }} onMouseEnter={keepFly} onMouseLeave={closeFly}>
          {fly.item.children?.length ? (
            <>
              <div className="navfly-h">{t(fly.item.label)}</div>
              {flatLeaves(fly.item.children).map((c) => (
                c.to ? (
                  <NavLink key={c.label} to={c.to} end={c.end} onClick={() => setFly(null)} className={({ isActive }) => "navfly-item" + (isActive ? " on" : "")}>{t(c.label)}</NavLink>
                ) : (
                  <button key={c.label} className="navfly-item" onClick={() => { setFly(null); if (c.locked) setLockedMsg(true); else c.onClick?.(); }}>{t(c.label)}{c.locked ? " 🔒" : ""}</button>
                )
              ))}
            </>
          ) : fly.item.to ? (
            <NavLink to={fly.item.to} end={fly.item.end} onClick={() => setFly(null)} className={({ isActive }) => "navfly-item" + (isActive ? " on" : "")}>{t(fly.item.label)}</NavLink>
          ) : (
            <button className="navfly-item" onClick={() => { setFly(null); if (fly.item.locked) setLockedMsg(true); else fly.item.onClick?.(); }}>{t(fly.item.label)}{fly.item.locked ? " 🔒" : ""}</button>
          )}
        </div>
      )}

      <main className="main">
        {/* key = rota → o conteúdo remonta e reproduz a entrada suave a cada troca de tela. */}
        <div className="canvas page-enter" key={pathname}><Outlet /></div>
        {/* ── BARRA INFERIOR (só celular, só no app do cliente) — navegação no alcance do polegar ── */}
        {bottomNav && bottomNav.length > 0 && (
          <nav className="pbottom-nav" aria-label={t("Navegação")}>
            {bottomNav.map((n) => (
              <NavLink key={n.to} to={n.to!} end={n.end} className={({ isActive }) => "pbn-item" + (isActive ? " on" : "")}>
                <n.icon size={21} />
                <span className="pbn-l">{t(n.label)}</span>
              </NavLink>
            ))}
            <button type="button" className="pbn-item" onClick={() => setOpen(true)} aria-label={t("Abrir menu")}>
              <Menu size={21} />
              <span className="pbn-l">{t("Menu")}</span>
            </button>
          </nav>
        )}
      </main>

      {/* Aviso central ao clicar num MÓDULO bloqueado (não contratado) — pedido do Crasto. */}
      {lockedMsg && (
        <div className="lockmsg-ovl" onClick={() => setLockedMsg(false)}>
          <div className="lockmsg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <span className="lockmsg-ic"><Lock size={22} /></span>
            <h3>{t("Conteúdo indisponível no momento")}</h3>
            <p>{t("Para ativar o conteúdo, entre em contato com o seu representante comercial da Crasto.AI.")}</p>
            <button type="button" className="lockmsg-btn" onClick={() => setLockedMsg(false)}>{t("Entendi")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
