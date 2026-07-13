// Catálogo canônico das telas do PORTAL DO CLIENTE — fonte única para:
// (1) o popup de permissões (Console) e (2) a filtragem do menu do cliente (ClientShell).
// A permissão é por-tela: o dono vê todas; o membro vê só as telas liberadas.
export type ClientScreen = { key: string; to: string; label: string };

export const CLIENT_SCREENS: ClientScreen[] = [
  { key: "inicio", to: "/app", label: "Início" },
  { key: "modulos", to: "/app/modulos", label: "Minhas Soluções" },
  { key: "implementacao", to: "/app/implementacao", label: "Minha Implementação" },
  { key: "solucoes", to: "/app/solucoes", label: "Soluções disponíveis" },
  { key: "financeiro", to: "/app/financeiro", label: "Financeiro" },
  { key: "usuarios", to: "/app/usuarios", label: "Usuários & Equipe" },
  { key: "perfil", to: "/app/perfil", label: "Dados cadastrais" },
  { key: "suporte", to: "/app/suporte", label: "Suporte & Ajuda" },
];

export const ALL_SCREEN_KEYS = CLIENT_SCREENS.map((s) => s.key);
// Início é sempre visível (base) — o membro nunca fica sem página inicial.
export const BASE_SCREEN = "inicio";
export const screenLabel = (key: string) => CLIENT_SCREENS.find((s) => s.key === key)?.label ?? key;

/** Resolve as telas permitidas a partir do retorno de my_screens (['*'] = todas). */
export function allowedScreens(list: string[] | null | undefined): Set<string> {
  if (!list || list.includes("*")) return new Set(ALL_SCREEN_KEYS);
  return new Set([BASE_SCREEN, ...list]);
}
