import { NavLink, Outlet } from "react-router-dom";
import { LogOut, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import ThemeToggle from "../ui/ThemeToggle";
import { initials } from "../ui/ui";
import logoWhite from "../assets/logo-branca.svg";

export type NavItem = { to: string; end?: boolean; icon: LucideIcon; label: string; tag?: string };

export default function Shell({ nav, who, sub, logoTone }: { nav: NavItem[]; who: string; sub: string; logoTone?: string }) {
  const { profile, signOut } = useAuth();
  const ini = initials(profile?.full_name || profile?.email);
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="dot"><img src={logoWhite} alt="" width={15} height={18} /></span> CRASTO.AI</div>
        <div className="spacer" />
        <div className="who">
          <span className="hide-sm">{profile?.email}</span>
          <ThemeToggle />
          <span className="avatar" style={logoTone ? { background: logoTone } : undefined}>{ini}</span>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => signOut()}>
            <span className="crasto-btn__icon"><LogOut size={15} /></span>
            <span className="crasto-btn__label">Sair</span>
          </button>
        </div>
      </header>
      <aside className="side">
        <div className="who">
          <div className="co">
            <div className="logo" style={logoTone ? { background: logoTone } : undefined}>{ini}</div>
            <div><div className="nm">{who}</div><div className="pl">{sub}</div></div>
          </div>
        </div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => "navlink" + (isActive ? " on" : "")}>
            <n.icon size={17} /> {n.label}{n.tag && <span className="tag">{n.tag}</span>}
          </NavLink>
        ))}
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
