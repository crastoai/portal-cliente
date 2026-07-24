// Catálogo canônico das telas do PORTAL DO CLIENTE — fonte única para:
// (1) o popup de permissões (Console) e (2) a filtragem do menu do cliente (ClientShell).
// A permissão é por-tela: o dono vê todas; o membro vê só as telas liberadas.
export type ClientScreen = { key: string; to: string; label: string };

export const CLIENT_SCREENS: ClientScreen[] = [
  { key: "inicio", to: "/app", label: "Início" },
  { key: "modulos", to: "/app/modulos", label: "Minhas Soluções" },
  { key: "implementacao", to: "/app/implementacao", label: "Minha Implementação" },
  { key: "solucoes", to: "/app/solucoes", label: "Catálogo de soluções" },
  { key: "financeiro", to: "/app/financeiro", label: "Financeiro" },
  { key: "usuarios", to: "/app/usuarios", label: "Usuários & Equipe" },
  { key: "perfil", to: "/app/perfil", label: "Dados cadastrais" },
  { key: "suporte", to: "/app/suporte", label: "Suporte & Ajuda" },
];

export const ALL_SCREEN_KEYS = CLIENT_SCREENS.map((s) => s.key);
// Tela BASE = sempre visível (garante que o membro nunca fica sem página). É "Dados cadastrais"
// (a conta do próprio membro, sem dado financeiro) — NÃO o Início. Assim o dono PODE bloquear o
// Início para um membro (o Início tem financeiro/negócios do dono) sem deixar o membro sem chão.
export const BASE_SCREEN = "perfil";
export const screenLabel = (key: string) => CLIENT_SCREENS.find((s) => s.key === key)?.label ?? key;

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
