import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { LogOut, Menu, X, Camera, Lock, ChevronLeft, ChevronRight, ChevronDown, Bell, Rocket, Sparkles, AlertTriangle, DollarSign, MessageCircle, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { services } from "../services";
import ThemeToggle from "../ui/ThemeToggle";
import LangSwitcher from "../ui/LangSwitcher";
import { useT } from "../lib/i18n";
import { initials } from "../ui/ui";

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

// Wordmark completo (logo Crasto.AI) — navy no claro, branco no escuro.
function Wordmark() {
  return (
    <span className="side-wordmark">
      <img className="mk-light" src="/crasto-wordmark-navy.png" alt="Crasto.AI" />
      <img className="mk-dark" src="/crasto-wordmark-white.png" alt="Crasto.AI" />
    </span>
  );
}

// `to` = rota interna (NavLink). `onClick` sem `to` = ação (abrir módulo externo/SSO).
// `locked` = módulo não contratado (cadeado + upsell) — o clique chama `onClick`.
export type NavItem = { to?: string; end?: boolean; icon: LucideIcon; label: string; tag?: string; section?: string; locked?: boolean; onClick?: () => void };

export default function Shell({ nav, who, sub, logoTone, bottomNav }: { nav: NavItem[]; who: string; sub: string; logoTone?: string; bottomNav?: NavItem[] }) {
  const { profile, signOut, refreshProfile } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // Recolher/expandir a sidebar (seta). Auto-recolhe ao abrir um módulo embarcado (ex.: CRM),
  // dando a tela cheia; ao sair do CRM, restaura a preferência manual do usuário.
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem("portal.collapsed") === "1");
  useEffect(() => { localStorage.setItem("portal.collapsed", collapsed ? "1" : "0"); }, [collapsed]);
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

  const renderItem = (n: NavItem) => {
    const inner = <><n.icon size={17} /> <span className="navlink-lbl">{t(n.label)}</span>
      {n.locked ? <Lock size={13} className="navlink-lock" /> : n.tag ? <span className="tag">{n.tag}</span> : null}</>;
    if (n.locked) return (
      <button key={n.label} type="button" className="navlink navlink--locked" title={t("Módulo não contratado — fale com a Crasto.AI para liberar")} onClick={() => { setOpen(false); n.onClick?.(); }}>{inner}</button>
    );
    if (!n.to && n.onClick) return (
      <button key={n.label} type="button" className="navlink" onClick={() => { setOpen(false); n.onClick?.(); }}>{inner}</button>
    );
    return (
      <NavLink key={n.to} to={n.to!} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => {
        const match = isActive || (n.to === "/admin/clientes" && pathname.startsWith("/admin/cliente/"));
        return "navlink" + (match ? " on" : "");
      }}>{inner}</NavLink>
    );
  };

  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    const load = () => services.support.notifications.list().then((r: any) => { if (alive) { setNotifs(r?.items || []); setNotifCount(r?.count || 0); } }).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [profile?.id]);
  function toggleBell() {
    const opening = !bellOpen;
    setBellOpen(opening);
    if (opening && notifCount > 0) { setNotifCount(0); services.support.notifications.markSeen(); }
  }

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
      <button type="button" className="tb-av su-av--btn" title={t("Trocar foto de perfil")} disabled={avBusy} onClick={() => avInput.current?.click()} style={!profile?.avatar_url && logoTone ? { background: logoTone } : undefined}>
        {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : ini}
        <span className="su-av__cam"><Camera size={12} /></span>
      </button>
      <input ref={avInput} type="file" accept="image/*" hidden onChange={onAvatar} />
      <button type="button" className="tb-user" title={t("Ver meus dados")} onClick={() => navigate(profile?.role === "crasto_admin" ? "/admin/perfil" : "/app/perfil")}>
        <span className="su-nm">{who}</span>
        <span className="su-em">{profile?.email}</span>
      </button>
      <button className="su-out" title={t("Sair")} onClick={() => signOut()}><LogOut size={16} /></button>
    </>
  );

  return (
    <div className={"shell" + (collapsed ? " collapsed" : "")}>
      {open && <div className="side-overlay" onClick={() => setOpen(false)} />}

      <aside className={"side" + (open ? " open" : "")}>
        <button className="side-close" onClick={() => setOpen(false)} aria-label={t("Fechar menu")}><X size={18} /></button>

        <div className="side-brand side-brand--logo">
          <Wordmark />
          <div className="side-brand-sub">{t(sub)}</div>
        </div>

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

      {/* Seta de recolher/expandir CRAVADA na borda do sidebar (handle), sempre visível.
          Fica fixa na linha da sidebar e acompanha a largura ao recolher. No mobile some
          (lá o menu é drawer pelo hambúrguer). */}
      <button className="side-collapse" onClick={() => setCollapsed((c) => !c)} title={collapsed ? t("Expandir menu") : t("Recolher menu")} aria-label={collapsed ? t("Expandir menu") : t("Recolher menu")}>
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      <main className="main">
        {/* Barra superior: navegação fica na sidebar; identidade + sistema (idioma, tema,
            usuário) no canto SUPERIOR DIREITO — padrão internacional (Gmail/HubSpot/Salesforce).
            No celular, o hambúrguer abre o drawer e a marca aparece à esquerda. */}
        <header className="topbar">
          <button className="tb-burger" onClick={() => setOpen(true)} aria-label={t("Abrir menu")}><Menu size={20} /></button>
          <span className="tb-brand"><Wordmark /></span>
          <div className="tb-right">
            <LangSwitcher />
            <ThemeToggle />
            {userCluster}
          </div>
        </header>
        <div className="canvas"><Outlet /></div>
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
    </div>
  );
}
