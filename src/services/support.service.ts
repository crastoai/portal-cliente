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
};

export const pendingActions = {
  listMine: async () =>
    unwrapList<PendingAction>(await sup().from("pending_actions").select("id,type,description,status").order("status", { ascending: false })),
};

export const support = { tickets, pendingActions };
