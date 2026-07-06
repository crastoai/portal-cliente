import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import ThemeToggle from "../ui/ThemeToggle";
import LangSwitcher from "../ui/LangSwitcher";
import { useT } from "../lib/i18n";
import { initials } from "../ui/ui";

// Monograma da marca, sem caixa — navy no tema claro, branco no escuro (servidos de /public).
function Brandmark() {
  return (
    <span className="side-mark">
      <img className="mk-light" src="/crasto-monogram-navy.png" alt="Crasto.AI" />
      <img className="mk-dark" src="/crasto-monogram-white.png" alt="" />
    </span>
  );
}

export type NavItem = { to: string; end?: boolean; icon: LucideIcon; label: string; tag?: string; section?: string };

export default function Shell({ nav, who, sub, logoTone }: { nav: NavItem[]; who: string; sub: string; logoTone?: string }) {
  const { profile, signOut } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ini = initials(profile?.full_name || profile?.email);

  // agrupa a navegação por seção, preservando a ordem (padrão do DS de sistema)
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const n of nav) {
    const last = groups[groups.length - 1];
    if (!last || last.section !== n.section) groups.push({ section: n.section, items: [n] });
    else last.items.push(n);
  }

  return (
    <div className="shell">
      {/* barra mobile (só < 900px) */}
      <div className="mobilebar">
        <button className="mb-burger" onClick={() => setOpen(true)} aria-label={t("Abrir menu")}><Menu size={20} /></button>
        <span className="mb-brand">
          <Brandmark />
          Crasto.AI
        </span>
        <LangSwitcher compact />
        <ThemeToggle />
      </div>

      {open && <div className="side-overlay" onClick={() => setOpen(false)} />}

      <aside className={"side" + (open ? " open" : "")}>
        <button className="side-close" onClick={() => setOpen(false)} aria-label={t("Fechar menu")}><X size={18} /></button>

        <div className="side-brand">
          <Brandmark />
          <div className="side-brand-txt">
            <div className="nm">Crasto.AI</div>
            <div className="sub">{t(sub)}</div>
          </div>
        </div>

        <nav className="side-nav">
          {groups.map((g, gi) => (
            <div className="navgroup" key={gi}>
              {g.section && <div className="navsec">{t(g.section)}</div>}
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => "navlink" + (isActive ? " on" : "")}>
                  <n.icon size={17} /> <span className="navlink-lbl">{t(n.label)}</span>{n.tag && <span className="tag">{n.tag}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-user">
          <span className="su-av" style={logoTone ? { background: logoTone } : undefined}>{ini}</span>
          <div className="su-meta">
            <div className="su-nm">{who}</div>
            <div className="su-em">{profile?.email}</div>
          </div>
          <LangSwitcher />
          <ThemeToggle />
          <button className="su-out" title={t("Sair")} onClick={() => signOut()}><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="main">
        <div className="canvas"><Outlet /></div>
      </main>
    </div>
  );
}
