import { Home, LayoutGrid, Activity, Sparkles, KeyRound, BarChart3, Wallet, Users, LifeBuoy } from "lucide-react";
import { useAuth } from "../lib/auth";
import Shell, { type NavItem } from "./Shell";

const NAV: NavItem[] = [
  { to: "/app", end: true, icon: Home, label: "Início" },
  { to: "/app/modulos", icon: LayoutGrid, label: "Meus Módulos" },
  { to: "/app/implementacao", icon: Activity, label: "Minha Implementação" },
  { to: "/app/solucoes", icon: Sparkles, label: "Soluções disponíveis" },
  { to: "/app/credenciais", icon: KeyRound, label: "Credenciais" },
  { to: "/app/resultados", icon: BarChart3, label: "Resultados" },
  { to: "/app/financeiro", icon: Wallet, label: "Financeiro" },
  { to: "/app/usuarios", icon: Users, label: "Usuários & Equipe" },
  { to: "/app/suporte", icon: LifeBuoy, label: "Suporte & Ajuda" },
];

export default function ClientShell() {
  const { profile } = useAuth();
  return <Shell nav={NAV} who={profile?.full_name || "Cliente"} sub="Portal do Cliente" logoTone="linear-gradient(145deg,#1F8A5B,#0d5c3a)" />;
}
