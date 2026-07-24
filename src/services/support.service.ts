// ============================================================================
// Bounded context: SUPPORT — tickets, ações pendentes, incidentes, notificações.
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// Abrir chamado e notificar o cliente também passam pela API (as Edge Functions foram
// aposentadas em 14/07 — liam a chave do Resend em texto plano; agora vem do cofre).
// ============================================================================
import { api } from "../lib/api";
import { errorMessage } from "./core/result";
import type { Ticket, PendingAction } from "./core/types";

export const tickets = {
  listMine: async () => api.get<Ticket[]>(`/api/support/tickets/mine`),
  /** Abre um chamado (kind='support') ou solicitação de implantação. A org vem da RLS. */
  open: async (body: { subject: string; description?: string; kind?: string; attachments?: { name: string; key: string; url?: string | null }[] }): Promise<{ ok: boolean; number?: string; notified?: boolean; confirmed?: boolean; error?: string }> => {
    try { return await api.post(`/api/support/tickets`, body); } catch (e) { return { ok: false, error: errorMessage(e) }; }
  },
  /** Admin: chamados por tipo (RLS admin = tudo). */
  listAll: async (kind?: string) => api.get<Record<string, any>[]>(`/api/support/tickets${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`),
  /** Admin: muda o status do chamado. */
  setStatus: async (id: string, status: string) => api.patch(`/api/support/tickets/${id}/status`, { status }),
  /** Admin: avisa o cliente por e-mail e atualiza o status. */
  notify: async (ticketId: string, template: "resolved" | "received"): Promise<{ ok: boolean; status?: string; email?: string; email_sent?: boolean; email_error?: string; error?: string }> => {
    try { return await api.post(`/api/support/tickets/${ticketId}/notify`, { template }); } catch (e) { return { ok: false, error: errorMessage(e) }; }
  },
};

export const pendingActions = {
  listMine: async () => api.get<PendingAction[]>(`/api/support/pending-actions/mine`),
};

export const support = { tickets, pendingActions };
