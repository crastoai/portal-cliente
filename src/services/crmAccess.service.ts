// ============================================================================
// Ponte Portal ↔ WhatsApp CRM — acesso do cliente ao CRM (admin-only).
// Não é um bounded context: é integração. O dado (agentes, usuários do CRM) vive
// no CRM; a Portal API é quem conversa com ele — a tela nunca fala com o CRM direto.
// ============================================================================
import { api } from "../lib/api";

export type CrmAgent = { id: string; name: string; status?: string | null; plan?: string | null };
export type CrmUser = {
  id: string; email: string; full_name: string | null;
  role: "client_owner" | "client_member" | "crasto_admin";
  created_at?: string; last_seen_at?: string | null; online?: boolean;
  crm_screens?: string[] | null;
};
export type CrmAccessOverview = {
  enabled: boolean;
  module: { id: string; name: string } | null;
  agent_id: string | null;
  agents: CrmAgent[];
  users: CrmUser[];
  crm_url: string;
  crm_error?: string | null;
};

export const crmAccess = {
  overview: (orgId: string) => api.get<CrmAccessOverview>(`/api/crm-access/${orgId}`),
  // Status dos agentes de todos os clientes (federado do wacrm) → coluna "Agente" da Visão Geral.
  agentsOverview: () => api.get<Record<string, { agentes: number; no_ar: number; farol: string }>>(`/api/crm-access/agents-overview`),
  // "Entrar no CRM": OTP de uso único (magiclink) para o próprio admin. O CRM troca por
  // sessão na origem dele. Nunca devolve/transporta o bearer.
  enter: () => api.post<{ token: string; type: string }>(`/api/crm-access/enter`),
  linkAgent: (orgId: string, agentId: string | null) => api.put(`/api/crm-access/${orgId}/agent`, { agent_id: agentId }),
  invite: (orgId: string, b: { email: string; full_name?: string; role?: string }) =>
    api.post<{ user: CrmUser; email_sent: boolean; email_error?: string; password_link_sent: boolean }>(`/api/crm-access/${orgId}/users`, b),
  // Telas do WhatsApp CRM de um usuário (o dono vê tudo e não é configurável).
  crmScreens: (orgId: string, userId: string) =>
    api.get<{ catalog: { key: string; label: string }[]; has_access: boolean; owner: boolean; screens: string[] | null; error?: string }>(`/api/crm-access/${orgId}/users/${userId}/crm-screens`),
  setCrmScreens: (orgId: string, userId: string, screens: string[]) =>
    api.post<{ ok?: boolean; screens?: string[]; error?: string }>(`/api/crm-access/${orgId}/users/${userId}/crm-screens`, { screens }),
  update: (orgId: string, userId: string, b: { full_name?: string; email?: string; role?: string }) =>
    api.patch<{ ok: boolean; email_changed: boolean }>(`/api/crm-access/${orgId}/users/${userId}`, b),
  resend: (orgId: string, userId: string) => api.post<{ ok: boolean; password_link_sent: boolean }>(`/api/crm-access/${orgId}/users/${userId}/resend`),
  revoke: (orgId: string, userId: string) => api.del(`/api/crm-access/${orgId}/users/${userId}`),
};
