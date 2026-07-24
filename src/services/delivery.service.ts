// ============================================================================
// Bounded context: DELIVERY — módulos do cliente, implementação, saúde (farol),
// tarefas do projeto, credenciais de módulo e serviços do cliente.
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// As leituras "mine" são escopadas pela RLS no servidor (asUser).
// ============================================================================
import { api } from "../lib/api";
import type { ClientModule, Implementation, SystemHealth, ProjectTask, ModuleCredential } from "./core/types";

export const clientModules = {
  listByOrg: async (orgId: string) => api.get<ClientModule[]>(`/api/delivery/client-modules?org=${orgId}`),
  listAll: async () => api.get<ClientModule[]>(`/api/delivery/client-modules/all`),
  listMine: async () => api.get<ClientModule[]>(`/api/delivery/client-modules/mine`),
  attach: async (orgId: string, moduleId: string) => api.post(`/api/delivery/client-modules`, { organization_id: orgId, vdi_module_id: moduleId }),
  detach: async (orgId: string, moduleId: string) => api.del(`/api/delivery/client-modules/by/${orgId}/${moduleId}`),
  addInstance: async (orgId: string, moduleId: string, label?: string) => api.post(`/api/delivery/client-modules/instance`, { organization_id: orgId, vdi_module_id: moduleId, label: label || null }),
  removeInstance: async (id: string) => api.del(`/api/delivery/client-modules/${id}`),
  updateRollout: async (id: string, patch: Record<string, any>) => api.patch(`/api/delivery/client-modules/${id}/rollout`, patch),
};

export const implementations = {
  getByOrg: async (orgId: string) => api.get<Implementation | null>(`/api/delivery/implementation?org=${orgId}`),
  getMine: async () => api.get<Implementation | null>(`/api/delivery/implementation/mine`),
  listBrief: async () => api.get<(Implementation & { organization_id: string })[]>(`/api/delivery/implementations/brief`),
  upsert: async (orgId: string, patch: Record<string, any>) => api.post(`/api/delivery/implementation/${orgId}`, patch),
};

export const systemHealth = {
  getByOrg: async (orgId: string) => api.get<SystemHealth | null>(`/api/delivery/health?org=${orgId}`),
  getMine: async () => api.get<SystemHealth | null>(`/api/delivery/health/mine`),
  listBrief: async () => api.get<SystemHealth[]>(`/api/delivery/health/brief`),
  upsert: async (orgId: string, patch: Record<string, any>) => api.post(`/api/delivery/health/${orgId}`, patch),
};

export const projectTasks = {
  listMine: async () => api.get<ProjectTask[]>(`/api/delivery/tasks/mine`),
  listByOrg: async (orgId: string) => api.get<ProjectTask[]>(`/api/delivery/tasks?org=${orgId}`),
  add: async (payload: Record<string, any>) => api.post(`/api/delivery/tasks`, payload),
  update: async (id: string, patch: Record<string, any>) => api.patch(`/api/delivery/tasks/${id}`, patch),
  remove: async (id: string) => api.del(`/api/delivery/tasks/${id}`),
};

export const moduleCredentials = {
  listMine: async () => api.get<ModuleCredential[]>(`/api/delivery/credentials/mine`),
  listByOrg: async (orgId: string) => api.get<ModuleCredential[]>(`/api/delivery/credentials?org=${orgId}`),
  /** Admin: define/atualiza (idempotente) o acesso de UMA instância — senha cifrada via RPC no servidor. */
  set: async (p: { clientModuleId: string; label: string; login: string; secret: string; sso: boolean; url?: string }) =>
    api.post(`/api/delivery/credentials/set`, p),
  remove: async (id: string) => api.del(`/api/delivery/credentials/${id}`),
};

export const clientServices = {
  listByOrg: async (orgId: string) => api.get<any[]>(`/api/delivery/services?org=${orgId}`),
  listMine: async () => api.get<any[]>(`/api/delivery/services/mine`),
  attach: async (orgId: string, svc: { id: string; name?: string; description?: string | null; category?: string | null; unit?: string | null }) =>
    api.post(`/api/delivery/services`, { organization_id: orgId, service_id: svc.id, service_name: svc.name ?? null, service_description: svc.description ?? null, service_category: svc.category ?? null, service_unit: svc.unit ?? null }),
  detach: async (id: string) => api.del(`/api/delivery/services/${id}`),
  setStatus: async (id: string, status: string) => api.patch(`/api/delivery/services/${id}/status`, { status }),
};

// Permissão módulo × usuário (Fase 2): o dono libera QUAIS módulos um membro vê.
// Lista vazia = vê todos (sem restrição). Middle-end valida dono/admin.
export const userModules = {
  list: async (userId: string) => api.get<string[]>(`/api/delivery/user-modules?user=${encodeURIComponent(userId)}`),
  set: async (userId: string, vdiModuleIds: string[]) => api.post(`/api/delivery/user-modules`, { user_id: userId, vdi_module_ids: vdiModuleIds }),
};

// Telas do Portal por usuário — caminho do DONO (o do admin é RPC e continua existindo).
// Lista vazia = sem restrição = vê tudo. O middle-end valida dono-da-mesma-org.
export const userScreens = {
  list: async (userId: string) => api.get<string[]>(`/api/delivery/user-screens?user=${encodeURIComponent(userId)}`),
  set: async (userId: string, screens: string[]) => api.post(`/api/delivery/user-screens`, { user_id: userId, screens }),
};

export const selfService = {
  getMine: async () => api.get<any>(`/api/delivery/self-service/mine`),
};

// Métrica de uso por usuário × módulo. Quem abre o módulo é o Portal, então é o Portal que
// mede — vale mesmo enquanto o destino (Lovable) usa credencial compartilhada da empresa e
// não consegue distinguir as pessoas. O servidor tira usuário e org do JWT; o front só diz
// QUAL instância abriu. `ping` existe porque aba fechada no tapa nunca manda `close`.
export const moduleSessions = {
  open: async (clientModuleId: string, mode?: string) =>
    api.post<{ id: string; started_at: string }>(`/api/delivery/module-sessions/open`, { clientModuleId, mode }),
  ping: async (id: string) => api.post(`/api/delivery/module-sessions/${id}/ping`, {}),
  close: async (id: string) => api.post(`/api/delivery/module-sessions/${id}/close`, {}),
  summary: async (dias = 30, orgId?: string) =>
    api.get<any[]>(`/api/delivery/module-sessions/summary?dias=${dias}${orgId ? `&org=${orgId}` : ""}`),
};

export const delivery = { clientModules, implementations, systemHealth, projectTasks, moduleCredentials, clientServices, userModules, userScreens, selfService, moduleSessions };
