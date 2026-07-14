// ============================================================================
// Bounded context: SUPPORT — tickets, ações pendentes, incidentes, notificações.
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// Abrir chamado e notificar cliente ficam em Edge Functions (server-side).
// ============================================================================
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import type { Ticket, PendingAction } from "./core/types";

export const tickets = {
  listMine: async () => api.get<Ticket[]>(`/api/support/tickets/mine`),
  /** Abre um chamado (kind='support') ou solicitação de implantação — Edge Function. */
  open: async (body: { subject: string; description?: string; kind?: string }): Promise<{ ok: boolean; number?: string; notified?: boolean; confirmed?: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("client-support-ticket", { body });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
  /** Admin: chamados por tipo (RLS admin = tudo). */
  listAll: async (kind?: string) => api.get<Record<string, any>[]>(`/api/support/tickets${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`),
  /** Admin: muda o status do chamado. */
  setStatus: async (id: string, status: string) => api.patch(`/api/support/tickets/${id}/status`, { status }),
  /** Admin: avisa o cliente por e-mail e atualiza o status — Edge Function. */
  notify: async (ticketId: string, template: "resolved" | "received"): Promise<{ ok: boolean; status?: string; email?: string; email_sent?: boolean; email_error?: string; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("admin-ticket-notify", { body: { ticket_id: ticketId, template } });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
};

export const pendingActions = {
  listMine: async () => api.get<PendingAction[]>(`/api/support/pending-actions/mine`),
};

export const support = { tickets, pendingActions };
