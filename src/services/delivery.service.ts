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
  attach: async (orgId: string, svc: { id: string; name?: string; description?: string | null; category?: string | null; unit?: string | null }, extra?: Record<string, any>) =>
    api.post(`/api/delivery/services`, { organization_id: orgId, service_id: svc.id, service_name: svc.name ?? null, service_description: svc.description ?? null, service_category: svc.category ?? null, service_unit: svc.unit ?? null, ...(extra || {}) }),
  update: async (id: string, patch: Record<string, any>) => api.patch(`/api/delivery/services/${id}`, patch),
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

// Base de conhecimento do cliente — reuniões & minutas. Admin registra; cliente só lê as da
// própria empresa (RLS). Nada fictício: nasce vazio e só mostra o que a Crasto.AI registrou.
export type Meeting = { id: string; meeting_at: string; title: string; attendees: string | null; summary: string | null; transcript: string | null; created_by_name: string | null; created_at?: string };
export const meetings = {
  listMine: async () => api.get<Meeting[]>(`/api/delivery/meetings/mine`),
  listByOrg: async (orgId: string) => api.get<Meeting[]>(`/api/delivery/meetings?org=${orgId}`),
  create: async (b: { organization_id: string; meeting_at: string; title: string; attendees?: string; summary?: string; transcript?: string }) =>
    api.post<{ ok?: boolean; id?: string; error?: string }>(`/api/delivery/meetings`, b),
  remove: async (id: string) => api.del(`/api/delivery/meetings/${id}`),
};

// Histórico de implantação — o quê / quando / QUEM implantou. Admin registra; o cliente vê no
// card "Implantação". Nada fictício: nasce vazio e só mostra os marcos que a Crasto.AI registrou.
export type ImplEvent = { id: string; happened_at: string; title: string; detail: string | null; performed_by_name: string | null; created_by_name: string | null; module_name: string | null; client_module_id?: string | null };
export const implEvents = {
  listMine: async () => api.get<ImplEvent[]>(`/api/delivery/impl-events/mine`),
  listByOrg: async (orgId: string) => api.get<ImplEvent[]>(`/api/delivery/impl-events?org=${orgId}`),
  create: async (b: { organization_id: string; client_module_id?: string | null; happened_at: string; title: string; detail?: string; performed_by_name?: string }) =>
    api.post<{ ok?: boolean; id?: string; error?: string }>(`/api/delivery/impl-events`, b),
  remove: async (id: string) => api.del(`/api/delivery/impl-events/${id}`),
};

// Tempo conectado da equipe (RH) — dado real de user_sessions (wacrm), federado. O dono vê a
// equipe; o membro vê só o próprio. Quem nunca usou aparece com 0min (real, não some).
export const teamUsage = {
  getMine: async () => api.get<{ scope: "team" | "self" | "none"; rows: { id: string; email: string; full_name: string | null; online: boolean; sessoes: number; minutos: number; ultimo: string | null }[] }>(`/api/delivery/team-usage`),
};

// Uso REAL do agente de IA (federado do wacrm) — taxa de automação das respostas (ai/(ai+human))
// nos últimos 30 dias + conversas conduzidas pela IA. Sem CRM/atividade → hasData=false → "—".
export type AgentUsage = { hasData: boolean; days?: number; automationPct?: number | null; aiMessages?: number; humanMessages?: number; inboundMessages?: number; aiConversations?: number; humanConversations?: number };
export const agentUsage = {
  getMine: async () => api.get<AgentUsage>(`/api/delivery/agent-usage`),
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

// COCKPIT · "Meus Resultados" (Fase 1) — consolida os dados de RESULTADO do cliente.
// O "depois" das métricas vem AO VIVO do wacrm; o "antes" (baseline declarado) entra no item 1.3
// (por ora null → o front mostra a evolução/trend). Sem fonte = null → a tela vira "—", nunca inventa.
export type CockpitMetric = { key: string; label: string; unidade: string; melhor: "maior" | "menor"; antes: number | null; fonte_antes: string | null; depois: number | null; trend: number | null };
export type CockpitMine = {
  metrics: CockpitMetric[];
  volume: { label: string; n: number }[];
  jornada: { happened_at: string; title: string; detail: string | null; module_name: string | null }[];
  conquistas: { titulo: string; status: string | null; rollout_status: string | null; tipo: "module" | "service" }[];
  narrativa: any | null;
  identity: { full_name: string | null; org_name: string | null; cargo: string | null } | null;
  fontes: { crm: boolean; agent: boolean };
};
export type CollabRow = { kind: "human" | "ai"; id: string | null; nome: string; tmed: number | null; convs: number; respostas: number; last_seen_at: string | null };
export const cockpit = {
  getMine: async () => api.get<CockpitMine>(`/api/delivery/cockpit/mine`),
  // Drill-down (Fase 1): tempo de resposta por colaborador — chamar em loop (~30s) p/ ficar ao vivo.
  // from/to = período (YYYY-MM-DD); sem eles o backend usa os últimos 30 dias.
  responseBreakdown: async (from?: string | null, to?: string | null) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const s = qs.toString();
    return api.get<{ rows: CollabRow[] }>(`/api/delivery/cockpit/response-breakdown${s ? `?${s}` : ""}`);
  },
  // Drill-down (Fase 2): as conversas de um colaborador — clicar abre /chat/<id> no CRM.
  // from/to = mesmo período do nível 1; q = busca por lead (nome/telefone).
  collabConversations: async (kind: string, id: string | null, from?: string | null, to?: string | null, q?: string | null) => {
    const qs = new URLSearchParams();
    qs.set("kind", kind);
    if (id) qs.set("id", id);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (q && q.trim()) qs.set("q", q.trim());
    return api.get<{ rows: ConvRow[] }>(`/api/delivery/cockpit/collab-conversations?${qs.toString()}`);
  },
};
export type ConvRow = { id: string; nome: string; phone: string | null; aguardando: boolean; last_inbound: string | null; last_outbound: string | null };

// Mini-cockpit do WhatsApp CRM — pulso ao vivo (agentes online, conversas ativas, fila, IA hoje).
export type CrmLive = { agentesOnline: number; agentesTotal: number; conversasAtivas: number; fila: number; automacaoHoje: number | null };
export const crmLive = {
  getMine: async () => api.get<CrmLive | null>(`/api/delivery/crm-live/mine`),
};

export const delivery = { clientModules, implementations, systemHealth, projectTasks, moduleCredentials, clientServices, userModules, userScreens, selfService, moduleSessions, teamUsage, meetings, implEvents, agentUsage, cockpit, crmLive };
