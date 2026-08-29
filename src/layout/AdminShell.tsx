import { LayoutDashboard, Users, Grid3x3, FileText, Tag, Share2, TrendingUp, Plug, LifeBuoy, Rocket, DollarSign, Cpu, Activity, BookOpen, ScrollText, ClipboardList, KeyRound, Blocks, Calculator } from "lucide-react";
import Shell, { type NavItem } from "./Shell";
import JulieWidget from "../ui/JulieWidget";

// Sidebar do ADMIN (Crasto) — reestruturado (aprovado pelo Crasto 2026-08-29). Reorg de MENU só;
// nenhuma rota/dado se move; o Financeiro é INTOCÁVEL. Três blocos:
//  1) CEO Crasto.ai (árvore) — a empresa como nó pai; 1ª tela = Cockpit (= a home /admin de hoje).
//  2) Tech Panel (era "Console · IA") — camada técnica dos agentes + Integrações (visíveis por cliente).
//  3) MÓDULOS — o que a Crasto oferece aos clientes e USA na própria org: Vendas (WaCRM+Julie) ·
//     Financeiro (intocável) · Contabilidade. Receita & churn e Agentes indicadores entram em Vendas.
//     Custos & Despesas saiu (já embarcado no Financeiro).
const NAV: NavItem[] = [
  {
    icon: LayoutDashboard, label: "CEO Crasto.ai",
    children: [
      { to: "/admin", end: true, label: "Cockpit", icon: LayoutDashboard },
      { to: "/admin/clientes", label: "Clientes", icon: Users },
      { to: "/admin/servicos", label: "Catálogo de Serviços", icon: Tag },
      { to: "/admin/catalogo", label: "Catálogo de Módulos", icon: Grid3x3 },
      { to: "/admin/propostas", label: "Gerador de Propostas", icon: FileText },
      { to: "/admin/implantacoes", label: "Solicitações de Implantação", icon: Rocket },
      { to: "/admin/tickets", label: "Chamados & Suporte", icon: LifeBuoy },
    ],
  },
  {
    icon: Cpu, label: "Tech Panel",
    children: [
      { to: "/admin/console/health", label: "Health Check", icon: Activity },
      { to: "/admin/console/memorias", label: "Memórias & Conhecimento", icon: BookOpen },
      { to: "/admin/console/regras", label: "Regras Globais", icon: ScrollText },
      { to: "/admin/console/auditoria", label: "Auditoria & Logs", icon: ClipboardList },
      { to: "/admin/integracoes", label: "APIs & Chaves", icon: KeyRound },
      { to: "/admin/console/modelos", label: "Modelos LLM", icon: Cpu },
      { to: "/admin/console/skills", label: "Catálogo de Skills", icon: Blocks },
      { to: "/admin/integracoes", label: "Integrações", icon: Plug },
    ],
  },
  // MÓDULOS — Vendas (o WaCRM da Crasto na org dela; a Julie é o agente de IA, não item de menu).
  {
    icon: TrendingUp, label: "Vendas", section: "Módulos", to: "/admin/crm",
    children: [
      { to: "/admin/crm", end: true, label: "Cockpit", icon: LayoutDashboard },
      { to: "/admin/conectores", label: "Agentes indicadores", icon: Share2 },
      { to: "/admin/receita", label: "Receita & churn", icon: TrendingUp },
    ],
  },
  // Financeiro — INTOCÁVEL (mesma árvore de sempre).
  {
    icon: DollarSign, label: "Financeiro", section: "Módulos", to: "/admin/financeiro",
    children: [
      { to: "/admin/financeiro", end: true, label: "Cockpit" },
      { to: "/admin/financeiro/a-pagar", label: "A Pagar" },
      { to: "/admin/financeiro/a-receber", label: "A Receber" },
      { to: "/admin/financeiro/cobranca", label: "Cobrança" },
      { to: "/admin/financeiro/conciliacao", label: "Conciliação" },
      { to: "/admin/financeiro/tesouraria", label: "Tesouraria" },
    ],
  },
  { icon: Calculator, label: "Contabilidade", section: "Módulos", to: "/admin/contabilidade" },
];

// Itens de módulo (com `section`) ganham a COR de módulo (azul, negrito). As árvores de topo
// (CEO Crasto.ai, Tech Panel) já ficam azuis sozinhas (nó-pai de árvore recebe `navlink--mod`).
const NAV_MOD: NavItem[] = NAV.map((n) => (n.section ? { ...n, mod: true } : n));

export default function AdminShell() {
  return (
    <>
      <Shell nav={NAV_MOD} who="Crasto.AI · Admin" sub="Super-admin (RLS)" logoTone="linear-gradient(145deg,#010E26,#0a2350)" />
      {/* Julie — CFO/recepção de IA, flutuante em todo o admin */}
      <JulieWidget />
    </>
  );
}
