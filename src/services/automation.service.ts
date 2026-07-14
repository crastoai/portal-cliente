// ============================================================================
// Bounded context: AUTOMATION — integrações/chaves (admin-only).
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// Endpoints protegidos por AdminGuard no servidor; segredos vão pro Vault via RPC.
// ============================================================================
import { api } from "../lib/api";
import type { Integration } from "./core/types";

export const integrations = {
  list: async () => api.get<Integration[]>(`/api/automation/integrations`),
  /** Status + se há chave salva (sem revelar o segredo). */
  status: async () => api.get(`/api/automation/integrations/status`) as unknown as Promise<Record<string, { status: string; has_secret: boolean; from_addr: string | null }>>,
  /** Salva a chave/segredo de um provedor no cofre (só admin). */
  configure: async (key: string, secret: string, from: string, status: string) =>
    api.post(`/api/automation/integrations/configure`, { key, secret, from, status }),
  /** Config atual (multi-campo): meta não-secreta + quais segredos estão salvos (sem valores). */
  config: async (key: string): Promise<any> => api.get(`/api/automation/integrations/${encodeURIComponent(key)}/config`),
  /** Grava config multi-campo (segredos vazios não sobrescrevem). */
  saveConfig: async (p: Record<string, any>) => api.post(`/api/automation/integrations/save`, p),
};

export const automation = { integrations };
