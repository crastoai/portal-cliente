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

// WhatsApp (Evolution API) — gerenciador de instâncias do Portal (admin-only, proxy no servidor).
export const whatsapp = {
  instances: async (): Promise<any> => api.get(`/api/automation/whatsapp/instances`),
  create: async (name: string): Promise<any> => api.post(`/api/automation/whatsapp/instances`, { name }),
  connect: async (name: string): Promise<any> => api.get(`/api/automation/whatsapp/instances/${encodeURIComponent(name)}/connect`),
  state: async (name: string): Promise<any> => api.get(`/api/automation/whatsapp/instances/${encodeURIComponent(name)}/state`),
  remove: async (name: string): Promise<any> => api.del(`/api/automation/whatsapp/instances/${encodeURIComponent(name)}`),
};

// Motor de automações (B3+B4): regras configuráveis + agendamentos por empresa.
export const rules = {
  list: async (): Promise<any> => api.get(`/api/automation/rules`),
  save: async (p: Record<string, any>): Promise<any> => api.post(`/api/automation/rules`, p),
  runNow: async (): Promise<any> => api.post(`/api/automation/run-now`, {}),
};
export const reminders = {
  byOrg: async (org: string): Promise<any> => api.get(`/api/automation/reminders/${encodeURIComponent(org)}`),
  create: async (p: Record<string, any>): Promise<any> => api.post(`/api/automation/reminders`, p),
  cancel: async (id: string): Promise<any> => api.post(`/api/automation/reminders/${encodeURIComponent(id)}/cancel`, {}),
};

// Webhook de transcrições (D5) — Google Meet em tempo real.
export const meetWebhook = { info: async (): Promise<any> => api.get(`/api/automation/meet-webhook/info`) };

export const automation = { integrations, whatsapp, rules, reminders, meetWebhook };
