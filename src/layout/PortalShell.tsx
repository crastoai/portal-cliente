import { NavLink, Outlet } from "react-router-dom";
import { Home, LayoutGrid, Activity, KeyRound, BarChart3, Wallet, LifeBuoy, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/app", end: true, icon: Home, label: "Início" },
  { to: "/app/modulos", icon: LayoutGrid, label: "Meus Módulos" },
  { to: "/app/implementacao", icon: Activity, label: "Minha Implementação" },
  { to: "/app/credenciais", icon: KeyRound, label: "Credenciais" },
  { to: "/app/resultados", icon: BarChart3, label: "Resultados" },
  { to: "/app/financeiro", icon: Wallet, label: "Financeiro" },
  { to: "/app/suporte", icon: LifeBuoy, label: "Suporte & Ajuda" },
];

function Mark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="#6E9CE8" strokeWidth="1.6" />
      <path d="M12 7l4.5 2.5v5L12 17l-4.5-2.5v-5L12 7z" fill="#6E9CE8" />
    </svg>
  );
}

export default function PortalShell() {
  const { profile, signOut } = useAuth();
  const initials = (profile?.full_name || profile?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="dot"><Mark /></span> CRASTO.AI</div>
        <div className="spacer" />
        <div className="who">
          <span>{profile?.email}</span>
          <span className="avatar">{initials}</span>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => signOut()}>
            <span className="crasto-btn__icon"><LogOut size={15} /></span>
            <span className="crasto-btn__label">Sair</span>
          </button>
        </div>
      </header>

      <aside className="side">
        <div className="who">
          <div className="co">
            <div className="logo">{initials}</div>
            <div>
              <div className="nm">{profile?.full_name || "Cliente"}</div>
              <div className="pl">Portal do Cliente</div>
            </div>
          </div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => "navlink" + (isActive ? " on" : "")}>
            <n.icon size={17} /> {n.label}
          </NavLink>
        ))}
      </aside>

      <main className="main"><Outlet /></main>
    </div>
  );
}
