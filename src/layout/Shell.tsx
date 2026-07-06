import { NavLink, Outlet } from "react-router-dom";
import { LogOut, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import ThemeToggle from "../ui/ThemeToggle";
import { initials } from "../ui/ui";
import logoWhite from "../assets/logo-branca.svg";

export type NavItem = { to: string; end?: boolean; icon: LucideIcon; label: string; tag?: string; section?: string };

export default function Shell({ nav, who, sub, logoTone }: { nav: NavItem[]; who: string; sub: string; logoTone?: string }) {
  const { profile, signOut } = useAuth();
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
      <aside className="side">
        <div className="side-brand">
          <span className="side-mark" style={logoTone ? { background: logoTone } : undefined}>
            <img src={logoWhite} alt="" width={16} height={19} />
          </span>
          <div className="side-brand-txt">
            <div className="nm">Crasto.AI</div>
            <div className="sub">{sub}</div>
          </div>
        </div>

        <nav className="side-nav">
          {groups.map((g, gi) => (
            <div className="navgroup" key={gi}>
              {g.section && <div className="navsec">{g.section}</div>}
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => "navlink" + (isActive ? " on" : "")}>
                  <n.icon size={17} /> <span className="navlink-lbl">{n.label}</span>{n.tag && <span className="tag">{n.tag}</span>}
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
          <ThemeToggle />
          <button className="su-out" title="Sair" onClick={() => signOut()}><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="main">
        <div className="canvas"><Outlet /></div>
      </main>
    </div>
  );
}
