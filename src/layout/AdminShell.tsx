import { LayoutDashboard, Users, Grid3x3, FileText, Tag, Share2, Coins, TrendingUp, Plug, LifeBuoy, Rocket, DollarSign, Cpu, Activity, BookOpen, ScrollText, Lock, ClipboardList, KeyRound, Blocks } from "lucide-react";
import Shell, { type NavItem } from "./Shell";
import JulieWidget from "../ui/JulieWidget";

const CONSOLE = "Console · IA 🔒";
const NAV: NavItem[] = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Visão geral", section: "Operação" },
  { to: "/admin/clientes", icon: Users, label: "Clientes", section: "Operação" },
  { to: "/admin/catalogo", icon: Grid3x3, label: "Catálogo de módulos", section: "Operação" },
  { to: "/admin/propostas", icon: FileText, label: "Gerador de propostas", section: "Operação" },
  { to: "/admin/servicos", icon: Tag, label: "Serviços & preços", section: "Operação" },
  { to: "/admin/implantacoes", icon: Rocket, label: "Solicitações de implantação", section: "Operação" },
  { to: "/admin/tickets", icon: LifeBuoy, label: "Chamados & Suporte", section: "Operação" },
  // Console · IA (admin-only) — camada operacional dos agentes (SPEC do Console)
  { to: "/admin/console/health", icon: Activity, label: "Health Check", section: CONSOLE },
  { to: "/admin/console/memorias", icon: BookOpen, label: "Memórias & Conhecimento", section: CONSOLE },
  { to: "/admin/console/regras", icon: ScrollText, label: "Regras Globais", section: CONSOLE },
  { to: "/admin/console/permissoes", icon: Lock, label: "Permissões & Acessos", section: CONSOLE },
  { to: "/admin/console/auditoria", icon: ClipboardList, label: "Auditoria & Logs", section: CONSOLE },
  { to: "/admin/integracoes", icon: KeyRound, label: "APIs & Chaves", section: CONSOLE },
  { to: "/admin/console/modelos", icon: Cpu, label: "Modelos LLM", section: CONSOLE },
  { to: "/admin/console/skills", icon: Blocks, label: "Catálogo de Skills", section: CONSOLE },
  { to: "/admin/financeiro", icon: DollarSign, label: "Financeiro", tag: "🔒", section: "Financeiro & Parceiros" },
  { to: "/admin/conectores", icon: Share2, label: "Agentes indicadores", section: "Financeiro & Parceiros" },
  { to: "/admin/custos", icon: Coins, label: "Custos & Despesas", tag: "🔒", section: "Financeiro & Parceiros" },
  { to: "/admin/receita", icon: TrendingUp, label: "Receita & churn", section: "Financeiro & Parceiros" },
  { to: "/admin/integracoes", icon: Plug, label: "Integrações", section: "Financeiro & Parceiros" },
];

export default function AdminShell() {
  return (
    <>
      <Shell nav={NAV} who="Crasto.AI · Admin" sub="Super-admin (RLS)" logoTone="linear-gradient(145deg,#010E26,#0a2350)" />
      {/* Julie — CFO de IA, flutuante em todo o admin */}
      <JulieWidget />
    </>
  );
}
