import { LayoutDashboard, Users, Grid3x3, FileText, Tag, Share2, Coins, TrendingUp, Plug } from "lucide-react";
import Shell, { type NavItem } from "./Shell";

const NAV: NavItem[] = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Visão geral", section: "Operação" },
  { to: "/admin/clientes", icon: Users, label: "Clientes", section: "Operação" },
  { to: "/admin/catalogo", icon: Grid3x3, label: "Catálogo de módulos", section: "Operação" },
  { to: "/admin/propostas", icon: FileText, label: "Gerador de propostas", section: "Operação" },
  { to: "/admin/servicos", icon: Tag, label: "Serviços & preços", section: "Operação" },
  { to: "/admin/conectores", icon: Share2, label: "Agentes indicadores", section: "Financeiro & Parceiros" },
  { to: "/admin/custos", icon: Coins, label: "Custos & Despesas", tag: "🔒", section: "Financeiro & Parceiros" },
  { to: "/admin/receita", icon: TrendingUp, label: "Receita & churn", section: "Financeiro & Parceiros" },
  { to: "/admin/integracoes", icon: Plug, label: "Integrações", section: "Financeiro & Parceiros" },
];

export default function AdminShell() {
  return <Shell nav={NAV} who="Crasto.AI · Admin" sub="Super-admin (RLS)" logoTone="linear-gradient(145deg,#010E26,#0a2350)" />;
}
