import { LayoutDashboard, Users, Grid3x3, FileText, Tag, Share2, Coins, TrendingUp, Plug } from "lucide-react";
import Shell, { type NavItem } from "./Shell";

const NAV: NavItem[] = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Visão geral" },
  { to: "/admin/clientes", icon: Users, label: "Clientes" },
  { to: "/admin/catalogo", icon: Grid3x3, label: "Catálogo de módulos" },
  { to: "/admin/propostas", icon: FileText, label: "Gerador de propostas" },
  { to: "/admin/servicos", icon: Tag, label: "Serviços & preços" },
  { to: "/admin/conectores", icon: Share2, label: "Agentes conectores" },
  { to: "/admin/custos", icon: Coins, label: "Custos & Despesas", tag: "🔒" },
  { to: "/admin/receita", icon: TrendingUp, label: "Receita & churn" },
  { to: "/admin/integracoes", icon: Plug, label: "Integrações" },
];

export default function AdminShell() {
  return <Shell nav={NAV} who="Crasto.AI · Admin" sub="Super-admin (RLS)" logoTone="linear-gradient(145deg,#010E26,#0a2350)" />;
}
