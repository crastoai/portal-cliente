import { NavLink, Outlet } from "react-router-dom";
import { LogOut, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import ThemeToggle from "../ui/ThemeToggle";
import { initials } from "../ui/ui";

export type NavItem = { to: string; end?: boolean; icon: LucideIcon; label: string; tag?: string };

function Mark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="#6E9CE8" strokeWidth="1.6" />
      <path d="M12 7l4.5 2.5v5L12 17l-4.5-2.5v-5L12 7z" fill="#6E9CE8" />
    </svg>
  );
}

export default function Shell({ nav, who, sub, logoTone }: { nav: NavItem[]; who: string; sub: string; logoTone?: string }) {
  const { profile, signOut } = useAuth();
  const ini = initials(profile?.full_name || profile?.email);
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="dot"><Mark /></span> CRASTO.AI</div>
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
