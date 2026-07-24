import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { LogOut, Menu, X, Camera, Lock, ChevronLeft, ChevronRight, ChevronDown, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { services } from "../services";
import ThemeToggle from "../ui/ThemeToggle";
import LangSwitcher from "../ui/LangSwitcher";
import { useT } from "../lib/i18n";
import { initials } from "../ui/ui";

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

export default function Shell({ nav, who, sub, logoTone }: { nav: NavItem[]; who: string; sub: string; logoTone?: string }) {
  const { profile, signOut, refreshProfile } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // Recolher/expandir a sidebar (seta). Auto-recolhe ao abrir um módulo embarcado (ex.: CRM),
  // dando a tela cheia; o usuário reabre pela seta.
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem("portal.collapsed") === "1");
  useEffect(() => { localStorage.setItem("portal.collapsed", collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => { if (pathname === "/app/crm") setCollapsed(true); }, [pathname]);
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

  const userCluster = (
    <>
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

      <main className="main">
        {/* Barra superior: navegação fica na sidebar; identidade + sistema (idioma, tema,
            usuário) no canto SUPERIOR DIREITO — padrão internacional (Gmail/HubSpot/Salesforce).
            No celular, o hambúrguer abre o drawer e a marca aparece à esquerda. */}
        <header className="topbar">
          <button className="tb-burger" onClick={() => setOpen(true)} aria-label={t("Abrir menu")}><Menu size={20} /></button>
          <button className="tb-collapse" onClick={() => setCollapsed((c) => !c)} title={collapsed ? t("Expandir menu") : t("Recolher menu")} aria-label={t("Recolher menu")}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>
          <span className="tb-brand"><Wordmark /></span>
          <div className="tb-right">
            <LangSwitcher />
            <ThemeToggle />
            {userCluster}
          </div>
        </header>
        <div className="canvas"><Outlet /></div>
      </main>
    </div>
  );
}
