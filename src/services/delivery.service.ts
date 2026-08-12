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

// Ficha do colaborador ("Editar Colaborador"): access_level (4 papéis) + WhatsApp + RH.
// Um só par p/ cliente e admin — o backend valida dono/admin-level (gerenciaModulos).
export type CollaboratorTeam = {
  cpf_cnpj?: string | null; telefone?: string | null; cargo?: string | null; departamento?: string | null;
  salario?: number | string | null; data_admissao?: string | null; tipo_contrato?: string | null;
  cnpj_vinculado?: string | null; observacoes?: string | null;
};
export type CollaboratorInfo = { access_level: string | null; wa_sender_name: string | null; wa_number: string | null; team: CollaboratorTeam };
// Linha da LISTA de colaboradores (Gestão de Acessos) — perfil + ficha + último acesso, num JOIN.
export type CollaboratorRow = {
  id: string; full_name: string | null; email: string | null; role: string;
  access_level: string | null; active: boolean;
  cargo: string | null; departamento: string | null; tipo_contrato: string | null; telefone: string | null;
  last_login: string | null;
};
// Auto-edição: o próprio usuário lê/edita os SEUS dados (tela Configurações). Só o que é dele
// (contato + nome de exibição no WhatsApp); cargo/departamento/tipo vêm read-only (o admin define).
export type MyCollab = { wa_sender_name: string | null; wa_number: string | null; team: { cpf_cnpj?: string | null; telefone?: string | null; cargo?: string | null; departamento?: string | null; tipo_contrato?: string | null } };
export const myCollaborator = {
  get: async () => api.get<MyCollab>(`/api/delivery/my-collaborator`),
  set: async (b: { wa_sender_name?: string | null; wa_number?: string | null; team?: { cpf_cnpj?: string | null; telefone?: string | null } }) =>
    api.post<{ ok?: boolean; error?: string }>(`/api/delivery/my-collaborator`, b),
};
export const collaborator = {
  get: async (userId: string) => api.get<CollaboratorInfo>(`/api/delivery/collaborator?user=${encodeURIComponent(userId)}`),
  set: async (userId: string, b: { access_level?: string | null; wa_sender_name?: string | null; wa_number?: string | null; team?: CollaboratorTeam }) =>
    api.post<{ ok?: boolean; error?: string }>(`/api/delivery/collaborator`, { user_id: userId, ...b }),
  list: async (orgId: string) => api.get<{ collaborators: CollaboratorRow[]; error?: string }>(`/api/delivery/collaborators?org=${encodeURIComponent(orgId)}`),
  setActive: async (userId: string, active: boolean) => api.post<{ ok?: boolean; active?: boolean; error?: string }>(`/api/delivery/collaborator/active`, { user_id: userId, active }),
};

// Subtelas do WhatsApp CRM por usuário — caminho DONO/ADMIN (proxy interno p/ o wacrm).
// Espelha o shape de crmAccess.crmScreens, mas passa pela guarda do delivery (não exige admin).
export const crmScreens = {
  get: async (userId: string) =>
    api.get<{ catalog: { key: string; label: string }[]; has_access: boolean; owner: boolean; screens: string[] | null; error?: string }>(`/api/delivery/crm-screens?user=${encodeURIComponent(userId)}`),
  set: async (userId: string, screens: string[]) => api.post<{ ok?: boolean; screens?: string[]; error?: string }>(`/api/delivery/crm-screens`, { user_id: userId, screens }),
};

// Agentes da empresa + de quais o colaborador é RESPONSÁVEL (aprovação in-system) — caminho do cliente
// (dono/admin), pela guarda do delivery. A dúvida da IA chega ao responsável na Minha Mesa + sino.
export const crmAgents = {
  list: async (userId: string) =>
    api.get<{ agents: { id: string; name: string }[]; responsible_agents: string[]; error?: string }>(`/api/delivery/crm-agents?user=${encodeURIComponent(userId)}`),
  setResponsibles: async (userId: string, responsible_agents: string[]) =>
    api.post<{ ok?: boolean; responsible_agents?: string[]; error?: string }>(`/api/delivery/crm-responsibles`, { user_id: userId, responsible_agents }),
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
  // Log de acessos (eventos individuais, mais recente primeiro) — a "trilha em tempo real".
  recent: async (dias = 30, orgId?: string, limit = 60) =>
    api.get<any[]>(`/api/delivery/module-sessions/recent?dias=${dias}&limit=${limit}${orgId ? `&org=${orgId}` : ""}`),
};

// COCKPIT · "Meus Resultados" (Fase 1) — consolida os dados de RESULTADO do cliente.
// O "depois" das métricas vem AO VIVO do wacrm; o "antes" (baseline declarado) entra no item 1.3
// (por ora null → o front mostra a evolução/trend). Sem fonte = null → a tela vira "—", nunca inventa.
export type CockpitMetric = { key: string; label: string; unidade: string; melhor: "maior" | "menor"; antes: number | null; fonte_antes: string | null; depois: number | null; trend: number | null };
export type KpiAnalise = { tom: "green" | "amber" | "red"; motivo: string; impacto: string; acao: string };
export type CockpitKpis = {
  funil: { prospecto: number; prospecto_in: number; lead: number; lead_in: number; lead_frios: number; lead_frios_in: number; lead_mornos: number; lead_mornos_in: number; lead_quentes: number; lead_quentes_in: number; oportunidade: number; oportunidade_in: number; ganho: number; ganho_in: number; perdido: number; perdido_in: number } | null;
  sla: { pct5: number | null; mediana_s: number; respondidas: number; sem_resposta: number } | null;
  pico: number[][] | null;
  roi_horas_ia: number | null;
  horas_equipe_mes: number | null;
  analises?: Record<string, KpiAnalise> | null; // sugestão da IA (DeepSeek) por card; null até gerar
};
export type CockpitMine = {
  metrics: CockpitMetric[];
  volume: { label: string; n: number }[];
  kpis?: CockpitKpis | null;
  jornada: { happened_at: string; title: string; detail: string | null; module_name: string | null }[];
  conquistas: { titulo: string; status: string | null; rollout_status: string | null; tipo: "module" | "service" }[];
  narrativa: any | null;
  identity: { full_name: string | null; org_name: string | null; cargo: string | null } | null;
  fontes: { crm: boolean; agent: boolean };
};
export type CollabRow = { kind: "human" | "ai"; id: string | null; nome: string; tmed: number | null; convs: number; respostas: number; last_seen_at: string | null; status?: string | null };
// Leads (drill do card "Leads / mês") — farol interesse (interested/declined/unknown) + funil (whatsapp.leads).
export type LeadRow = { id: string; nome: string; phone: string | null; email: string | null; company: string | null; created_at: string; convs: number; interest: string; funil_status: string | null; valor: number | null; potencial?: string | null; potencial_motivo?: string | null };
export type LeadConversa = { id: string; interest: string | null; status: string | null; msgs: number; last_inbound: string | null; last_outbound: string | null };
export type LeadDetail = { nome: string; phone: string | null; email: string | null; company: string | null; interest: string; funil_status: string | null; valor: number | null; conversas: LeadConversa[]; potencial?: string | null; potencial_motivo?: string | null };
// Relógio de ponto (Fase A): tempo logado real por colaborador (min = minutos) + presença online.
export type HoursRow = { id: string; nome: string; email: string | null; online: boolean; last_seen_at: string | null; min_hoje: number; min_semana: number; min_mes: number; min_periodo: number; sessoes: number; ultimo: string | null };
export type SessionRow = { id: string; login: string; logout: string; minutos: number };
export const cockpit = {
  getMine: async (from?: string | null, to?: string | null, agent?: string | null) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (agent) qs.set("agent", agent);
    const s = qs.toString();
    return api.get<CockpitMine>(`/api/delivery/cockpit/mine${s ? `?${s}` : ""}`);
  },
  // Lista de agentes da org p/ o seletor do filtro (Fatia B).
  agents: async () => api.get<{ rows: { id: string; name: string }[] }>(`/api/delivery/cockpit/agents`),
  // Drill-down (Fase 1): tempo de resposta por colaborador — chamar em loop (~30s) p/ ficar ao vivo.
  // from/to = período (YYYY-MM-DD); sem eles o backend usa os últimos 30 dias.
  responseBreakdown: async (from?: string | null, to?: string | null) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const s = qs.toString();
    return api.get<{ rows: CollabRow[] }>(`/api/delivery/cockpit/response-breakdown${s ? `?${s}` : ""}`);
  },
  // Drill do card "Atendimentos feitos pela IA": SÓ agentes de IA, todos da empresa. Loop ~30s.
  aiAgents: async (from?: string | null, to?: string | null) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const s = qs.toString();
    return api.get<{ rows: CollabRow[] }>(`/api/delivery/cockpit/ai-agents${s ? `?${s}` : ""}`);
  },
  // Drill do card "Leads / mês": lista paginada (abas) + farol. page = índice da aba (0-based).
  leads: async (from?: string | null, to?: string | null, q?: string | null, page = 0) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (q && q.trim()) qs.set("q", q.trim());
    if (page) qs.set("page", String(page));
    const s = qs.toString();
    return api.get<{ rows: LeadRow[]; total: number; pageSize: number }>(`/api/delivery/cockpit/leads${s ? `?${s}` : ""}`);
  },
  // Detalhe do lead (master-detail): cabeçalho + interesse/funil + conversas.
  lead: async (id: string) => api.get<LeadDetail | null>(`/api/delivery/cockpit/lead/${id}`),
  // Classifica em lote o POTENCIAL (quente/morno/frio) dos leads do período sem classificação (IA).
  // Chamar em loop até remaining=0 → o farol enche progressivamente. Retorna {done, remaining, total}.
  leadsClassificar: async (from?: string | null, to?: string | null) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const s = qs.toString();
    return api.post<{ done: number; remaining: number; total: number }>(`/api/psique/leads/classificar${s ? `?${s}` : ""}`, {});
  },
  // Resumo IA da conversa do lead (DeepSeek). GET lê o cache; gerar chama o modelo (force regenera).
  leadResumoGet: async (id: string) => api.get<{ summary: string | null; generated_at: string | null }>(`/api/psique/lead/${id}/resumo`),
  leadResumoGerar: async (id: string, force = false) => api.post<{ ok: boolean; summary?: string; generated_at?: string; cached?: boolean; error?: string }>(`/api/psique/lead/${id}/resumo${force ? "?force=1" : ""}`, {}),
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
  // Drill-down de HORAS (relógio de ponto): tempo logado por colaborador — loop ~30s p/ ficar ao vivo.
  // from/to = período (YYYY-MM-DD); as janelas hoje/semana/mês são fixas no backend.
  hoursBreakdown: async (from?: string | null, to?: string | null) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const s = qs.toString();
    return api.get<{ rows: HoursRow[] }>(`/api/delivery/cockpit/hours-breakdown${s ? `?${s}` : ""}`);
  },
  // Drill-down de HORAS (nível 2): as sessões (login/logout) de um colaborador no período.
  collabSessions: async (id: string, from?: string | null, to?: string | null) => {
    const qs = new URLSearchParams();
    qs.set("id", id);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return api.get<{ rows: SessionRow[] }>(`/api/delivery/cockpit/collab-sessions?${qs.toString()}`);
  },
};
export type ConvRow = { id: string; nome: string; phone: string | null; aguardando: boolean; last_inbound: string | null; last_outbound: string | null };

// Mini-cockpit do WhatsApp CRM — pulso ao vivo (agentes online, conversas ativas, fila, IA hoje).
export type CrmLive = { agentesOnline: number; agentesTotal: number; conversasAtivas: number; fila: number; automacaoHoje: number | null };
export const crmLive = {
  getMine: async () => api.get<CrmLive | null>(`/api/delivery/crm-live/mine`),
};

// Heartbeat de ATIVIDADE REAL do Portal (relógio de ponto — lado Portal). O App dispara ~1/min só
// com mouse/teclado; o backend carimba delivery.user_sessions. Fire-and-forget.
export const userSession = {
  heartbeat: async () => api.post(`/api/delivery/heartbeat`, {}),
  close: async () => api.post(`/api/delivery/session-close`, {}),
};

export const delivery = { clientModules, implementations, systemHealth, projectTasks, moduleCredentials, clientServices, userModules, userScreens, collaborator, myCollaborator, crmScreens, crmAgents, selfService, moduleSessions, teamUsage, meetings, implEvents, agentUsage, cockpit, crmLive, userSession };
