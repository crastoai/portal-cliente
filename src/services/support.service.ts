// ============================================================================
// Bounded context: SUPPORT (schema support) — tickets e ações pendentes.
// Leituras "mine" via RLS do usuário logado.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrapList } from "./core/result";
import type { Ticket, PendingAction } from "./core/types";

const sup = () => supabase.schema("support");

export const tickets = {
  listMine: async () =>
    unwrapList<Ticket>(await sup().from("tickets").select("id,subject,status").order("created_at", { ascending: false })),
  /** Abre um chamado: grava + notifica o suporte + confirma ao cliente (edge function). */
  open: async (body: { subject: string; description?: string }): Promise<{ ok: boolean; number?: string; notified?: boolean; confirmed?: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("client-support-ticket", { body });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
};

export const pendingActions = {
  listMine: async () =>
    unwrapList<PendingAction>(await sup().from("pending_actions").select("id,type,description,status").order("status", { ascending: false })),
};

export const support = { tickets, pendingActions };
