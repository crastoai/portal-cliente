import { LayoutDashboard, Users, Grid3x3, FileText, Tag, Share2, Coins, TrendingUp, Plug, LifeBuoy, Rocket, DollarSign, Cpu, Activity, BookOpen, ScrollText, ClipboardList, KeyRound, Blocks, Calculator } from "lucide-react";
import Shell, { type NavItem } from "./Shell";
import JulieWidget from "../ui/JulieWidget";

const CONSOLE = "Console · IA 🔒";
const NAV: NavItem[] = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "CEO Crasto.ai" },
  { to: "/admin/clientes", icon: Users, label: "Clientes", section: "Operação" },
  { to: "/admin/servicos", icon: Tag, label: "Catálogo de serviços", section: "Operação" },
  { to: "/admin/catalogo", icon: Grid3x3, label: "Catálogo de módulos", section: "Operação" },
  { to: "/admin/propostas", icon: FileText, label: "Gerador de propostas", section: "Operação" },
  { to: "/admin/implantacoes", icon: Rocket, label: "Solicitações de implantação", section: "Operação" },
  { to: "/admin/tickets", icon: LifeBuoy, label: "Chamados & Suporte", section: "Operação" },
  // Console · IA (admin-only) — camada operacional dos agentes (SPEC do Console)
  { to: "/admin/console/health", icon: Activity, label: "Health Check", section: CONSOLE },
  { to: "/admin/console/memorias", icon: BookOpen, label: "Memórias & Conhecimento", section: CONSOLE },
  { to: "/admin/console/regras", icon: ScrollText, label: "Regras Globais", section: CONSOLE },
  // "Permissões & Acessos" saiu do sidebar (pedido do Crasto): já é acessível pelo ícone de escudo
  // na lista de Clientes (por cliente). A rota /admin/console/permissoes segue viva.
  { to: "/admin/console/auditoria", icon: ClipboardList, label: "Auditoria & Logs", section: CONSOLE },
  { to: "/admin/integracoes", icon: KeyRound, label: "APIs & Chaves", section: CONSOLE },
  { to: "/admin/console/modelos", icon: Cpu, label: "Modelos LLM", section: CONSOLE },
  { to: "/admin/console/skills", icon: Blocks, label: "Catálogo de Skills", section: CONSOLE },
  // Financeiro = menu-árvore: clicar expande as áreas como TELAS individuais (rumo ao white-label).
  // O pai não abre tela própria; o 1º filho (Cockpit) é a visão geral de todas as áreas.
  {
    icon: DollarSign, label: "Financeiro", tag: "🔒", section: "Financeiro & Parceiros",
    to: "/admin/financeiro",
    children: [
      { to: "/admin/financeiro", end: true, label: "Cockpit" },
      { to: "/admin/financeiro/a-pagar", label: "A Pagar" },
      { to: "/admin/financeiro/a-receber", label: "A Receber" },
      { to: "/admin/financeiro/cobranca", label: "Cobrança" },
      { to: "/admin/financeiro/conciliacao", label: "Conciliação" },
      { to: "/admin/financeiro/tesouraria", label: "Tesouraria" },
    ],
  },
  { to: "/admin/contabilidade", icon: Calculator, label: "Contabilidade", tag: "🔒", section: "Financeiro & Parceiros" },
  { to: "/admin/conectores", icon: Share2, label: "Agentes indicadores", section: "Financeiro & Parceiros" },
  { to: "/admin/custos", icon: Coins, label: "Custos & Despesas", tag: "🔒", section: "Financeiro & Parceiros" },
  { to: "/admin/receita", icon: TrendingUp, label: "Receita & churn", section: "Financeiro & Parceiros" },
  { to: "/admin/integracoes", icon: Plug, label: "Integrações", section: "Financeiro & Parceiros" },
];

// Os itens de módulo (tudo que tem `section`) ganham a COR de módulo — azul, negrito — igual à
// visão do cliente (`.navlink--mod`). A home ("CEO Crasto.ai", sem seção) fica neutra, como o
// "Início" do cliente. (1º passo rumo à estrutura em árvore que o Crasto vai incrementar depois.)
const NAV_MOD: NavItem[] = NAV.map((n) => (n.section ? { ...n, mod: true } : n));

export default function AdminShell() {
  return (
    <>
      <Shell nav={NAV_MOD} who="Crasto.AI · Admin" sub="Super-admin (RLS)" logoTone="linear-gradient(145deg,#010E26,#0a2350)" />
      {/* Julie — CFO de IA, flutuante em todo o admin */}
      <JulieWidget />
    </>
  );
}
