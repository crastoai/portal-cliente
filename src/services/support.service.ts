// ============================================================================
// Bounded context: SUPPORT (schema support) — tickets e ações pendentes.
// Leituras "mine" via RLS do usuário logado.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList } from "./core/result";
import { scopeMine } from "./core/scope";
import type { Ticket, PendingAction } from "./core/types";

const sup = () => supabase.schema("support");

export const tickets = {
  listMine: async () =>
    unwrapList<Ticket>(await scopeMine(sup().from("tickets").select("id,subject,status").order("created_at", { ascending: false }))),
  /** Abre um chamado: grava + notifica o suporte + confirma ao cliente (edge function). */
  open: async (body: { subject: string; description?: string }): Promise<{ ok: boolean; number?: string; notified?: boolean; confirmed?: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("client-support-ticket", { body });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
  /** Admin: todos os chamados (com nome do cliente). RLS admin = tudo. */
  listAll: async () =>
    unwrapList<Record<string, any>>(await sup().from("tickets").select("id,subject,description,status,organization_id,created_at").order("created_at", { ascending: false })),
  /** Admin: muda o status do chamado. */
  setStatus: async (id: string, status: string) => unwrap(await sup().from("tickets").update({ status }).eq("id", id)),
};

export const pendingActions = {
  listMine: async () =>
    unwrapList<PendingAction>(await scopeMine(sup().from("pending_actions").select("id,type,description,status").order("status", { ascending: false }))),
};

export const support = { tickets, pendingActions };
