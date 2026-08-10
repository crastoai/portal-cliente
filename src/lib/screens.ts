// Catálogo canônico das telas do PORTAL DO CLIENTE — fonte única para:
// (1) o modal "Editar Colaborador" (aba Permissões, árvore categorizada) e
// (2) a filtragem do menu do cliente (ClientShell).
// A permissão é por-tela: o dono vê todas; o membro vê só as telas liberadas.
//
// TAXONOMIA (decisão #2 do Crasto — reconfirmada 2026-08-09): telas REAIS do Portal AGRUPADAS.
// NÃO copiamos as categorias do hub antigo (CEO Cockpit/Vendas/Compras são de outro produto e
// ficariam vazias). As SUBTELAS do WhatsApp CRM e os MÓDULOS contratados são grupos à parte,
// montados no modal a partir das suas próprias fontes (wacrm crm-screens + client_modules).
export type ClientScreen = { key: string; to: string; label: string; category: string; order: number };

// Categorias das telas do Portal, na ordem do menu. (O `key` aqui é slug de categoria — namespace
// diferente das keys de tela; a sobreposição textual com "financeiro"/"solucoes" é só cosmética.)
export const SCREEN_CATEGORIES: { key: string; label: string }[] = [
  { key: "cockpit", label: "Cockpit" },
  { key: "solucoes", label: "Soluções & Implantação" },
  { key: "financeiro", label: "Financeiro" },
  { key: "acessos", label: "Gestão de Acessos" },
  { key: "conta", label: "Conta" },
];

export const CLIENT_SCREENS: ClientScreen[] = [
  { key: "inicio",        to: "/app",               label: "Cockpit",              category: "cockpit",    order: 1 },
  { key: "modulos",       to: "/app/modulos",       label: "Minhas Soluções",      category: "solucoes",   order: 2 },
  { key: "implementacao", to: "/app/implementacao", label: "Minha Implementação",  category: "solucoes",   order: 3 },
  { key: "solucoes",      to: "/app/solucoes",      label: "Catálogo de soluções", category: "solucoes",   order: 4 },
  { key: "financeiro",    to: "/app/financeiro",    label: "Financeiro",           category: "financeiro", order: 5 },
  { key: "usuarios",      to: "/app/usuarios",      label: "Gestão de Acessos",    category: "acessos",    order: 6 },
  { key: "perfil",        to: "/app/perfil",        label: "Dados cadastrais",     category: "conta",      order: 7 },
  { key: "suporte",       to: "/app/suporte",       label: "Suporte & Ajuda",      category: "conta",      order: 8 },
];

export const ALL_SCREEN_KEYS = CLIENT_SCREENS.map((s) => s.key);
// Tela BASE = sempre visível (garante que o membro nunca fica sem página). É "Dados cadastrais"
// (a conta do próprio membro, sem dado financeiro) — NÃO o Início. Assim o dono PODE bloquear o
// Início para um membro (o Início tem financeiro/negócios do dono) sem deixar o membro sem chão.
export const BASE_SCREEN = "perfil";
export const screenLabel = (key: string) => CLIENT_SCREENS.find((s) => s.key === key)?.label ?? key;

// Telas do Portal agrupadas por categoria (ordem do menu, sem categoria vazia). Usado pela
// árvore da aba Permissões: cada grupo ganha "Selecionar todos" + contador marcadas/total.
export const SCREENS_BY_CATEGORY: { key: string; label: string; screens: ClientScreen[] }[] =
  SCREEN_CATEGORIES
    .map((cat) => ({ ...cat, screens: CLIENT_SCREENS.filter((s) => s.category === cat.key).sort((a, b) => a.order - b.order) }))
    .filter((g) => g.screens.length > 0);

/** Resolve as telas permitidas a partir do retorno de my_screens (['*'] = todas). */
export function allowedScreens(list: string[] | null | undefined): Set<string> {
  if (!list || list.includes("*")) return new Set(ALL_SCREEN_KEYS);
  return new Set([BASE_SCREEN, ...list]);
}

/** Primeira tela permitida (na ordem do menu) — para onde mandar quem cai numa tela bloqueada
 *  ou faz login sem acesso ao Início. Sempre resolve (a tela base garante ao menos uma). */
export function firstAllowedPath(allowed: Set<string>): string {
  const s = CLIENT_SCREENS.find((x) => allowed.has(x.key));
  return s ? s.to : "/app/perfil";
}
